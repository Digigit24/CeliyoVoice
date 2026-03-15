import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Loader2,
  Pencil,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/useToast';
import { useAgent, useUpdateAgent, useDeleteAgent, useSyncAgentById } from '@/hooks/useAgentDetail';

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const PROVIDER_COLORS: Record<string, string> = {
  OMNIDIM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BOLNA: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ agentId }: { agentId: string }) {
  const { data: agent, isLoading } = useAgent(agentId);
  const updateMutation = useUpdateAgent(agentId);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [welcomeDraft, setWelcomeDraft] = useState('');

  if (isLoading || !agent) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSavePrompt = async () => {
    try {
      await updateMutation.mutateAsync({ systemPrompt: promptDraft });
      setEditingPrompt(false);
      toast({ title: 'System prompt updated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update system prompt' });
    }
  };

  const handleSaveWelcome = async () => {
    try {
      await updateMutation.mutateAsync({ welcomeMessage: welcomeDraft });
      setEditingWelcome(false);
      toast({ title: 'Welcome message updated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update welcome message' });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[agent.provider] ?? 'bg-muted'}`}>
              {agent.provider}
            </span>
          </div>
          {agent.providerAgentId && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Provider ID</span>
              <span className="flex items-center font-mono text-xs">
                {agent.providerAgentId.slice(0, 16)}…
                <CopyButton text={agent.providerAgentId} />
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Language</span>
            <span>{agent.voiceLanguage}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Voice Model</span>
            <span>{agent.voiceModel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Call Type</span>
            <span>{agent.callType ?? 'Incoming'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="text-xs">{formatDate(agent.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Updated</span>
            <span className="text-xs">{formatDate(agent.updatedAt)}</span>
          </div>
          {agent.metadata?.importedFrom && (
            <>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Imported from</span>
                <span className="capitalize">{String(agent.metadata.importedFrom)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Imported at</span>
                <span className="text-xs">{formatDate(String(agent.metadata.importedAt ?? ''))}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Calls</span>
            <span className="font-medium">{agent._count.calls}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Successful Calls</span>
            <span className="font-medium">{agent.successfulCalls ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Duration</span>
            <span>{formatDuration(agent.avgDuration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Call</span>
            <span className="text-xs">{formatDate(agent.lastCallAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">System Prompt</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPromptDraft(agent.systemPrompt); setEditingPrompt(true); }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed">
            {agent.systemPrompt || 'No system prompt set.'}
          </pre>
        </CardContent>
      </Card>

      {/* Welcome Message */}
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Welcome Message</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setWelcomeDraft(agent.welcomeMessage ?? ''); setEditingWelcome(true); }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {agent.welcomeMessage || 'No welcome message set.'}
          </p>
        </CardContent>
      </Card>

      {/* Edit System Prompt Dialog */}
      <Dialog open={editingPrompt} onOpenChange={setEditingPrompt}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit System Prompt</DialogTitle></DialogHeader>
          <Textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            rows={10}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrompt(false)}>Cancel</Button>
            <Button onClick={handleSavePrompt} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Welcome Message Dialog */}
      <Dialog open={editingWelcome} onOpenChange={setEditingWelcome}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Welcome Message</DialogTitle></DialogHeader>
          <Textarea
            value={welcomeDraft}
            onChange={(e) => setWelcomeDraft(e.target.value)}
            rows={4}
            placeholder="Hello! How can I help you today?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWelcome(false)}>Cancel</Button>
            <Button onClick={handleSaveWelcome} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Provider Config tab ───────────────────────────────────────────────────────

function ProviderConfigTab({ agentId }: { agentId: string }) {
  const { data: agent } = useAgent(agentId);
  const syncMutation = useSyncAgentById(agentId);

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast({ title: 'Agent synced', description: 'Provider config updated successfully.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      toast({ variant: 'destructive', title: 'Sync failed', description: message });
    }
  };

  if (!agent) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Raw configuration imported from {agent.provider}.
        </p>
        {agent.providerAgentId && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Sync
          </Button>
        )}
      </div>

      {agent.providerConfig ? (
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-relaxed">
          {JSON.stringify(agent.providerConfig, null, 2)}
        </pre>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            No provider config stored. Import this agent to populate config.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Calls tab (stub) ──────────────────────────────────────────────────────────

function CallsTab() {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
      <div className="text-center">
        <Phone className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No calls yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Start a call to see activity here.
        </p>
      </div>
    </div>
  );
}

// ── Tools tab (stub) ──────────────────────────────────────────────────────────

function ToolsTab() {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
      <div className="text-center">
        <p className="text-sm font-medium">No tools configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tool assignment is coming in a future update.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const updateMutation = useUpdateAgent(id!);
  const deleteMutation = useDeleteAgent(id!);
  const syncMutation = useSyncAgentById(id!);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ isActive: checked });
      toast({ title: checked ? 'Agent activated' : 'Agent deactivated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update status' });
    }
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast({ title: 'Agent synced', description: 'Latest config fetched from provider.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      toast({ variant: 'destructive', title: 'Sync failed', description: message });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      toast({ title: 'Agent deleted' });
      navigate('/agents');
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete agent' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  const providerColor = PROVIDER_COLORS[agent.provider] ?? 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Agents
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">{agent.name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${providerColor}`}>
                  {agent.provider}
                </span>
                {agent.providerAgentId && (
                  <Badge variant="outline" className="text-xs">Synced</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="agent-active" className="text-sm">Active</Label>
            <Switch
              id="agent-active"
              checked={agent.isActive}
              onCheckedChange={handleToggleActive}
              disabled={updateMutation.isPending}
            />
          </div>

          {agent.providerAgentId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Sync
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Provider Config</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab agentId={id!} />
        </TabsContent>

        <TabsContent value="config">
          <ProviderConfigTab agentId={id!} />
        </TabsContent>

        <TabsContent value="calls">
          <CallsTab />
        </TabsContent>

        <TabsContent value="tools">
          <ToolsTab />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{agent.name}</strong>? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
