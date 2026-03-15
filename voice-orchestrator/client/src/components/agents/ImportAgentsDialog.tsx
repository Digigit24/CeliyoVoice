import { useState } from 'react';
import { Download, RefreshCw, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { useRemoteAgents, useImportAgent, useImportAllAgents } from '@/hooks/useAgentImport';
import type { RemoteAgent } from '@/hooks/useAgentImport';

interface ImportAgentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = 'omnidim' | 'bolna';

function ImportStatusBadge({ status }: { status: RemoteAgent['importStatus'] }) {
  if (status === 'imported') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3 w-3" />
        Imported
      </span>
    );
  }
  if (status === 'outdated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <Clock className="h-3 w-3" />
        Outdated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Not imported
    </span>
  );
}

function OmnidimTab({ isActive }: { isActive: boolean }) {
  const { data: agents, isLoading, error, refetch } = useRemoteAgents('omnidim', isActive);
  const importMutation = useImportAgent();
  const importAllMutation = useImportAllAgents();
  const [importingId, setImportingId] = useState<string | null>(null);

  const handleImport = async (agent: RemoteAgent) => {
    setImportingId(agent.providerAgentId);
    try {
      const result = await importMutation.mutateAsync(agent.providerAgentId);
      toast({
        title: result.action === 'created' ? 'Agent imported' : 'Agent updated',
        description: `"${result.agent.name}" has been ${result.action === 'created' ? 'imported' : 'synced'} successfully.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast({ variant: 'destructive', title: 'Import failed', description: message });
    } finally {
      setImportingId(null);
    }
  };

  const handleImportAll = async () => {
    try {
      const result = await importAllMutation.mutateAsync();
      toast({
        title: 'Bulk import complete',
        description: `Imported: ${result.imported}, Updated: ${result.updated}${result.failed.length > 0 ? `, Failed: ${result.failed.length}` : ''}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast({ variant: 'destructive', title: 'Bulk import failed', description: message });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isCredsMissing = message.includes('credentials') || message.includes('API key');
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {isCredsMissing ? 'Omnidim API key not configured' : 'Failed to load agents'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isCredsMissing
                ? 'Add your Omnidim API key in Settings → Providers to import agents.'
                : message}
            </p>
            {!isCredsMissing && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!agents?.length) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-muted-foreground">No agents found on Omnidim.</p>
      </div>
    );
  }

  const canImportAll = agents.some((a) => a.importStatus !== 'imported');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? 's' : ''} found</p>
        {canImportAll && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportAll}
            disabled={importAllMutation.isPending}
          >
            {importAllMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Import All
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto space-y-2">
        {agents.map((agent) => {
          const isImporting = importingId === agent.providerAgentId;
          return (
            <div
              key={agent.providerAgentId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{agent.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{agent.callType ?? 'Incoming'}</span>
                  <ImportStatusBadge status={agent.importStatus} />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-3 shrink-0"
                onClick={() => handleImport(agent)}
                disabled={isImporting || importMutation.isPending}
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : agent.importStatus === 'imported' ? (
                  <>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Re-sync
                  </>
                ) : (
                  <>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Import
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BolnaTab() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="text-center">
        <p className="text-sm font-medium">Bolna Import Coming Soon</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bolna agent import will be available in a future update.
        </p>
      </div>
    </div>
  );
}

export function ImportAgentsDialog({ open, onOpenChange }: ImportAgentsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('omnidim');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Agents</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab('omnidim')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'omnidim'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Omnidim
          </button>
          <button
            onClick={() => setActiveTab('bolna')}
            disabled
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground"
          >
            Bolna
            <span className="rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-xs">
              Soon
            </span>
          </button>
        </div>

        <div className="min-h-[12rem]">
          {activeTab === 'omnidim' ? <OmnidimTab isActive={open} /> : <BolnaTab />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
