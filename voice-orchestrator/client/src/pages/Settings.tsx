import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Key, Plus, Pencil, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

interface Credential {
  id: string;
  provider: string;
  apiUrl: string;
  isActive: boolean;
  createdAt: string;
}

interface CredentialsResponse {
  success: boolean;
  data: Credential[];
  meta: { total: number };
}

const emptyForm = { provider: 'OMNIDIM', apiKey: '', apiUrl: '', isActive: true };

export default function Settings() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCred, setEditCred] = useState<Credential | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showKey, setShowKey] = useState(false);

  const { data, isLoading } = useQuery<CredentialsResponse>({
    queryKey: ['credentials'],
    queryFn: () => api.get('/providers/credentials').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => {
      const { apiUrl, ...rest } = payload;
      return api.post('/providers/credentials', apiUrl ? { ...rest, apiUrl } : rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setDialogOpen(false);
      toast({ title: 'Credential saved' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to save credential' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof emptyForm }) => {
      const { apiUrl, ...rest } = payload;
      return api.put(`/providers/credentials/${id}`, apiUrl ? { ...rest, apiUrl } : rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setDialogOpen(false);
      toast({ title: 'Credential updated' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to update credential' }),
  });

  const openCreate = () => {
    setEditCred(null);
    setForm(emptyForm);
    setShowKey(false);
    setDialogOpen(true);
  };

  const openEdit = (cred: Credential) => {
    setEditCred(cred);
    setForm({ provider: cred.provider, apiKey: '', apiUrl: cred.apiUrl ?? '', isActive: cred.isActive });
    setShowKey(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editCred) updateMutation.mutate({ id: editCred.id, payload: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure provider credentials and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Provider Credentials</CardTitle>
              <CardDescription>API keys for Omnidim, Bolna, and other providers</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Credential
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y">
              {(data?.data ?? []).map((cred) => (
                <div key={cred.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Key className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{cred.provider}</p>
                      <p className="text-xs text-muted-foreground">{cred.apiUrl || 'Default URL'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={cred.isActive ? 'success' : 'secondary'}>
                      {cred.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => openEdit(cred)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
              {(data?.data ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No credentials configured. Add one to override environment defaults.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCred ? 'Edit Credential' : 'Add Provider Credential'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })} disabled={!!editCred}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OMNIDIM">Omnidim</SelectItem>
                  <SelectItem value="BOLNA">Bolna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key {editCred && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={editCred ? '••••••••' : 'sk-...'}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>API URL <span className="text-xs text-muted-foreground">(optional override)</span></Label>
              <Input
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                placeholder="https://api.provider.com"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || (!editCred && !form.apiKey)}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editCred ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
