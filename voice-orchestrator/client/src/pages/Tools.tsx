import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, Wrench, Pencil, Trash2, Upload, Zap, Lock,
  Key, ChevronDown, ChevronRight, Package, Tag, History,
  Globe, Link2, CheckCircle2, XCircle, Clock, Activity,
  Filter, Search, Boxes, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImportWizard } from '@/components/tools/ImportWizard';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolTag {
  id: string;
  tag: { id: string; name: string; color: string | null; isToolkit: boolean };
}

interface ToolCredentialRef {
  id: string;
  name: string;
  authType: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  toolType: string;
  endpoint: string | null;
  method: string;
  authType: string;
  isActive: boolean;
  source: string;
  category: string | null;
  inputSchema: unknown;
  importMeta: { collectionName?: string } | null;
  credentialId: string | null;
  credential: ToolCredentialRef | null;
  tags: ToolTag[];
  rateLimitPerMinute?: number | null;
  cacheTtlSeconds?: number | null;
  createdAt: string;
}

interface TagData {
  id: string;
  name: string;
  color: string | null;
  isToolkit: boolean;
  _count: { tools: number };
}

interface Credential {
  id: string;
  name: string;
  authType: string;
  service: string | null;
  isActive: boolean;
  _count?: { tools: number };
}

