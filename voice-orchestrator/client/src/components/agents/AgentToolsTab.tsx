import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Loader2, Wrench, GripVertical, Boxes, Eye, Check,
  ArrowUpDown, Zap, Globe, Link2, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentTool {
  id: string;
  toolId: string;
  whenToUse: string | null;
  isRequired: boolean;
  priority: number;
  tool: {
    id: string;
    name: string;
    description: string;
    method: string;
    endpoint: string;
    toolType: string;
    isActive: boolean;
    category?: string | null;
    source?: string;
  };
}

interface Tool {
  id: string;
  name: string;
  description: string;
  method: string;
  endpoint: string;
  toolType: string;
  isActive: boolean;
  category?: string | null;
  source?: string;
}

interface Toolkit {
  id: string;
  tagId: string;
  createdAt: string;
  tag: {
    id: string;
    name: string;
    color: string | null;
    isToolkit: boolean;
    _count: { tools: number };
    tools: Array<{
      tool: {
        id: string;
        name: string;
        description: string;
        toolType: string;
        isActive: boolean;
        category?: string | null;
      };
    }>;
  };
}

interface ToolTag {
  id: string;
  name: string;
  color: string | null;
  isToolkit: boolean;
  _count: { tools: number };
}

interface EffectiveToolEntry {
  tool: Tool;
  source: 'individual' | 'toolkit';
  toolkitName?: string;
  whenToUse?: string | null;
  priority?: number;
  isRequired?: boolean;
}

