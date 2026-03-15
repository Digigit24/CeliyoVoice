import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDuration, formatDate } from '@/lib/utils';

interface Call {
  id: string;
  phone: string;
  status: string;
  direction: string;
  provider: string;
  duration: number | null;
  createdAt: string;
  agent: { name: string } | null;
}

interface CallsResponse {
  success: boolean;
  data: Call[];
  meta: { total: number; page: number; limit: number };
}

const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  COMPLETED: 'success',
  FAILED: 'destructive',
  IN_PROGRESS: 'warning',
  QUEUED: 'secondary',
  CANCELLED: 'outline',
};

interface AgentsResponse {
  success: boolean;
  data: Array<{ id: string; name: string }>;
}

export default function Calls() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ phoneNumber: '', agentId: '', provider: 'OMNIDIM' });

  const { data, isLoading } = useQuery<CallsResponse>({
    queryKey: ['calls', statusFilter],
    queryFn: () =>
      api.get('/calls', { params: { status: statusFilter || undefined, limit: 50, sortBy: 'createdAt', sortOrder: 'desc' } }).then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: agentsData } = useQuery<AgentsResponse>({
    queryKey: ['agents-list'],
    queryFn: () => api.get('/agents', { params: { limit: 100, isActive: true } }).then((r) => r.data),
  });

  const startMutation = useMutation({
    mutationFn: (payload: { phoneNumber: string; agentId: string; provider: string }) =>
      api.post('/calls/start', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      setDialogOpen(false);
      toast({ title: 'Call started', description: 'The call has been queued.' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to start call' }),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.post(`/calls/${id}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      toast({ title: 'Call ended' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to end call' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calls</h1>
          <p className="text-sm text-muted-foreground">Monitor and manage voice calls</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Start Call
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="QUEUED">Queued</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Call History <span className="font-normal text-muted-foreground">({data?.meta?.total ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y">
              {(data?.data ?? []).map((call) => (
                <div key={call.id} className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{call.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {call.agent?.name ?? 'No agent'} · {call.provider} · {call.direction} · {formatDate(call.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatDuration(call.duration)}</span>
                    <Badge variant={statusVariant[call.status] ?? 'outline'}>{call.status}</Badge>
                    {call.status === 'IN_PROGRESS' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => endMutation.mutate(call.id)}
                        disabled={endMutation.isPending}
                      >
                        <PhoneOff className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {(data?.data ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No calls found.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="+1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {(agentsData?.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => startMutation.mutate(form)}
              disabled={startMutation.isPending || !form.phoneNumber || !form.agentId}
            >
              {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start Call'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
