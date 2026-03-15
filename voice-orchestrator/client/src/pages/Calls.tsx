import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, PhoneOff, Phone, RefreshCw, ExternalLink } from 'lucide-react';
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocalCall {
  id: string;
  phone: string;
  status: string;
  direction: string;
  provider: string;
  duration: number | null;
  createdAt: string;
  providerCallId?: string;
  agent: { id: string; name: string } | null;
}

interface OmnidimCallLog {
  call_log_id?: string | number;
  id?: string | number;
  agent_id?: number;
  agent_name?: string;
  to_number?: string;
  call_status?: string;
  status?: string;
  duration?: number;
  summary?: string;
  recording_url?: string;
  created_at?: string;
  ended_at?: string;
  call_cost?: number;
  [key: string]: unknown;
}

interface Agent {
  id: string;
  name: string;
  provider: string;
  providerAgentId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOCAL_STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  RINGING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  QUEUED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-muted text-muted-foreground',
};

const OMNIDIM_STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  busy: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'no-answer': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const cls = colorMap[status] ?? colorMap[status.toLowerCase()] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

// ── Dispatch dialog ───────────────────────────────────────────────────────────

function DispatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    phone: '',
    agentId: '',
    fromNumberId: '',
    customerName: '',
    accountId: '',
  });

  const { data: agentsData } = useQuery<{ data: Agent[] }>({
    queryKey: ['agents-dispatch'],
    queryFn: () => api.get('/agents', { params: { limit: 100, isActive: true } }).then((r) => r.data),
    enabled: open,
  });

  const agents = agentsData?.data ?? [];
  const selectedAgent = agents.find((a) => a.id === form.agentId);

  const dispatchMutation = useMutation({
    mutationFn: (payload: object) => api.post('/calls/start', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['remote-call-logs'] });
      setForm({ phone: '', agentId: '', fromNumberId: '', customerName: '', accountId: '' });
      onOpenChange(false);
      toast({ title: 'Call dispatched', description: 'The call is being initiated.' });
    },
    onError: (err) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? 'Failed to dispatch call';
      toast({ variant: 'destructive', title: 'Dispatch failed', description: msg });
    },
  });

  const handleSubmit = () => {
    const callContext: Record<string, string> = {};
    if (form.customerName) callContext['customer_name'] = form.customerName;
    if (form.accountId) callContext['account_id'] = form.accountId;

    dispatchMutation.mutate({
      agentId: form.agentId,
      phone: form.phone,
      ...(form.fromNumberId ? { fromNumberId: form.fromNumberId } : {}),
      ...(Object.keys(callContext).length > 0 ? { callContext } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dispatch Call</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Phone Number <span className="text-destructive">*</span></Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 9876543210"
            />
            <p className="text-xs text-muted-foreground">Must include country code (e.g. +91...)</p>
          </div>

          <div className="space-y-1.5">
            <Label>Agent <span className="text-destructive">*</span></Label>
            <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    <span className="ml-2 text-xs text-muted-foreground">({a.provider})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAgent && !selectedAgent.providerAgentId && (
              <p className="text-xs text-destructive">This agent hasn't been imported from the provider yet.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>From Number ID <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input
              value={form.fromNumberId}
              onChange={(e) => setForm({ ...form, fromNumberId: e.target.value })}
              placeholder="Imported phone number ID"
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Call Context (optional)</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Name</Label>
              <Input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder="John Doe"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account ID</Label>
              <Input
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                placeholder="ACC-12345"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={dispatchMutation.isPending || !form.phone || !form.agentId}
          >
            {dispatchMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Phone className="mr-2 h-4 w-4" />
            )}
            Dispatch Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Omnidim remote logs tab ───────────────────────────────────────────────────

function OmnidimLogsTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch, isFetching } = useQuery<{
    data: { logs: OmnidimCallLog[]; total: number };
  }>({
    queryKey: ['remote-call-logs', statusFilter, page],
    queryFn: () =>
      api.get('/calls/logs/remote', {
        params: { call_status: statusFilter !== 'all' ? statusFilter : undefined, page, pageSize: 20 },
      }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="no-answer">No Answer</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{total} total</span>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load call logs from Omnidim.
        </div>
      ) : logs.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No call logs found.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {logs.map((log, i) => {
            const id = String(log.call_log_id ?? log.id ?? i);
            const status = String(log.call_status ?? log.status ?? '');
            const duration = typeof log.duration === 'number' ? log.duration : null;
            return (
              <div key={id} className="flex items-start justify-between p-3 hover:bg-muted/30">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{log.to_number ?? '—'}</p>
                    {log.agent_name && (
                      <span className="text-xs text-muted-foreground">via {log.agent_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(log.created_at)}</span>
                    {log.call_cost != null && <span>· ${log.call_cost.toFixed(3)}</span>}
                  </div>
                  {log.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-md">{log.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {duration != null && (
                    <span className="text-xs text-muted-foreground">{formatDuration(duration)}</span>
                  )}
                  {status && <StatusBadge status={status} colorMap={OMNIDIM_STATUS_COLOR} />}
                  {log.recording_url && (
                    <a
                      href={String(log.recording_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Recording
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Local calls tab ───────────────────────────────────────────────────────────

function LocalCallsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading } = useQuery<{ data: LocalCall[]; meta: { total: number } }>({
    queryKey: ['calls', statusFilter],
    queryFn: () =>
      api.get('/calls', {
        params: { status: statusFilter !== 'all' ? statusFilter : undefined, limit: 50, sortBy: 'createdAt', sortOrder: 'desc' },
      }).then((r) => r.data),
    refetchInterval: 15_000,
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.post(`/calls/${id}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      toast({ title: 'Call ended' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to end call' }),
  });

  const calls = data?.data ?? [];

  return (
    <div className="space-y-3">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="RINGING">Ringing</SelectItem>
          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : calls.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No calls found.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {calls.map((call) => (
            <div key={call.id} className="flex items-center justify-between p-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium">{call.phone}</p>
                <p className="text-xs text-muted-foreground">
                  {call.agent?.name ?? 'No agent'} · {call.provider} · {formatDate(call.createdAt)}
                </p>
                {call.providerCallId && (
                  <p className="font-mono text-xs text-muted-foreground">ID: {call.providerCallId}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                {call.duration != null && (
                  <span className="text-xs text-muted-foreground">{formatDuration(call.duration)}</span>
                )}
                <StatusBadge status={call.status} colorMap={LOCAL_STATUS_COLOR} />
                {(call.status === 'IN_PROGRESS' || call.status === 'RINGING') && (
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
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Calls() {
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'omnidim' | 'local'>('omnidim');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calls</h1>
          <p className="text-sm text-muted-foreground">Dispatch and monitor voice calls</p>
        </div>
        <Button onClick={() => setDispatchOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Dispatch Call
        </Button>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab('omnidim')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'omnidim'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Omnidim Logs
        </button>
        <button
          onClick={() => setActiveTab('local')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'local'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Local Records
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {activeTab === 'omnidim' ? 'Omnidim Call Logs' : 'Local Call Records'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'omnidim' ? <OmnidimLogsTab /> : <LocalCallsTab />}
        </CardContent>
      </Card>

      <DispatchDialog open={dispatchOpen} onOpenChange={setDispatchOpen} />
    </div>
  );
}
