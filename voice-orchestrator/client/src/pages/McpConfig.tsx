import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Trash2, Copy, Check, AlertCircle, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

interface McpKey {
  id: string;
  name: string;
  agentId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface NewKeyResponse {
  id: string;
  name: string;
  key: string;
  warning: string;
}

interface Agent {
  id: string;
  name: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function formatDate(d: string | null) {
  if (!d) return 'Never';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function McpConfig() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyAgentId, setNewKeyAgentId] = useState('');
  const [createdKey, setCreatedKey] = useState<NewKeyResponse | null>(null);

  const serverUrl = `${window.location.origin}/mcp/sse`;

  const { data: keysData, isLoading } = useQuery<{ success: boolean; data: McpKey[] }>({
    queryKey: ['mcp-keys'],
    queryFn: () => api.get('/mcp/keys').then((r) => r.data),
  });

  const { data: toolsData } = useQuery<{ success: boolean; pagination: { total: number } }>({
    queryKey: ['tools-count'],
    queryFn: () => api.get('/tools', { params: { limit: 1 } }).then((r) => r.data),
  });

  const { data: agentsData } = useQuery<{ success: boolean; data: Agent[] }>({
    queryKey: ['agents-for-mcp'],
    queryFn: () => api.get('/agents', { params: { limit: 50 } }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; agentId?: string }) =>
      api.post('/mcp/keys', payload).then((r) => r.data.data as NewKeyResponse),
    onSuccess: (result) => {
      setCreatedKey(result);
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
      toast({ title: 'API key created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create key' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/mcp/keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
      toast({ title: 'Key revoked' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to revoke key' }),
  });

  const keys = keysData?.data ?? [];
  const toolCount = toolsData?.pagination?.total ?? 0;
  const agents = agentsData?.data ?? [];

  const handleCreate = () => {
    if (!newKeyName) return;
    createMutation.mutate({ name: newKeyName, agentId: newKeyAgentId || undefined });
  };

  const claudeConfig = JSON.stringify({
    mcpServers: {
      celiyo: {
        url: serverUrl,
        headers: {
          Authorization: `Bearer ${createdKey?.key ?? '<your-mcp-api-key>'}`,
        },
      },
    },
  }, null, 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MCP Server</h1>
        <p className="text-sm text-muted-foreground">Connect external AI clients to your tools via the Model Context Protocol</p>
      </div>

      {/* Server Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Server URL</p>
              <div className="mt-1 flex items-center gap-1">
                <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{serverUrl}</code>
                <CopyBtn text={serverUrl} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Running</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tools Available</p>
              <p className="mt-1 text-sm font-medium">{toolCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">API Keys</CardTitle>
              <CardDescription>Authenticate MCP clients like Claude Desktop or Cursor</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setCreateOpen(true); setCreatedKey(null); setNewKeyName(''); setNewKeyAgentId(''); }}>
              <Plus className="h-4 w-4" />
              New Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No API keys. Create one to connect an MCP client.
            </p>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {k.agentId ? `Scoped to agent` : 'All tools'} · Last used: {formatDate(k.lastUsedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={k.isActive ? 'success' : 'secondary'}>
                      {k.isActive ? 'Active' : 'Revoked'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(k.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Setup — Claude Desktop</CardTitle>
          <CardDescription>Add to your claude_desktop_config.json:</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-md bg-zinc-900 dark:bg-zinc-950 p-4">
            <pre className="overflow-x-auto text-xs text-zinc-100 leading-relaxed">
              <code>{claudeConfig}</code>
            </pre>
            <div className="absolute top-2 right-2">
              <CopyBtn text={claudeConfig} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? 'Key Created' : 'Create MCP API Key'}</DialogTitle>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  Copy this key now — it won't be shown again.
                </p>
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <Input value={createdKey.key} readOnly className="font-mono text-xs" />
                  <CopyBtn text={createdKey.key} />
                </div>
              </div>
              <Button onClick={() => setCreateOpen(false)} className="w-full">Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Claude Desktop" />
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={newKeyAgentId || 'ALL'} onValueChange={(v) => setNewKeyAgentId(v === 'ALL' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All tools</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>Agent: {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!newKeyName || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Key'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