interface Execution {
  id: string;
  toolId: string;
  toolName: string;
  agentId: string | null;
  source: string;
  success: boolean;
  latencyMs: number;
  responseStatus: number | null;
  cached: boolean;
  errorMessage: string | null;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  MANUAL: 'bg-muted text-muted-foreground',
  CELIYO_IMPORT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SWAGGER_IMPORT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  MCP_IMPORT: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

const EXEC_SOURCE_COLORS: Record<string, string> = {
  CHAT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  MCP: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  VOICE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  TEST: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  DRY_RUN: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

const TYPE_ICON: Record<string, typeof Wrench> = {
  HTTP: Globe,
  FUNCTION: Zap,
  COMPOSITE: Link2,
};

function ToolIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? Wrench;
  return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const emptyForm = {
  name: '',
  description: '',
  toolType: 'HTTP',
  method: 'POST',
  endpoint: '',
  headers: '{}',
  bodyTemplate: '',
  authType: 'NONE',
  authConfig: '{}',
  inputSchema: '',
  category: '',
  functionName: '',
  isActive: true,
  rateLimitPerMinute: '',
  cacheTtlSeconds: '',
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Tools() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [historyToolId, setHistoryToolId] = useState<string | null>(null);
  const [execSourceFilter, setExecSourceFilter] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<{ success: boolean; data: Tool[]; pagination: { total: number } }>({
    queryKey: ['tools', search, sourceFilter, typeFilter],
    queryFn: () =>
      api.get('/tools', {
        params: { search: search || undefined, source: sourceFilter || undefined, toolType: typeFilter || undefined, limit: 200 },
      }).then((r) => r.data),
  });

  const { data: tagsData } = useQuery<{ success: boolean; data: TagData[] }>({
    queryKey: ['tool-tags'],
    queryFn: () => api.get('/tools/tags').then((r) => r.data),
  });

  const { data: credsData } = useQuery<{ success: boolean; data: Credential[] }>({
    queryKey: ['tool-credentials'],
    queryFn: () => api.get('/tools/credentials').then((r) => r.data),
  });

  const { data: execData, isLoading: loadingExecs } = useQuery<{
    success: boolean; data: Execution[]; pagination: { total: number };
  }>({
    queryKey: ['tool-executions', historyToolId, execSourceFilter],
    queryFn: () =>
      api.get('/tools/executions', {
        params: {
          toolId: historyToolId || undefined,
          source: execSourceFilter || undefined,
          limit: 50,
        },
      }).then((r) => r.data),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/tools', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tools'] }); setDialogOpen(false); toast({ title: 'Tool created' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create tool' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`/tools/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tools'] }); setDialogOpen(false); toast({ title: 'Tool updated' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update tool' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tools/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tools'] }); toast({ title: 'Tool deleted' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete tool' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/tools/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  const openCreate = () => { setEditTool(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (tool: Tool) => {
    setEditTool(tool);
    setForm({
      name: tool.name,
      description: tool.description,
      toolType: tool.toolType,
      method: tool.method,
      endpoint: tool.endpoint ?? '',
      headers: '{}',
      bodyTemplate: '',
      authType: tool.authType,
      authConfig: '{}',
      inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '',
      category: tool.category ?? '',
      functionName: '',
      isActive: tool.isActive,
      rateLimitPerMinute: tool.rateLimitPerMinute?.toString() ?? '',
      cacheTtlSeconds: tool.cacheTtlSeconds?.toString() ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description,
      toolType: form.toolType,
      method: form.method,
      isActive: form.isActive,
      category: form.category || undefined,
      rateLimitPerMinute: form.rateLimitPerMinute ? parseInt(form.rateLimitPerMinute) : null,
      cacheTtlSeconds: form.cacheTtlSeconds ? parseInt(form.cacheTtlSeconds) : null,
    };
    if (form.toolType === 'HTTP') payload.endpoint = form.endpoint;
    else if (form.toolType === 'FUNCTION') payload.functionName = form.functionName;
    if (form.inputSchema) {
      try { payload.inputSchema = JSON.parse(form.inputSchema); } catch { /* skip */ }
    }
    if (editTool) updateMutation.mutate({ id: editTool.id, payload });
    else createMutation.mutate(payload);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const tools = data?.data ?? [];
  const tags = tagsData?.data ?? [];
  const creds = credsData?.data ?? [];
  const executions = execData?.data ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  const toolkits = tags.filter((t) => t.isToolkit);
  const plainTags = tags.filter((t) => !t.isToolkit);

  const filteredTools = tagFilter
    ? tools.filter((t) => t.tags?.some((ta) => ta.tag.id === tagFilter))
    : tools;

  const collections = new Map<string, Tool[]>();
  for (const t of filteredTools) {
    const col = (t.importMeta as { collectionName?: string } | null)?.collectionName ?? 'Manual Tools';
    if (!collections.has(col)) collections.set(col, []);
    collections.get(col)!.push(t);
  }

  const activeTools = tools.filter((t) => t.isActive).length;
  const totalExecs = execData?.pagination.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-sm text-muted-foreground">
            {tools.length} tools · {activeTools} active · {toolkits.length} toolkits
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Tool
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 max-w-xs"
          />
        </div>
        <Select value={sourceFilter || 'ALL'} onValueChange={(v) => setSourceFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-40">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sources</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
            <SelectItem value="CELIYO_IMPORT">CTD Import</SelectItem>
            <SelectItem value="SWAGGER_IMPORT">Swagger</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'ALL'} onValueChange={(v) => setTypeFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="HTTP">HTTP</SelectItem>
            <SelectItem value="FUNCTION">Function</SelectItem>
            <SelectItem value="COMPOSITE">Composite</SelectItem>
          </SelectContent>
        </Select>
        {/* Tag filter chips */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 8).map((tag) => (
              <button
                key={tag.id}
                onClick={() => setTagFilter(tagFilter === tag.id ? '' : tag.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  tagFilter === tag.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                }`}
                style={tag.color && tagFilter !== tag.id ? { borderColor: tag.color, color: tag.color } : {}}
              >
                {tag.isToolkit && <Package className="h-2.5 w-2.5" />}
                {tag.name}
                <span className="opacity-60">({tag._count.tools})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            All Tools ({filteredTools.length})
          </TabsTrigger>
          <TabsTrigger value="collections">
            <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
            Collections ({collections.size})
          </TabsTrigger>
          <TabsTrigger value="toolkits">
            <Boxes className="h-3.5 w-3.5 mr-1.5" />
            Toolkits ({toolkits.length})
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="h-3.5 w-3.5 mr-1.5" />
            Tags ({plainTags.length})
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <Key className="h-3.5 w-3.5 mr-1.5" />
            Credentials ({creds.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            History {totalExecs > 0 ? `(${totalExecs})` : ''}
          </TabsTrigger>
        </TabsList>

        {/* ── All Tools ────────────────────────────────────────────────────── */}
        <TabsContent value="all">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
              <Wrench className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No tools found.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Import
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Create
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Tags</th>
                    <th className="px-3 py-2 text-left font-medium">Auth</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Limits</th>
                    <th className="px-3 py-2 text-center font-medium">Active</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTools.map((tool) => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      onEdit={openEdit}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v })}
                      onHistory={(id) => setHistoryToolId(id === historyToolId ? null : id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Collections ──────────────────────────────────────────────────── */}
        <TabsContent value="collections">
          <div className="space-y-3 pt-1">
            {Array.from(collections.entries()).map(([col, colTools]) => (
              <CollectionGroup key={col} name={col} tools={colTools} onEdit={openEdit} />
            ))}
            {collections.size === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No tools to group.</p>
            )}
          </div>
        </TabsContent>

        {/* ── Toolkits ─────────────────────────────────────────────────────── */}
        <TabsContent value="toolkits">
          <ToolkitsPanel toolkits={toolkits} tools={tools} allTags={tags} />
        </TabsContent>

        {/* ── Tags ─────────────────────────────────────────────────────────── */}
        <TabsContent value="tags">
          <TagsPanel tags={plainTags} />
        </TabsContent>

        {/* ── Credentials ──────────────────────────────────────────────────── */}
        <TabsContent value="credentials">
          <CredentialsPanel creds={creds} />
        </TabsContent>

        {/* ── History ──────────────────────────────────────────────────────── */}
        <TabsContent value="history">
          <HistoryPanel
            executions={executions}
            tools={tools}
            isLoading={loadingExecs}
            toolIdFilter={historyToolId}
            sourceFilter={execSourceFilter}
            onToolFilter={setHistoryToolId}
            onSourceFilter={setExecSourceFilter}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTool ? 'Edit Tool' : 'Create Tool'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="get_customer_info" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.toolType} onValueChange={(v) => setForm({ ...form, toolType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HTTP">HTTP</SelectItem>
                    <SelectItem value="FUNCTION">Built-in Function</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this tool does..." />
            </div>

            {form.toolType === 'HTTP' && (
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-2">
                  <Label>Endpoint URL</Label>
                  <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://api.example.com/..." className="font-mono text-xs" />
                </div>
              </div>
            )}

            {form.toolType === 'FUNCTION' && (
              <div className="space-y-2">
                <Label>Function Name</Label>
                <Select value={form.functionName || 'echo'} onValueChange={(v) => setForm({ ...form, functionName: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['echo', 'timestamp', 'json_extract', 'math'].map((fn) => (
                      <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Input Schema (JSON)</Label>
              <Textarea
                value={form.inputSchema}
                onChange={(e) => setForm({ ...form, inputSchema: e.target.value })}
                placeholder='{"type":"object","properties":{"query":{"type":"string","description":"..."}},"required":["query"]}'
                rows={5}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="CRM, Billing..." />
              </div>
              <div className="space-y-2">
                <Label>Rate Limit (req/min)</Label>
                <Input
                  type="number"
                  value={form.rateLimitPerMinute}
                  onChange={(e) => setForm({ ...form, rateLimitPerMinute: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label>Cache TTL (seconds)</Label>
                <Input
                  type="number"
                  value={form.cacheTtlSeconds}
                  onChange={(e) => setForm({ ...form, cacheTtlSeconds: e.target.value })}
                  placeholder="No cache"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.description}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editTool ? 'Save Changes' : 'Create Tool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// ── Tool Row ─────────────────────────────────────────────────────────────────

function ToolRow({ tool, onEdit, onDelete, onToggle, onHistory }: {
  tool: Tool;
  onEdit: (t: Tool) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, v: boolean) => void;
  onHistory: (id: string) => void;
}) {
  return (
    <tr className="hover:bg-muted/30 group">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <ToolIcon type={tool.toolType} />
          <div>
            <p className="font-medium font-mono text-xs">{tool.name}</p>
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{tool.description}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-[10px]">{tool.toolType}</Badge>
        {tool.endpoint && (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[120px]">{tool.method} {tool.endpoint}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[tool.source] ?? ''}`}>
          {tool.source.replace('_IMPORT', '').replace('_', ' ')}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {tool.tags?.slice(0, 3).map((ta) => (
            <Badge
              key={ta.tag.id}
              variant="outline"
              className="text-[10px]"
              style={ta.tag.color ? { borderColor: ta.tag.color, color: ta.tag.color } : {}}
            >
              {ta.tag.isToolkit && <Package className="h-2.5 w-2.5 mr-0.5" />}
              {ta.tag.name}
            </Badge>
          ))}
          {(tool.tags?.length ?? 0) > 3 && (
            <span className="text-[10px] text-muted-foreground">+{tool.tags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {tool.credential ? (
          <span className="flex items-center gap-1 text-xs">
            <Key className="h-3 w-3" /> {tool.credential.name}
          </span>
        ) : tool.authType !== 'NONE' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {tool.authType}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 hidden lg:table-cell">
        <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          {tool.rateLimitPerMinute ? (
            <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> {tool.rateLimitPerMinute}/min</span>
          ) : null}
          {tool.cacheTtlSeconds ? (
            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {tool.cacheTtlSeconds}s cache</span>
          ) : null}
          {!tool.rateLimitPerMinute && !tool.cacheTtlSeconds && <span>—</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <Switch
          checked={tool.isActive}
          onCheckedChange={(v) => onToggle(tool.id, v)}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => onEdit(tool)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="History" onClick={() => onHistory(tool.id)}>
            <History className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Delete"
            onClick={() => onDelete(tool.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Collection Group ──────────────────────────────────────────────────────────

function CollectionGroup({ name, tools, onEdit }: { name: string; tools: Tool[]; onEdit: (t: Tool) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {name}
          <Badge variant="outline" className="text-[10px]">{tools.length} tools</Badge>
          <Badge variant="outline" className="text-[10px]">{tools.filter(t => t.isActive).length} active</Badge>
        </span>
      </button>
      {open && (
        <div className="border-t divide-y">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <ToolIcon type={tool.toolType} />
                <span className="font-mono text-xs font-medium truncate">{tool.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{tool.method}</Badge>
                {!tool.isActive && <Badge variant="secondary" className="text-[10px] shrink-0">Inactive</Badge>}
              </div>
              <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => onEdit(tool)}>
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toolkits Panel ────────────────────────────────────────────────────────────

function ToolkitsPanel({ toolkits, tools, allTags }: { toolkits: TagData[]; tools: Tool[]; allTags: TagData[] }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; color: string; isToolkit: boolean }) =>
      api.post('/tools/tags', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-tags'] });
      setCreateOpen(false);
      setName('');
      toast({ title: 'Toolkit created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create toolkit' }),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: string) => api.put(`/tools/tags/${id}`, { isToolkit: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-tags'] });
      toast({ title: 'Promoted to toolkit' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to promote' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tools/tags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tool-tags'] }); toast({ title: 'Toolkit deleted' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete' }),
  });

  // Map tag IDs to tools
  const toolsByTag = new Map<string, Tool[]>();
  for (const tool of tools) {
    for (const ta of tool.tags ?? []) {
      if (!toolsByTag.has(ta.tag.id)) toolsByTag.set(ta.tag.id, []);
      toolsByTag.get(ta.tag.id)!.push(tool);
    }
  }

  const promotableTags = allTags.filter((t) => !t.isToolkit);

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Toolkits are tag-based collections agents can subscribe to wholesale.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Toolkit
        </Button>
      </div>

      {toolkits.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <Boxes className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No toolkits yet.</p>
          <p className="text-xs text-muted-foreground max-w-xs text-center">
            Create a new toolkit or promote an existing tag to let agents subscribe to a whole collection of tools.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {toolkits.map((tag) => {
            const tagTools = toolsByTag.get(tag.id) ?? [];
            return (
              <Card key={tag.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {tag.color && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />}
                      <CardTitle className="text-sm">{tag.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        <Package className="h-2.5 w-2.5 mr-0.5" /> Toolkit
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(tag.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <CardDescription className="text-xs">{tag._count.tools} tools in this toolkit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {tagTools.slice(0, 10).map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                        {t.name}
                      </span>
                    ))}
                    {tagTools.length > 10 && (
                      <span className="text-[10px] text-muted-foreground">+{tagTools.length - 10} more</span>
                    )}
                    {tagTools.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">No tools tagged yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Promote existing tags */}
      {promotableTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Promote existing tags to toolkits</p>
          <div className="flex flex-wrap gap-2">
            {promotableTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => promoteMutation.mutate(tag.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                style={tag.color ? { borderColor: tag.color } : {}}
              >
                <Star className="h-3 w-3" />
                {tag.name}
                <span className="text-muted-foreground">({tag._count.tools})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create toolkit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Toolkit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme CRM" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 rounded border cursor-pointer" />
                <span className="text-xs text-muted-foreground font-mono">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ name, color, isToolkit: true })} disabled={!name || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tags Panel ────────────────────────────────────────────────────────────────

function TagsPanel({ tags }: { tags: TagData[] }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#94a3b8');

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; color?: string; isToolkit: boolean }) =>
      api.post('/tools/tags', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-tags'] });
      setCreateOpen(false);
      setName('');
      toast({ title: 'Tag created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create tag' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tools/tags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tool-tags'] }); toast({ title: 'Tag deleted' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete tag' }),
  });

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Organize tools with labels. Promote to toolkits via the Toolkits tab.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">No plain tags yet.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-1.5 rounded-lg border px-3 py-2" style={tag.color ? { borderColor: tag.color } : {}}>
              {tag.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />}
              <span className="text-sm font-medium">{tag.name}</span>
              <span className="text-xs text-muted-foreground">({tag._count.tools})</span>
              <button
                onClick={() => deleteMutation.mutate(tag.id)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="billing, crm, internal..." />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 rounded border cursor-pointer" />
                <span className="text-xs text-muted-foreground font-mono">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ name, color, isToolkit: false })} disabled={!name || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Credentials Panel ─────────────────────────────────────────────────────────

function CredentialsPanel({ creds }: { creds: Credential[] }) {
  return (
    <Card className="mt-1">
      <CardHeader>
        <CardTitle className="text-base">Shared Credentials</CardTitle>
        <CardDescription>Centralized auth for tools — update once, applies everywhere</CardDescription>
      </CardHeader>
      <CardContent>
        {creds.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No shared credentials. Created during CTD import or from Settings.
          </p>
        ) : (
          <div className="divide-y">
            {creds.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Key className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.authType} · {c.service ?? 'General'} · {c._count?.tools ?? 0} tools</p>
                  </div>
                </div>
                <Badge variant={c.isActive ? 'success' : 'secondary'}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  executions,
  tools,
  isLoading,
  toolIdFilter,
  sourceFilter,
  onToolFilter,
  onSourceFilter,
}: {
  executions: Execution[];
  tools: Tool[];
  isLoading: boolean;
  toolIdFilter: string | null;
  sourceFilter: string;
  onToolFilter: (id: string | null) => void;
  onSourceFilter: (s: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: execDetail } = useQuery<{ success: boolean; data: Record<string, unknown> }>({
    queryKey: ['tool-execution', expandedId],
    queryFn: () => api.get(`/tools/executions/${expandedId}`).then((r) => r.data),
    enabled: !!expandedId,
  });

  return (
    <div className="space-y-4 pt-1">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={toolIdFilter ?? 'ALL'} onValueChange={(v) => onToolFilter(v === 'ALL' ? null : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All tools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All tools</SelectItem>
            {tools.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter || 'ALL'} onValueChange={(v) => onSourceFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sources</SelectItem>
            {['CHAT', 'MCP', 'VOICE', 'TEST', 'DRY_RUN'].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['tool-executions'] })}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : executions.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
          <History className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No executions yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Tool</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Latency</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-center font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {executions.map((ex) => (
                <>
                  <tr key={ex.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}>
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium">{ex.toolName}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${EXEC_SOURCE_COLORS[ex.source] ?? ''}`}>
                        {ex.source}
                      </span>
                      {ex.cached && <span className="ml-1 text-[10px] text-muted-foreground">(cached)</span>}
                    </td>
                    <td className="px-3 py-2">
                      {ex.success ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {ex.responseStatus ?? 'OK'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" />
                          {ex.responseStatus ?? 'Error'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-mono ${ex.latencyMs > 3000 ? 'text-orange-500' : ex.latencyMs > 1000 ? 'text-yellow-500' : ''}`}>
                        {ex.latencyMs}ms
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{relativeTime(ex.createdAt)}</td>
                    <td className="px-3 py-2 text-center">
                      {expandedId === ex.id ? <ChevronDown className="h-3.5 w-3.5 mx-auto" /> : <ChevronRight className="h-3.5 w-3.5 mx-auto" />}
                    </td>
                  </tr>
                  {expandedId === ex.id && (
                    <tr key={`${ex.id}-detail`}>
                      <td colSpan={6} className="px-4 py-3 bg-muted/20">
                        {execDetail?.data ? (
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-medium mb-1">Request</p>
                              <pre className="rounded bg-muted p-2 overflow-auto max-h-32 font-mono text-[10px]">
                                {JSON.stringify({ url: (execDetail.data as Record<string, unknown>)['requestUrl'], method: (execDetail.data as Record<string, unknown>)['requestMethod'], body: (execDetail.data as Record<string, unknown>)['requestBody'] }, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="font-medium mb-1">Response</p>
                              <pre className="rounded bg-muted p-2 overflow-auto max-h-32 font-mono text-[10px]">
                                {String((execDetail.data as Record<string, unknown>)['responseBody'] ?? 'No body').slice(0, 1000)}
                              </pre>
                            </div>
                            {ex.errorMessage && (
                              <div className="col-span-2">
                                <p className="font-medium text-destructive mb-1">Error</p>
                                <p className="text-destructive font-mono text-[10px]">{ex.errorMessage}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
