import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Bot, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

interface Agent {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  systemPrompt: string;
  voiceId?: string;
  voiceLanguage: string;
  createdAt: string;
}

interface AgentsResponse {
  success: boolean;
  data: Agent[];
  meta: { total: number; page: number; limit: number };
}

const emptyForm = { name: '', provider: 'OMNIDIM', systemPrompt: '', voiceId: '', voiceLanguage: 'en', isActive: true };

export default function Agents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<AgentsResponse>({
    queryKey: ['agents', search],
    queryFn: () => api.get('/agents', { params: { search: search || undefined, limit: 50 } }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => api.post('/agents', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setDialogOpen(false);
      toast({ title: 'Agent created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create agent' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof emptyForm }) =>
      api.put(`/agents/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setDialogOpen(false);
      toast({ title: 'Agent updated' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update agent' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agent deleted' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete agent' }),
  });

  const openCreate = () => {
    setEditAgent(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setForm({ name: agent.name, provider: agent.provider, systemPrompt: agent.systemPrompt, voiceId: agent.voiceId ?? '', voiceLanguage: agent.voiceLanguage, isActive: agent.isActive });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editAgent) updateMutation.mutate({ id: editAgent.id, payload: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Manage your Voice AI agents</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.data ?? []).map((agent) => (
            <Card key={agent.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium leading-none">{agent.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{agent.voiceLanguage} · {agent.provider}</p>
                    </div>
                  </div>
                  <Badge variant={agent.isActive ? 'success' : 'secondary'}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{agent.systemPrompt || 'No system prompt set'}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(data?.data ?? []).length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">No agents found.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editAgent ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Voice Agent" />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OMNIDIM">Omnidim</SelectItem>
                  <SelectItem value="BOLNA">Bolna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={form.voiceLanguage} onValueChange={(v) => setForm({ ...form, voiceLanguage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voice ID</Label>
              <Input value={form.voiceId} onChange={(e) => setForm({ ...form, voiceId: e.target.value })} placeholder="Provider voice ID (optional)" />
            </div>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="You are a helpful voice assistant..."
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editAgent ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
