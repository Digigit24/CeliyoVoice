import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Trash2, Copy, Check, AlertCircle, Server,
  ChevronDown, ChevronUp, Pencil, Activity, Wifi, WifiOff,
  History, CheckCircle2, XCircle, Clock, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

interface Agent { id: string; name: string; }
interface ToolItem { id: string; name: string; description: string; }
type Scope = 'ALL' | 'AGENT' | 'CUSTOM';

interface Execution {
  id: string;
  toolId: string;
  toolName: string;
  source: string;
  success: boolean;
  latencyMs: number;
  responseStatus: number | null;
  cached: boolean;
  createdAt: string;
}

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

// ── Code block ────────────────────────────────────────────────────────────────

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
  recentExecs,
  onEdit,
  onRevoke,
  defaultExpanded,
}: {
  k: McpKey;
  serverUrl: string;
  connections: number;
  recentExecs: Execution[];
  onEdit: () => void;
  onRevoke: () => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showHistory, setShowHistory] = useState(false);
  const placeholderConfig = buildConfig(serverUrl, k.name, '<use-your-saved-key>');

  const successRate = recentExecs.length > 0
    ? Math.round((recentExecs.filter((e) => e.success).length / recentExecs.length) * 100)
    : null;

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
                {connections > 0 && (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <Wifi className="h-3 w-3" />
                    {connections} live
                  </span>
                )}
              </div>
              {k.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{k.description}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                <span>{scopeLabel(k)}</span>
                <span>Last used: {formatDate(k.lastUsedAt)}</span>
                {successRate !== null && (
                  <span className={successRate >= 90 ? 'text-green-600 dark:text-green-400' : successRate >= 70 ? 'text-yellow-600' : 'text-red-500'}>
                    {successRate}% success ({recentExecs.length} recent)
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRevoke}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Toggles */}
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} Setup
          </button>
          {recentExecs.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="h-3 w-3" />
              {showHistory ? 'Hide' : 'Show'} Recent Calls ({recentExecs.length})
            </button>
          )}
        </div>

        {expanded && (
          <div className="mt-3">
            <CodeBlock code={placeholderConfig} />
            <p className="mt-1 text-xs text-muted-foreground">
              Replace <code className="text-xs bg-muted px-1 rounded">&lt;use-your-saved-key&gt;</code> with the key you copied when creating this server.
            </p>
          </div>
        )}

        {showHistory && recentExecs.length > 0 && (
          <div className="mt-3 rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium">Tool</th>
                  <th className="px-3 py-1.5 text-left font-medium">Status</th>
                  <th className="px-3 py-1.5 text-left font-medium">Latency</th>
                  <th className="px-3 py-1.5 text-left font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentExecs.slice(0, 10).map((ex) => (
                  <tr key={ex.id} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono">{ex.toolName}</td>
                    <td className="px-3 py-1.5">
                      {ex.success ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" /> {ex.responseStatus ?? 'OK'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> {ex.responseStatus ?? 'Error'}
                        </span>
                      )}
                      {ex.cached && <span className="ml-1 text-muted-foreground">(cached)</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{ex.latencyMs}ms</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatDate(ex.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  open, onClose, mode, initial, agents, allTools, onSubmit, isPending,
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
  const [toolSearch, setToolSearch] = useState('');

  const filteredTools = allTools.filter(
    (t) => !toolSearch || t.name.toLowerCase().includes(toolSearch.toLowerCase()),
  );

  const toggleTool = (id: string) =>
    setSelectedToolIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const isValid = name.trim().length > 0
    && (scope !== 'AGENT' || agentId !== '')
    && (scope !== 'CUSTOM' || selectedToolIds.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create MCP Server' : 'Edit MCP Server'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Desktop — All Tools" />
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Exposes all CRM and billing tools" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Tool Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === 'CUSTOM' && (
            <div className="space-y-2">
              <Label>Select tools <span className="text-muted-foreground font-normal text-xs">({selectedToolIds.length} of {allTools.length} selected)</span></Label>
              <Input
                placeholder="Search tools..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="rounded-md border max-h-52 overflow-y-auto divide-y">
                {filteredTools.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No tools match</p>
                ) : (
                  filteredTools.map((t) => {
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
                          <p className="text-xs font-medium truncate font-mono">{t.name}</p>
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
          <Button onClick={() => onSubmit({ name: name.trim(), description: description.trim(), scope, agentId, selectedToolIds })} disabled={!isValid || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'create' ? 'Create Server' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Post-creation reveal ──────────────────────────────────────────────────────

function CreatedKeyReveal({ created, serverUrl, onDone }: {
  created: NewKeyResponse;
  serverUrl: string;
  onDone: () => void;
}) {
  const fullConfig = buildConfig(serverUrl, created.name, created.key);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 p-3">
        <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 dark:text-yellow-300">Copy this key now — it will not be shown again.</p>
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

  const { data: statsData, isLoading: loadingStats } = useQuery<{
    totalConnections: number;
    perKey: Record<string, number>;
  }>({
    queryKey: ['mcp-stats'],
    queryFn: () => api.get('/mcp/stats', { baseURL: window.location.origin }).then((r) => r.data),
    refetchInterval: 15000,
  });

  // Recent MCP executions (for history panel)
  const { data: mcpExecsData, isLoading: loadingMcpExecs } = useQuery<{
    data: Execution[]; pagination: { total: number };
  }>({
    queryKey: ['mcp-executions'],
    queryFn: () => api.get('/tools/executions', { params: { source: 'MCP', limit: 100 } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string; scope: string; agentId?: string; toolIds: string[] }) =>
      api.post('/mcp/keys', payload).then((r) => r.data.data as NewKeyResponse),
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
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; description?: string; scope: string; agentId?: string | null; toolIds: string[] } }) =>
      api.put(`/mcp/keys/${id}`, payload).then((r) => r.data),
    onSuccess: () => { setEditKey(null); queryClient.invalidateQueries({ queryKey: ['mcp-keys'] }); toast({ title: 'Server updated' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update server' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/mcp/keys/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mcp-keys'] }); toast({ title: 'Server revoked' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to revoke server' }),
  });

  const keys = keysData?.data ?? [];
  const agents = agentsData?.data ?? [];
  const allTools = (toolsData?.data ?? []) as ToolItem[];
  const perKey = statsData?.perKey ?? {};
  const totalConns = statsData?.totalConnections ?? 0;
  const allMcpExecs = mcpExecsData?.data ?? [];

  // Group recent MCP execs by key (using mcpKeyId field from execution — not present in list response, group by toolName for display)
  const recentExecsByKey: Record<string, Execution[]> = {};
  // Since list response doesn't include mcpKeyId, show all recent execs under "Monitor" tab
  // Per-server execs require mcpKeyId which isn't in list select — show globally for now

  const handleCreate = (form: DialogFormState) =>
    createMutation.mutate({
      name: form.name, description: form.description || undefined,
      scope: form.scope,
      agentId: form.scope === 'AGENT' ? form.agentId : undefined,
      toolIds: form.scope === 'CUSTOM' ? form.selectedToolIds : [],
    });

  const handleUpdate = (form: DialogFormState) => {
    if (!editKey) return;
    updateMutation.mutate({
      id: editKey.id,
      payload: {
        name: form.name, description: form.description || undefined, scope: form.scope,
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
            Each server uses a unique API key to expose a specific set of tools. Connect to Claude Desktop, Cursor, or any MCP-compatible client.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Server
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{keys.length}</p>
                <p className="text-xs text-muted-foreground">Servers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              {totalConns > 0 ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-xl font-bold">{loadingStats ? '…' : totalConns}</p>
                <p className="text-xs text-muted-foreground">Live connections</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{mcpExecsData?.pagination.total ?? '…'}</p>
                <p className="text-xs text-muted-foreground">MCP calls (total)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">
                  {allMcpExecs.length > 0
                    ? `${Math.round((allMcpExecs.filter((e) => e.success).length / allMcpExecs.length) * 100)}%`
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Success rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="servers">
        <TabsList>
          <TabsTrigger value="servers">
            <Server className="h-3.5 w-3.5 mr-1.5" />
            Servers ({keys.length})
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Monitor
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Call History
          </TabsTrigger>
        </TabsList>

        {/* ── Servers tab ──────────────────────────────────────────────────── */}
        <TabsContent value="servers" className="space-y-4 pt-2">
          {/* Shared URL card */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Server URL (shared by all)</p>
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

          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Server className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No MCP servers yet.</p>
                <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Create First Server
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
                  recentExecs={recentExecsByKey[k.id] ?? []}
                  defaultExpanded={k.id === latestCreatedId && !newKeyRevealOpen}
                  onEdit={() => setEditKey(k)}
                  onRevoke={() => deleteMutation.mutate(k.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Monitor tab ──────────────────────────────────────────────────── */}
        <TabsContent value="monitor" className="pt-2">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Real-time connection status per server. Refreshes every 15s.</p>
            {keys.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">No servers configured.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Server</th>
                      <th className="px-3 py-2 text-left font-medium">Scope</th>
                      <th className="px-3 py-2 text-left font-medium">Connections</th>
                      <th className="px-3 py-2 text-left font-medium">Last Used</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {keys.map((k) => {
                      const conns = perKey[k.id] ?? 0;
                      return (
                        <tr key={k.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div>
                              <p className="font-medium text-sm">{k.name}</p>
                              {k.description && <p className="text-xs text-muted-foreground">{k.description}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">
                              {k.scope === 'CUSTOM' && <Package className="h-3 w-3 mr-1" />}
                              {k.scope}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{scopeLabel(k)}</p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {conns > 0 ? (
                                <Wifi className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className={conns > 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                                {conns}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-muted-foreground">{formatDate(k.lastUsedAt)}</td>
                          <td className="px-3 py-2">
                            <Badge variant={k.isActive ? 'success' : 'secondary'}>
                              {k.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Call History tab ─────────────────────────────────────────────── */}
        <TabsContent value="history" className="pt-2">
          {loadingMcpExecs ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : allMcpExecs.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
              <History className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No MCP tool calls yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Showing last {allMcpExecs.length} MCP calls</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['mcp-executions'] })}
                >
                  Refresh
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Tool</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Latency</th>
                      <th className="px-3 py-2 text-left font-medium">Cached</th>
                      <th className="px-3 py-2 text-left font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allMcpExecs.map((ex) => (
                      <tr key={ex.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-medium">{ex.toolName}</td>
                        <td className="px-3 py-2">
                          {ex.success ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3 w-3" /> {ex.responseStatus ?? 'OK'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3 w-3" /> {ex.responseStatus ?? 'Error'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-mono ${ex.latencyMs > 3000 ? 'text-orange-500' : ex.latencyMs > 1000 ? 'text-yellow-500' : ''}`}>
                            {ex.latencyMs}ms
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {ex.cached ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <Clock className="h-2.5 w-2.5" /> cached
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(ex.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
            <CreatedKeyReveal created={createdKey} serverUrl={serverUrl} onDone={() => setNewKeyRevealOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
