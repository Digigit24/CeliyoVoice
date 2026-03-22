import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, Wrench, Pencil, Trash2, Upload, Zap, Lock,
  Key, ChevronDown, ChevronRight,
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
  tag: { id: string; name: string; color: string | null };
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
}

interface ToolsResponse {
  success: boolean;
  data: Tool[];
  pagination: { total: number; page: number; limit: number };
}

interface TagData {
  id: string;
  name: string;
  color: string | null;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  MANUAL: 'bg-muted text-muted-foreground',
  CELIYO_IMPORT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SWAGGER_IMPORT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  MCP_IMPORT: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

const TYPE_ICONS: Record<string, typeof Wrench> = {
  HTTP: Wrench,
  FUNCTION: Zap,
};

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
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Tools() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<ToolsResponse>({
    queryKey: ['tools', search, sourceFilter, typeFilter],
    queryFn: () =>
      api.get('/tools', {
        params: {
          search: search || undefined,
          source: sourceFilter || undefined,
          toolType: typeFilter || undefined,
          limit: 100,
        },
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

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/tools', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      setDialogOpen(false);
      toast({ title: 'Tool created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create tool' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/tools/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      setDialogOpen(false);
      toast({ title: 'Tool updated' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update tool' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast({ title: 'Tool deleted' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete tool' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/tools/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });

  const openCreate = () => {
    setEditTool(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

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
    };
    if (form.toolType === 'HTTP') {
      payload.endpoint = form.endpoint;
    } else if (form.toolType === 'FUNCTION') {
      payload.functionName = form.functionName;
    }
    if (form.inputSchema) {
      try { payload.inputSchema = JSON.parse(form.inputSchema); } catch { /* skip */ }
    }
    if (editTool) updateMutation.mutate({ id: editTool.id, payload });
    else createMutation.mutate(payload);
  };

  const tools = data?.data ?? [];
  const tags = tagsData?.data ?? [];
  const creds = credsData?.data ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Group tools by collection
  const collections = new Map<string, Tool[]>();
  for (const t of tools) {
    const col = (t.importMeta as { collectionName?: string } | null)?.collectionName ?? 'Manual Tools';
    if (!collections.has(col)) collections.set(col, []);
    collections.get(col)!.push(t);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-sm text-muted-foreground">Manage tools your AI agents can use</p>
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
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={sourceFilter || 'ALL'} onValueChange={(v) => setSourceFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sources</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
            <SelectItem value="CELIYO_IMPORT">CTD Import</SelectItem>
            <SelectItem value="SWAGGER_IMPORT">Swagger Import</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'ALL'} onValueChange={(v) => setTypeFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="HTTP">HTTP</SelectItem>
            <SelectItem value="FUNCTION">Function</SelectItem>
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 6).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="cursor-pointer text-xs"
                style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
              >
                {tag.name} ({tag._count.tools})
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Tools ({tools.length})</TabsTrigger>
          <TabsTrigger value="collections">By Collection ({collections.size})</TabsTrigger>
          <TabsTrigger value="credentials">Credentials ({creds.length})</TabsTrigger>
        </TabsList>

        {/* All Tools Table */}
        <TabsContent value="all">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tools.length === 0 ? (
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
                    <th className="px-3 py-2 text-center font-medium">Active</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tools.map((tool) => {
                    const Icon = TYPE_ICONS[tool.toolType] ?? Wrench;
                    return (
                      <tr key={tool.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium font-mono text-xs">{tool.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{tool.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">{tool.toolType}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[tool.source] ?? ''}`}>
                            {tool.source.replace('_IMPORT', '').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {tool.tags?.map((ta) => (
                              <Badge
                                key={ta.tag.id}
                                variant="outline"
                                className="text-[10px]"
                                style={ta.tag.color ? { borderColor: ta.tag.color, color: ta.tag.color } : {}}
                              >
                                {ta.tag.name}
                              </Badge>
                            ))}
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
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={tool.isActive}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: tool.id, isActive: v })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(tool)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(tool.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* By Collection Tab */}
        <TabsContent value="collections">
          <div className="space-y-3">
            {Array.from(collections.entries()).map(([col, colTools]) => (
              <CollectionGroup key={col} name={col} tools={colTools} onEdit={openEdit} />
            ))}
          </div>
        </TabsContent>

        {/* Credentials Tab */}
        <TabsContent value="credentials">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Shared Credentials</CardTitle>
                  <CardDescription>Centralized auth for tools — update once, applies everywhere</CardDescription>
                </div>
                <Button size="sm" onClick={() => toast({ title: 'Create credential from the Settings page or during CTD import' })}>
                  <Plus className="h-4 w-4" /> Add Credential
                </Button>
              </div>
            </CardHeader>
            <CardContent>
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
                {creds.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No shared credentials. Credentials are created during tool import or manually.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Tool Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTool ? 'Edit Tool' : 'Create Tool'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tool name" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.toolType} onValueChange={(v) => setForm({ ...form, toolType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HTTP">HTTP</SelectItem>
                    <SelectItem value="FUNCTION">Function</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>

            {form.toolType === 'HTTP' && (
              <div className="grid grid-cols-3 gap-3">
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
                <div className="col-span-2 space-y-2">
                  <Label>Endpoint URL</Label>
                  <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://api.example.com/..." />
                </div>
              </div>
            )}

            {form.toolType === 'FUNCTION' && (
              <div className="space-y-2">
                <Label>Function Name</Label>
                <Select value={form.functionName || 'echo'} onValueChange={(v) => setForm({ ...form, functionName: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="echo">echo</SelectItem>
                    <SelectItem value="timestamp">timestamp</SelectItem>
                    <SelectItem value="json_extract">json_extract</SelectItem>
                    <SelectItem value="math">math</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Input Schema (JSON)</Label>
              <Textarea
                value={form.inputSchema}
                onChange={(e) => setForm({ ...form, inputSchema: e.target.value })}
                placeholder='{"type":"object","properties":{"query":{"type":"string","description":"..."}}}'
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="CRM, Billing..." />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Label>Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.description}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editTool ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Wizard */}
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// ── Collection Group Component ───────────────────────────────────────────────

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
        </span>
      </button>
      {open && (
        <div className="border-t divide-y">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{tool.name}</span>
                <Badge variant="outline" className="text-[10px]">{tool.method}</Badge>
                {tool.endpoint && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{tool.endpoint}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => onEdit(tool)}>
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
