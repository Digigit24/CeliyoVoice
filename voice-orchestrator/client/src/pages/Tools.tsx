import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Wrench, Pencil, Trash2 } from 'lucide-react';
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

interface Tool {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  isActive: boolean;
  authType: string;
}

interface ToolsResponse {
  success: boolean;
  data: Tool[];
  meta: { total: number; page: number; limit: number };
}

const emptyForm = {
  name: '',
  description: '',
  method: 'GET',
  url: '',
  headers: '{}',
  body: '',
  authType: 'NONE',
  authToken: '',
  isActive: true,
};

export default function Tools() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<ToolsResponse>({
    queryKey: ['tools', search],
    queryFn: () => api.get('/tools', { params: { search: search || undefined, limit: 50 } }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => api.post('/tools', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      setDialogOpen(false);
      toast({ title: 'Tool created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create tool' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof emptyForm }) =>
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

  const openCreate = () => {
    setEditTool(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (tool: Tool) => {
    setEditTool(tool);
    setForm({ ...emptyForm, name: tool.name, description: tool.description, method: tool.method, url: tool.url, authType: tool.authType, isActive: tool.isActive });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editTool) updateMutation.mutate({ id: editTool.id, payload: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-sm text-muted-foreground">HTTP tools available to your voice agents</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Tool
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search tools..."
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
          {(data?.data ?? []).map((tool) => (
            <Card key={tool.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium leading-none">{tool.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tool.method} · {tool.authType}</p>
                    </div>
                  </div>
                  <Badge variant={tool.isActive ? 'success' : 'secondary'}>
                    {tool.isActive ? 'Active' : 'Off'}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{tool.url}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tool.description || 'No description'}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(tool)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(tool.id)}
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
              <p className="text-sm text-muted-foreground">No tools found.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTool ? 'Edit Tool' : 'Create Tool'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tool name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this tool do?" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2">
                <Label>Auth Type</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="BEARER">Bearer</SelectItem>
                    <SelectItem value="API_KEY">API Key</SelectItem>
                    <SelectItem value="BASIC">Basic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://api.example.com/endpoint" />
            </div>
            {form.authType !== 'NONE' && (
              <div className="space-y-2">
                <Label>Auth Token / Key</Label>
                <Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Token or key value" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Request Body Template (JSON)</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder='{"key": "{{value}}"}' rows={3} className="font-mono text-xs" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.url}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editTool ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
