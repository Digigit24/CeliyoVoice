import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Trash2, Copy, Check, AlertCircle, Server,
  ChevronDown, ChevronUp, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

// ── Types ────────────────────────────────────────────────────────────────────

interface McpKey {
  id: string;
  name: string;
  description: string | null;
  scope: 'ALL' | 'AGENT' | 'CUSTOM';
  agentId: string | null;
  agentName?: string;
  toolIds: string[];
  toolCount: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface NewKeyResponse {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  agentId: string | null;
  toolIds: string[];
  key: string;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
}

interface ToolItem {
  id: string;
  name: string;
  description: string;
}

type Scope = 'ALL' | 'AGENT' | 'CUSTOM';

// ── Helpers ──────────────────────────────────────────────────────────────────

function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-7 ${className ?? ''}`}
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

function slugify(name: string) {
  return `celiyo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function buildConfig(serverUrl: string, keyName: string, keyValue: string) {
  return JSON.stringify({
    mcpServers: {
      [slugify(keyName)]: {
        url: serverUrl,
        headers: { Authorization: `Bearer ${keyValue}` },
      },
    },
  }, null, 2);
}

function scopeLabel(key: McpKey) {
  if (key.scope === 'ALL') return `All tools (${key.toolCount})`;
  if (key.scope === 'AGENT') return `Agent: ${key.agentName ?? key.agentId} (${key.toolCount} tools)`;
  return `Custom (${key.toolCount} tools)`;
}

// ── Code block ───────────────────────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative rounded-md bg-zinc-900 dark:bg-zinc-950 p-4">
      <pre className="overflow-x-auto text-xs text-zinc-100 leading-relaxed">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyBtn text={code} />
      </div>
    </div>
  );
}

// ── Server card ───────────────────────────────────────────────────────────────