interface EffectiveToolsResponse {
  total: number;
  individual: number;
  fromToolkits: number;
  tools: EffectiveToolEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, typeof Wrench> = {
  HTTP: Globe,
  FUNCTION: Zap,
  COMPOSITE: Link2,
};

function ToolTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? Wrench;
  return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'MANUAL') return null;
  const labels: Record<string, string> = {
    CELIYO_IMPORT: 'CTD',
    SWAGGER_IMPORT: 'Swagger',
    MCP_IMPORT: 'MCP',
  };
  return (
    <Badge variant="outline" className="text-[10px] shrink-0">
      {labels[source] ?? source}
    </Badge>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentToolsTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<'individual' | 'toolkits'>('individual');
  const [selectedToolId, setSelectedToolId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [priority, setPriority] = useState(0);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: agentToolsData, isLoading: loadingTools } = useQuery<{ success: boolean; data: AgentTool[] }>({
    queryKey: ['agent-tools', agentId],
    queryFn: () => api.get(`/agents/${agentId}/tools`).then((r) => r.data),
  });

  const { data: toolkitsData, isLoading: loadingToolkits } = useQuery<{ success: boolean; data: Toolkit[] }>({
    queryKey: ['agent-toolkits', agentId],
    queryFn: () => api.get(`/agents/${agentId}/toolkits`).then((r) => r.data),
  });

  const { data: effectiveData, isLoading: loadingEffective } = useQuery<{ success: boolean; data: EffectiveToolsResponse }>({
    queryKey: ['agent-tools-effective', agentId],
    queryFn: () => api.get(`/agents/${agentId}/tools/effective`).then((r) => r.data),
  });

  const { data: allToolsData } = useQuery<{ success: boolean; data: Tool[] }>({
    queryKey: ['tools'],
    queryFn: () => api.get('/tools', { params: { limit: 200 } }).then((r) => r.data),
  });

  const { data: allTagsData } = useQuery<{ success: boolean; data: ToolTag[] }>({
    queryKey: ['tool-tags'],
    queryFn: () => api.get('/tools/tags').then((r) => r.data),
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const linkMutation = useMutation({
    mutationFn: (payload: { toolId: string; whenToUse?: string; isRequired: boolean; priority: number }) =>
      api.post(`/agents/${agentId}/tools`, payload),
    onSuccess: () => {
      invalidateAll();
      setAddOpen(false);
      resetForm();
      toast({ title: 'Tool linked' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to link tool' }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (agentToolId: string) => api.delete(`/agents/${agentId}/tools/${agentToolId}`),
    onSuccess: () => { invalidateAll(); toast({ title: 'Tool unlinked' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to unlink tool' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ whenToUse: string; isRequired: boolean; priority: number }> }) =>
      api.put(`/agents/${agentId}/tools/${id}`, data),
    onSuccess: () => invalidateAll(),
    onError: () => toast({ variant: 'destructive', title: 'Failed to update' }),
  });

  const subscribeToolkitMutation = useMutation({
    mutationFn: (tagId: string) => api.post(`/agents/${agentId}/toolkits`, { tagId }),
    onSuccess: () => {
      invalidateAll();
      setAddOpen(false);
      resetForm();
      toast({ title: 'Toolkit subscribed' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to subscribe';
      toast({ variant: 'destructive', title: msg });
    },
  });

  const unsubscribeToolkitMutation = useMutation({
    mutationFn: (tagId: string) => api.delete(`/agents/${agentId}/toolkits/${tagId}`),
    onSuccess: () => { invalidateAll(); toast({ title: 'Toolkit removed' }); },
    onError: () => toast({ variant: 'destructive', title: 'Failed to remove toolkit' }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
    queryClient.invalidateQueries({ queryKey: ['agent-toolkits', agentId] });
    queryClient.invalidateQueries({ queryKey: ['agent-tools-effective', agentId] });
  };

  const resetForm = () => {
    setSelectedToolId('');
    setSelectedTagId('');
    setWhenToUse('');
    setIsRequired(false);
    setPriority(0);
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const agentTools = (agentToolsData?.data ?? []).sort((a, b) => a.priority - b.priority);
  const toolkits = toolkitsData?.data ?? [];
  const effective = effectiveData?.data;
  const allTools = allToolsData?.data ?? [];
  const allTags = allTagsData?.data ?? [];

  const linkedToolIds = new Set(agentTools.map((at) => at.toolId));
  const subscribedTagIds = new Set(toolkits.map((tk) => tk.tagId));
  const availableTools = allTools.filter((t) => !linkedToolIds.has(t.id) && t.isActive);
  const availableToolkits = allTags.filter((t) => t.isToolkit && !subscribedTagIds.has(t.id));

  const handleAddIndividual = () => {
    if (!selectedToolId) return;
    linkMutation.mutate({ toolId: selectedToolId, whenToUse: whenToUse || undefined, isRequired, priority });
  };

  const handleAddToolkit = () => {
    if (!selectedTagId) return;
    subscribeToolkitMutation.mutate(selectedTagId);
  };

  const isAddPending = linkMutation.isPending || subscribeToolkitMutation.isPending;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      {effective && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="text-center">
            <p className="text-xl font-bold">{effective.total}</p>
            <p className="text-xs text-muted-foreground">Effective tools</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xl font-bold">{effective.individual}</p>
            <p className="text-xs text-muted-foreground">Individual</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xl font-bold">{effective.fromToolkits}</p>
            <p className="text-xs text-muted-foreground">From toolkits</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xl font-bold">{toolkits.length}</p>
            <p className="text-xs text-muted-foreground">Toolkits</p>
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Tools
            </Button>
          </div>
        </div>
      )}

      {!effective && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Tools
          </Button>
        </div>
      )}

      <Tabs defaultValue="individual">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="individual" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Attached Tools ({agentTools.length})
          </TabsTrigger>
          <TabsTrigger value="toolkits" className="gap-1.5">
            <Boxes className="h-3.5 w-3.5" />
            Toolkits ({toolkits.length})
          </TabsTrigger>
          <TabsTrigger value="effective" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Effective View
          </TabsTrigger>
        </TabsList>

        {/* ── Attached Tools ─────────────────────────────────────────────────── */}
        <TabsContent value="individual" className="space-y-2 pt-2">
          {loadingTools ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : agentTools.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No tools attached"
              description="Attach individual tools with optional whenToUse instructions."
              onAdd={() => { setAddTab('individual'); setAddOpen(true); }}
              label="Attach Tool"
            />
          ) : (
            agentTools.map((at) => (
              <Card key={at.id}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-muted-foreground cursor-grab">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ToolTypeIcon type={at.tool.toolType} />
                        <span className="font-mono text-sm font-medium">{at.tool.name}</span>
                        {at.tool.method && at.tool.method !== 'POST' && (
                          <Badge variant="outline" className="text-[10px]">{at.tool.method}</Badge>
                        )}
                        {at.isRequired && <Badge className="text-[10px]">Required</Badge>}
                        {at.tool.category && <Badge variant="secondary" className="text-[10px]">{at.tool.category}</Badge>}
                        <SourceBadge source={at.tool.source} />
                        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <ArrowUpDown className="h-3 w-3" /> Priority: {at.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{at.tool.description}</p>
                      {at.whenToUse && (
                        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 italic line-clamp-2">
                          When to use: {at.whenToUse}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[10px] text-muted-foreground">Required</Label>
                        <Switch
                          checked={at.isRequired}
                          onCheckedChange={(v) => updateMutation.mutate({ id: at.id, data: { isRequired: v } })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => unlinkMutation.mutate(at.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Toolkits ───────────────────────────────────────────────────────── */}
        <TabsContent value="toolkits" className="space-y-2 pt-2">
          {loadingToolkits ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : toolkits.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No toolkits subscribed"
              description="Subscribe to a toolkit to give this agent access to a whole collection of tools at once."
              onAdd={() => { setAddTab('toolkits'); setAddOpen(true); }}
              label="Add Toolkit"
            />
          ) : (
            toolkits.map((tk) => (
              <Card key={tk.id}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{tk.tag.name}</span>
                        {tk.tag.color && (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tk.tag.color }} />
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {tk.tag._count.tools} tools
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tk.tag.tools.slice(0, 8).map((assignment) => (
                          <span key={assignment.tool.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                            {assignment.tool.name}
                          </span>
                        ))}
                        {tk.tag.tools.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{tk.tag.tools.length - 8} more</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                      onClick={() => unsubscribeToolkitMutation.mutate(tk.tagId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Effective Tools (read-only merged view) ────────────────────────── */}
        <TabsContent value="effective" className="pt-2">
          {loadingEffective ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !effective || effective.total === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
              <Eye className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No tools in effective list yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                This is exactly what the agent sees — deduplicated, merged from individual bindings and toolkit subscriptions.
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Tool</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-left font-medium">When to Use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {effective.tools.map((entry, i) => (
                      <tr key={entry.tool.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <ToolTypeIcon type={entry.tool.toolType} />
                            <span className="font-mono font-medium">{entry.tool.name}</span>
                            {entry.isRequired && <Badge className="text-[10px]">Required</Badge>}
                          </div>
                          <p className="text-muted-foreground mt-0.5 line-clamp-1 max-w-[200px]">{entry.tool.description}</p>
                        </td>
                        <td className="px-3 py-2">
                          {entry.source === 'individual' ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              <Wrench className="h-2.5 w-2.5" /> Individual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              <Package className="h-2.5 w-2.5" /> {entry.toolkitName}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                          {entry.whenToUse ? (
                            <span className="line-clamp-2 italic">{entry.whenToUse}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Tools / Toolkits dialog ────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) { setAddOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tools to Agent</DialogTitle>
          </DialogHeader>

          <Tabs value={addTab} defaultValue="individual" onValueChange={(v) => setAddTab(v as 'individual' | 'toolkits')}>
            <TabsList className="w-full">
              <TabsTrigger value="individual" className="flex-1">Individual Tool</TabsTrigger>
              <TabsTrigger value="toolkits" className="flex-1">Toolkit</TabsTrigger>
            </TabsList>

            {/* Individual tool */}
            <TabsContent value="individual" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tool</Label>
                {availableTools.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded border p-3">
                    All active tools are already linked to this agent.
                  </p>
                ) : (
                  <Select value={selectedToolId} onValueChange={setSelectedToolId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tool..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTools.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="font-mono text-xs">{t.name}</span>
                          {t.category && <span className="ml-1 text-muted-foreground text-xs">· {t.category}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>When to Use <span className="text-xs text-muted-foreground font-normal">(instruction for LLM, optional)</span></Label>
                <Textarea
                  value={whenToUse}
                  onChange={(e) => setWhenToUse(e.target.value)}
                  placeholder="Use this tool when the user asks about..."
                  rows={2}
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <Label>Priority <span className="text-xs text-muted-foreground font-normal">(lower = higher precedence)</span></Label>
                  <Input
                    type="number"
                    min={0}
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Label>Required</Label>
                  <Switch checked={isRequired} onCheckedChange={setIsRequired} />
                </div>
              </div>
            </TabsContent>

            {/* Toolkit */}
            <TabsContent value="toolkits" className="space-y-4 pt-2">
              {availableToolkits.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Package className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No toolkits available.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Promote a tag to a toolkit in the Tools → Tags page.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Select a Toolkit</Label>
                  <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
                    {availableToolkits.map((tag) => {
                      const selected = selectedTagId === tag.id;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedTagId(tag.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${selected ? 'bg-muted/30' : ''}`}
                        >
                          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                            {selected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{tag.name}</span>
                              {tag.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />}
                              <Badge variant="outline" className="text-[10px]">{tag._count.tools} tools</Badge>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={addTab === 'individual' ? handleAddIndividual : handleAddToolkit}
              disabled={isAddPending || (addTab === 'individual' ? !selectedToolId : !selectedTagId)}
            >
              {isAddPending ? <Loader2 className="h-4 w-4 animate-spin" /> : addTab === 'individual' ? 'Attach Tool' : 'Subscribe Toolkit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  onAdd,
  label,
}: {
  icon: typeof Wrench;
  title: string;
  description: string;
  onAdd: () => void;
  label: string;
}) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
      <Icon className="h-7 w-7 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">{description}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
