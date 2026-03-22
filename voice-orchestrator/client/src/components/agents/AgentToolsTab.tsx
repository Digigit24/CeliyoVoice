import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, Wrench, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

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
    isActive: boolean;
    category?: string | null;
  };
}

interface Tool {
  id: string;
  name: string;
  description: string;
  method: string;
  endpoint: string;
  isActive: boolean;
  category?: string | null;
}

interface AgentToolsTabProps {
  agentId: string;
}

export function AgentToolsTab({ agentId }: AgentToolsTabProps) {
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [priority, setPriority] = useState(0);

  // Fetch linked agent tools
  const { data: agentToolsData, isLoading } = useQuery<{ success: boolean; data: AgentTool[] }>({
    queryKey: ['agent-tools', agentId],
    queryFn: () => api.get(`/agents/${agentId}/tools`).then((r) => r.data),
  });

  // Fetch available tools for linking
  const { data: toolsData } = useQuery<{ success: boolean; data: Tool[] }>({
    queryKey: ['tools'],
    queryFn: () => api.get('/tools', { params: { limit: 100 } }).then((r) => r.data),
  });

  const linkMutation = useMutation({
    mutationFn: (payload: { toolId: string; whenToUse?: string; isRequired: boolean; priority: number }) =>
      api.post(`/agents/${agentId}/tools`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      setLinkDialogOpen(false);
      resetForm();
      toast({ title: 'Tool linked to agent' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to link tool' }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (agentToolId: string) => api.delete(`/agents/${agentId}/tools/${agentToolId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      toast({ title: 'Tool unlinked' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to unlink tool' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ whenToUse: string; isRequired: boolean; priority: number }> }) =>
      api.put(`/agents/${agentId}/tools/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update' }),
  });

  const resetForm = () => {
    setSelectedToolId('');
    setWhenToUse('');
    setIsRequired(false);
    setPriority(0);
  };

  const handleLink = () => {
    if (!selectedToolId) return;
    linkMutation.mutate({
      toolId: selectedToolId,
      whenToUse: whenToUse || undefined,
      isRequired,
      priority,
    });
  };

  const agentTools = (agentToolsData?.data ?? []).sort((a, b) => a.priority - b.priority);
  const allTools = toolsData?.data ?? [];
  const linkedToolIds = new Set(agentTools.map((at) => at.toolId));
  const availableTools = allTools.filter((t) => !linkedToolIds.has(t.id) && t.isActive);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Linked Tools</h3>
          <p className="text-xs text-muted-foreground">
            Tools this agent can use during conversations
          </p>
        </div>
        <Button size="sm" onClick={() => setLinkDialogOpen(true)} disabled={availableTools.length === 0}>
          <Plus className="h-4 w-4" />
          Link Tool
        </Button>
      </div>

      {agentTools.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <div className="text-center">
            <Wrench className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No tools linked</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Link tools so the agent can call them during conversations.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {agentTools.map((at) => (
            <Card key={at.id}>
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{at.tool.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {at.tool.method}
                      </Badge>
                      {at.isRequired && (
                        <Badge variant="default" className="text-xs">Required</Badge>
                      )}
                      {at.tool.category && (
                        <Badge variant="secondary" className="text-xs">{at.tool.category}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">Priority: {at.priority}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{at.tool.description}</p>
                    {at.whenToUse && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        When to use: {at.whenToUse}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">Required</Label>
                      <Switch
                        checked={at.isRequired}
                        onCheckedChange={(v) =>
                          updateMutation.mutate({ id: at.id, data: { isRequired: v } })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMutation.mutate(at.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Link Tool Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Tool to Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tool</Label>
              <Select value={selectedToolId} onValueChange={setSelectedToolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tool..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTools.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.method})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>When to Use <span className="text-xs text-muted-foreground">(instruction for LLM)</span></Label>
              <Textarea
                value={whenToUse}
                onChange={(e) => setWhenToUse(e.target.value)}
                placeholder="Use this tool when the user asks about..."
                rows={2}
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <Label>Priority</Label>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={!selectedToolId || linkMutation.isPending}>
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Link Tool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