function ServerCard({
  k,
  serverUrl,
  connections,
  onEdit,
  onRevoke,
  defaultExpanded,
}: {
  k: McpKey;
  serverUrl: string;
  connections: number;
  onEdit: () => void;
  onRevoke: () => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const placeholderConfig = buildConfig(serverUrl, k.name, '<use-your-saved-key>');

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Server className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{k.name}</p>
                <Badge variant={k.isActive ? 'success' : 'secondary'} className="text-xs">
                  {k.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {k.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{k.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {scopeLabel(k)}
                {' · '}
                {connections > 0 ? (
                  <span className="text-green-600 dark:text-green-400">{connections} active connection{connections !== 1 ? 's' : ''}</span>
                ) : '0 connections'}
                {' · '}
                Last used: {formatDate(k.lastUsedAt)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRevoke}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick Setup toggle */}
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} Quick Setup
          </button>
          {expanded && (
            <div className="mt-2">
              <CodeBlock code={placeholderConfig} />
              <p className="mt-1 text-xs text-muted-foreground">
                Replace <code className="text-xs bg-muted px-1 rounded">&lt;use-your-saved-key&gt;</code> with the key you copied when creating this server.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────

interface DialogFormState {
  name: string;
  description: string;
  scope: Scope;
  agentId: string;
  selectedToolIds: string[];
}

function ServerDialog({
  open,
  onClose,
  mode,
  initial,
  agents,
  allTools,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initial?: Partial<DialogFormState>;
  agents: Agent[];
  allTools: ToolItem[];
  onSubmit: (data: DialogFormState) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'ALL');
  const [agentId, setAgentId] = useState(initial?.agentId ?? '');
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(initial?.selectedToolIds ?? []);

  // Reset on open
  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  const toggleTool = (id: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const isValid = name.trim().length > 0
    && (scope !== 'AGENT' || agentId !== '')
    && (scope !== 'CUSTOM' || selectedToolIds.length > 0);

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ name: name.trim(), description: description.trim(), scope, agentId, selectedToolIds });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create MCP Server' : 'Edit MCP Server'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Desktop — All Tools"
            />
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Exposes all CRM and billing tools"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Tool Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tools — expose every active tool</SelectItem>
                <SelectItem value="AGENT">Agent — only tools attached to a specific agent</SelectItem>
                <SelectItem value="CUSTOM">Custom — hand-pick specific tools</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'AGENT' && (
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === 'CUSTOM' && (
            <div className="space-y-2">
              <Label>Select tools <span className="text-muted-foreground font-normal">({selectedToolIds.length} of {allTools.length} selected)</span></Label>
              <div className="rounded-md border max-h-48 overflow-y-auto divide-y">
                {allTools.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No tools available</p>
                ) : (
                  allTools.map((t) => {
                    const selected = selectedToolIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${selected ? 'bg-muted/30' : ''}`}
                        onClick={() => toggleTool(t.id)}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'create' ? 'Create Server' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Post-creation reveal ──────────────────────────────────────────────────────

function CreatedKeyReveal({
  created,
  serverUrl,
  onDone,
}: {
  created: NewKeyResponse;
  serverUrl: string;
  onDone: () => void;
}) {
  const fullConfig = buildConfig(serverUrl, created.name, created.key);
  const toolScopeText = created.scope === 'ALL'
    ? 'All tools'
    : created.scope === 'AGENT'
      ? 'Agent scope'
      : `${(created.toolIds ?? []).length} tool${(created.toolIds ?? []).length !== 1 ? 's' : ''} selected`;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 p-3">
        <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 dark:text-yellow-300">
          Copy this key now — it will not be shown again.
        </p>
      </div>
      <div className="space-y-2">
        <Label>API Key</Label>
        <div className="flex items-center gap-2">
          <Input value={created.key} readOnly className="font-mono text-xs" />
          <CopyBtn text={created.key} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Claude Desktop / Cursor config</Label>
        <CodeBlock code={fullConfig} />
      </div>
      <p className="text-xs text-muted-foreground">
        Scope: {toolScopeText}
      </p>
      <Button onClick={onDone} className="w-full">Done</Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function McpConfig() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editKey, setEditKey] = useState<McpKey | null>(null);
  const [createdKey, setCreatedKey] = useState<NewKeyResponse | null>(null);
  const [newKeyRevealOpen, setNewKeyRevealOpen] = useState(false);
  const [latestCreatedId, setLatestCreatedId] = useState<string | null>(null);

  const serverUrl = `${window.location.origin}/mcp/sse`;

  const { data: keysData, isLoading } = useQuery<{ data: McpKey[] }>({
    queryKey: ['mcp-keys'],
    queryFn: () => api.get('/mcp/keys').then((r) => r.data),
  });

  const { data: agentsData } = useQuery<{ data: Agent[] }>({
    queryKey: ['agents-for-mcp'],
    queryFn: () => api.get('/agents', { params: { limit: 100 } }).then((r) => r.data),
  });

  const { data: toolsData } = useQuery<{ data: ToolItem[] }>({
    queryKey: ['tools-for-mcp'],
    queryFn: () => api.get('/tools', { params: { limit: 200, isActive: true } }).then((r) => r.data),
  });

  const { data: statsData } = useQuery<{ totalConnections: number; perKey: Record<string, number> }>({
    queryKey: ['mcp-stats'],
    queryFn: () => api.get('/mcp/stats', { baseURL: window.location.origin }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string; description?: string; scope: string; agentId?: string; toolIds: string[];
    }) => api.post('/mcp/keys', payload).then((r) => r.data.data as NewKeyResponse),
    onSuccess: (result) => {
      setCreatedKey(result);
      setLatestCreatedId(result.id);
      setNewKeyRevealOpen(true);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create server' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: {
      id: string;
      payload: { name: string; description?: string; scope: string; agentId?: string | null; toolIds: string[] };
    }) => api.put(`/mcp/keys/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      setEditKey(null);
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
      toast({ title: 'Server updated' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update server' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/mcp/keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
      toast({ title: 'Server revoked' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to revoke server' }),
  });

  const keys = keysData?.data ?? [];
  const agents = agentsData?.data ?? [];
  const allTools = (toolsData?.data ?? []) as ToolItem[];
  const perKey = statsData?.perKey ?? {};

  const handleCreate = (form: DialogFormState) => {
    createMutation.mutate({
      name: form.name,
      description: form.description || undefined,
      scope: form.scope,
      agentId: form.scope === 'AGENT' ? form.agentId : undefined,
      toolIds: form.scope === 'CUSTOM' ? form.selectedToolIds : [],
    });
  };

  const handleUpdate = (form: DialogFormState) => {
    if (!editKey) return;
    updateMutation.mutate({
      id: editKey.id,
      payload: {
        name: form.name,
        description: form.description || undefined,
        scope: form.scope,
        agentId: form.scope === 'AGENT' ? form.agentId : null,
        toolIds: form.scope === 'CUSTOM' ? form.selectedToolIds : [],
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each server uses a unique API key to expose a specific set of tools.
            Connect to Claude Desktop, Cursor, or any MCP-compatible client.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Server
        </Button>
      </div>

      {/* Shared server URL */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Server URL (shared by all servers)</p>
              <div className="mt-1 flex items-center gap-1">
                <code className="rounded bg-muted px-2 py-1 text-xs font-mono break-all">{serverUrl}</code>
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
          </div>
        </CardContent>
      </Card>

      {/* Server list */}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No MCP servers yet. Create one to connect an AI client.</p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create First Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <ServerCard
              key={k.id}
              k={k}
              serverUrl={serverUrl}
              connections={perKey[k.id] ?? 0}
              defaultExpanded={k.id === latestCreatedId && !newKeyRevealOpen}
              onEdit={() => setEditKey(k)}
              onRevoke={() => deleteMutation.mutate(k.id)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <ServerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        agents={agents}
        allTools={allTools}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* Edit dialog */}
      {editKey && (
        <ServerDialog
          open={!!editKey}
          onClose={() => setEditKey(null)}
          mode="edit"
          initial={{
            name: editKey.name,
            description: editKey.description ?? '',
            scope: editKey.scope,
            agentId: editKey.agentId ?? '',
            selectedToolIds: editKey.toolIds ?? [],
          }}
          agents={agents}
          allTools={allTools}
          onSubmit={handleUpdate}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Post-creation key reveal */}
      <Dialog open={newKeyRevealOpen} onOpenChange={(v) => { if (!v) setNewKeyRevealOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>MCP Server Created</DialogTitle>
          </DialogHeader>
          {createdKey && (
            <CreatedKeyReveal
              created={createdKey}
              serverUrl={serverUrl}
              onDone={() => setNewKeyRevealOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
