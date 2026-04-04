import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  PhoneOff,
  Phone,
  RefreshCw,
  ExternalLink,
  PhoneIncoming,
  PhoneOutgoing,
  Mic,
  Brain,
  Clock,
  DollarSign,
  ChevronRight,
  X,
  MessageSquare,
  BarChart2,
  Sparkles,
  AlertCircle,
  Globe,
  Bot,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface OmnidimCallInteraction {
  id?: number;
  interaction_sequence?: number;
  user_query?: string;
  bot_response?: string;
  time_of_call?: string;
  total_tokens?: number;
  tts_speaking_duration?: number;
}

interface OmnidimCallLog {
  id?: number | string;
  bot_name?: string;
  time_of_call?: string;
  from_number?: string;
  to_number?: string;
  call_direction?: string;
  call_duration?: string;
  call_duration_in_seconds?: number;
  call_duration_in_minutes?: number;
  call_status?: string;
  recording_url?: string;
  internal_recording_url?: string;
  call_conversation?: string;
  sentiment_score?: string;
  sentiment_analysis_details?: string;
  call_cost?: number;
  aggregated_estimated_cost?: number;
  model_name?: string;
  asr_service?: string;
  tts_service?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  hangup_source?: string | null;
  hangup_reason?: string | null;
  extracted_variables?: Record<string, unknown>;
  interactions?: OmnidimCallInteraction[];
  channel_type?: string;
  [key: string]: unknown;
}

interface LocalCall {
  id: string;
  phone: string;
  status: string;
  provider: string;
  duration: number | null;
  createdAt: string;
  providerCallId?: string;
  agent: { id: string; name: string } | null;
}

interface Agent {
  id: string;
  name: string;
  provider: string;
  providerAgentId?: string;
}

interface BolnaCostBreakdown {
  llm?: number;
  network?: number;
  platform?: number;
  synthesizer?: number;
  transcriber?: number;
}

interface BolnaTelephonyData {
  duration?: number;
  to_number?: string;
  from_number?: string;
  recording_url?: string;
  provider_call_id?: string;
  call_type?: string;
  provider?: string;
  hangup_by?: string;
  hangup_reason?: string;
  hangup_provider_code?: number;
  ring_duration?: number;
  to_number_carrier?: string;
}

interface BolnaExecution {
  id: string;
  agent_id: string;
  batch_id?: string;
  conversation_time?: number;
  total_cost?: number;
  status: string;
  error_message?: string | null;
  answered_by_voice_mail?: boolean;
  transcript?: string | null;
  created_at: string;
  updated_at: string;
  cost_breakdown?: BolnaCostBreakdown;
  telephony_data?: BolnaTelephonyData;
  extracted_data?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOmnidimDate(raw?: string | null): string {
  if (!raw) return '—';
  // Format: "MM/DD/YYYY HH:MM:SS"
  try {
    const [datePart, timePart] = raw.split(' ');
    const [month, day, year] = datePart.split('/');
    const iso = `${year}-${month}-${day}T${timePart}`;
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

function formatSecs(secs?: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  completed: { label: 'Completed', dot: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-400' },
  failed:    { label: 'Failed',    dot: 'bg-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',   text: 'text-red-700 dark:text-red-400' },
  busy:      { label: 'Busy',      dot: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-700 dark:text-yellow-400' },
  'no-answer': { label: 'No Answer', dot: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400' },
  ringing:   { label: 'Ringing',   dot: 'bg-blue-500',  bg: 'bg-blue-50 dark:bg-blue-950/30',  text: 'text-blue-700 dark:text-blue-400' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400' },
};

function StatusChip({ status }: { status?: string }) {
  const key = (status ?? '').toLowerCase().replace(/ /g, '_');
  const cfg = STATUS_CONFIG[key] ?? { label: status ?? '—', dot: 'bg-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const SENTIMENT_CONFIG: Record<string, { bg: string; text: string }> = {
  Positive: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
  Negative: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400' },
  Neutral:  { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
};

function SentimentChip({ score }: { score?: string }) {
  if (!score) return null;
  const cfg = SENTIMENT_CONFIG[score] ?? { bg: 'bg-muted', text: 'text-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Sparkles className="h-3 w-3" />
      {score}
    </span>
  );
}

// ── Call Detail Drawer ─────────────────────────────────────────────────────────

function CallDetailDrawer({ log, onClose }: { log: OmnidimCallLog; onClose: () => void }) {
  const duration = formatSecs(log.call_duration_in_seconds);
  const date = parseOmnidimDate(log.time_of_call);
  const isOutbound = (log.call_direction ?? '').toLowerCase() === 'outbound';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-xl overflow-y-auto bg-background shadow-2xl ring-1 ring-border">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip status={log.call_status} />
                {log.sentiment_score && <SentimentChip score={log.sentiment_score} />}
              </div>
              <p className="mt-1.5 text-lg font-semibold truncate">
                {isOutbound ? log.to_number : log.from_number ?? '—'}
              </p>
              <p className="text-sm text-muted-foreground">{date}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mr-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <Clock className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">{duration}</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <DollarSign className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">${(log.call_cost ?? 0).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground">Cost</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <MessageSquare className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">{log.interactions?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Turns</p>
            </div>
          </div>

          {/* Call info */}
          <div className="rounded-lg border divide-y">
            <Row label="Agent" value={log.bot_name} />
            <Row label="Direction" value={
              <span className="flex items-center gap-1 capitalize">
                {isOutbound ? <PhoneOutgoing className="h-3.5 w-3.5 text-blue-500" /> : <PhoneIncoming className="h-3.5 w-3.5 text-green-500" />}
                {log.call_direction ?? '—'}
              </span>
            } />
            <Row label="From" value={log.from_number} />
            <Row label="To" value={log.to_number} />
            <Row label="Channel" value={log.channel_type} />
            {(log.hangup_source || log.hangup_reason) && (
              <Row label="Hangup" value={[log.hangup_source, log.hangup_reason].filter(Boolean).join(' · ')} />
            )}
          </div>

          {/* Recording */}
          {(log.internal_recording_url || log.recording_url) && (() => {
            const raw = log.internal_recording_url ?? log.recording_url ?? '';
            const audioSrc = typeof raw === 'string' && raw.startsWith('https://')
              ? raw
              : typeof raw === 'string' && raw.startsWith('/')
                ? `https://www.omnidim.io${raw}`
                : String(raw);
            return (
              <div className="rounded-lg border p-4 space-y-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Mic className="h-4 w-4 text-muted-foreground" /> Recording
                </p>
                <audio
                  controls
                  src={audioSrc}
                  className="w-full h-10"
                  preload="metadata"
                >
                  Your browser does not support the audio element.
                </audio>
                <a
                  href={audioSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in new tab
                </a>
              </div>
            );
          })()}

          {/* Sentiment */}
          {log.sentiment_analysis_details && (
            <div className="rounded-lg border p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-muted-foreground" /> Sentiment Analysis
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{log.sentiment_analysis_details}</p>
            </div>
          )}

          {/* Extracted variables */}
          {log.extracted_variables && Object.keys(log.extracted_variables).length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                <BarChart2 className="h-4 w-4 text-muted-foreground" /> Extracted Variables
              </p>
              <div className="space-y-2">
                {Object.entries(log.extracted_variables).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 text-sm">
                    <span className="shrink-0 text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-right font-medium truncate max-w-xs">{String(v ?? '—')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversation turns */}
          {log.interactions && log.interactions.length > 0 && (
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-muted-foreground" /> Conversation
                <span className="ml-auto text-xs text-muted-foreground font-normal">{log.interactions.length} turns</span>
              </p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {log.interactions
                  .filter((t) => t.user_query || t.bot_response)
                  .map((turn, i) => (
                    <div key={turn.id ?? i} className="space-y-2">
                      {turn.user_query && (
                        <div className="flex gap-2">
                          <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium">U</div>
                          <div className="rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm max-w-xs">
                            {turn.user_query}
                          </div>
                        </div>
                      )}
                      {turn.bot_response && (
                        <div className="flex gap-2 justify-end">
                          <div className="rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 text-sm max-w-xs text-right">
                            {turn.bot_response}
                          </div>
                          <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">A</div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Technical details */}
          <div className="rounded-lg border divide-y">
            <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Technical</div>
            {log.model_name && <Row label={<span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5" />LLM</span>} value={log.model_name} />}
            {log.asr_service && <Row label={<span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5" />ASR</span>} value={log.asr_service} />}
            {log.tts_service && <Row label={<span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />TTS</span>} value={log.tts_service} />}
            {log.total_tokens != null && (
              <Row label="Tokens" value={`${log.prompt_tokens ?? 0} in · ${log.completion_tokens ?? 0} out`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value?: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

// ── Dispatch dialog ───────────────────────────────────────────────────────────

function DispatchDialog({ open, onOpenChange, onDispatched }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDispatched: (phone: string, agentName: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    phone: '', agentId: '', fromNumberId: '', customerName: '', accountId: '',
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
      queryClient.invalidateQueries({ queryKey: ['remote-call-logs'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      onDispatched(form.phone, selectedAgent?.name ?? 'Agent');
      setForm({ phone: '', agentId: '', fromNumberId: '', customerName: '', accountId: '' });
      onOpenChange(false);
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
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            Dispatch Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Phone Number <span className="text-destructive">*</span></Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 9876543210"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">E.164 format, e.g. +919876543210</p>
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
                    <span>{a.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({a.provider})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAgent && !selectedAgent.providerAgentId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> Agent not yet imported from provider
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              From Number ID
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              value={form.fromNumberId}
              onChange={(e) => setForm({ ...form, fromNumberId: e.target.value })}
              placeholder="Imported phone number ID"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Call Context
              <span className="ml-1 font-normal normal-case">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
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
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={dispatchMutation.isPending || !form.phone || !form.agentId}
          >
            {dispatchMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Dispatching…</>
            ) : (
              <><Phone className="mr-2 h-4 w-4" />Call Now</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Active call banner ─────────────────────────────────────────────────────────

function ActiveCallBanner({ phone, agentName, onDismiss }: {
  phone: string; agentName: string; onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
        <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Call Initiated</p>
        <p className="text-xs text-blue-700 dark:text-blue-300 font-mono truncate">
          {phone} <span className="font-sans font-normal">via {agentName}</span>
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-700 dark:text-blue-300" onClick={onDismiss}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Call log row ─────────────────────────────────────────────────────────────

function CallLogRow({ log, onClick }: { log: OmnidimCallLog; onClick: () => void }) {
  const isOutbound = (log.call_direction ?? '').toLowerCase() === 'outbound';
  const duration = formatSecs(log.call_duration_in_seconds);
  const date = parseOmnidimDate(log.time_of_call);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 transition-colors group"
    >
      {/* Direction icon */}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        isOutbound ? 'bg-blue-50 dark:bg-blue-950/50' : 'bg-green-50 dark:bg-green-950/50'
      }`}>
        {isOutbound
          ? <PhoneOutgoing className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          : <PhoneIncoming className="h-4 w-4 text-green-600 dark:text-green-400" />
        }
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm font-mono">{log.to_number ?? log.from_number ?? '—'}</span>
          {log.bot_name && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">via {log.bot_name}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{date}</span>
          {log.channel_type && log.channel_type !== 'Call' && (
            <><span>·</span><span>{log.channel_type}</span></>
          )}
          {log.hangup_reason && (
            <><span>·</span><span className="truncate max-w-[120px]">{log.hangup_reason}</span></>
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 shrink-0">
        {log.sentiment_score && <SentimentChip score={log.sentiment_score} />}
        <StatusChip status={log.call_status} />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {duration}
        </div>
        {log.call_cost != null && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            {log.call_cost.toFixed(3)}
          </div>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

// ── Omnidim logs tab ──────────────────────────────────────────────────────────

function OmnidimLogsTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<OmnidimCallLog | null>(null);
  const PAGE_SIZE = 20;

  const { data, isLoading, error, refetch, isFetching } = useQuery<{
    data: { logs: OmnidimCallLog[]; total: number };
  }>({
    queryKey: ['remote-call-logs', statusFilter, page],
    queryFn: () =>
      api.get('/calls/logs/remote', {
        params: {
          call_status: statusFilter !== 'all' ? statusFilter : undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="no-answer">No Answer</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <span className="ml-auto text-sm text-muted-foreground">
            {total > 0 ? `${total} call${total !== 1 ? 's' : ''}` : ''}
          </span>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5">
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive/60 mb-2" />
              <p className="text-sm text-destructive">Failed to load call logs from Omnidim</p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed">
            <div className="text-center">
              <Phone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No call logs found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== 'all' ? 'Try changing the status filter' : 'Dispatch a call to get started'}
              </p>
            </div>
          </div>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="divide-y">
              {logs.map((log, i) => (
                <CallLogRow
                  key={String(log.id ?? i)}
                  log={log}
                  onClick={() => setSelectedLog(log)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}
      </div>

      {selectedLog && (
        <CallDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  );
}

// ── Local calls tab ───────────────────────────────────────────────────────────

function LocalCallsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const LOCAL_STATUS_COLOR: Record<string, string> = {
    COMPLETED: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
    FAILED: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
    IN_PROGRESS: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
    RINGING: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
    QUEUED: 'bg-muted text-muted-foreground',
    CANCELLED: 'bg-muted text-muted-foreground',
  };

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
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="RINGING">Ringing</SelectItem>
          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : calls.length === 0 ? (
        <div className="flex h-60 items-center justify-center rounded-xl border border-dashed">
          <div className="text-center">
            <Phone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No local call records</p>
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {calls.map((call) => {
              const statusCls = LOCAL_STATUS_COLOR[call.status] ?? 'bg-muted text-muted-foreground';
              const isActive = ['IN_PROGRESS', 'RINGING'].includes(call.status);
              const secs = call.duration ?? 0;
              const dur = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs ? `${secs}s` : '—';
              return (
                <div key={call.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isActive ? 'bg-blue-50 dark:bg-blue-950/50' : 'bg-muted/60'
                  }`}>
                    <Phone className={`h-4 w-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
                    {isActive && (
                      <span className="absolute ml-5 mt-5 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-mono">{call.phone}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {call.agent?.name ?? 'No agent'} · {call.provider} · {new Date(call.createdAt).toLocaleString()}
                    </p>
                    {call.providerCallId && (
                      <p className="font-mono text-xs text-muted-foreground/60 mt-0.5 truncate">#{call.providerCallId}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{dur}</span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCls}`}>
                      {call.status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-destructive hover:text-destructive border-destructive/30"
                        onClick={() => endMutation.mutate(call.id)}
                        disabled={endMutation.isPending}
                      >
                        <PhoneOff className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Bolna execution drawer ────────────────────────────────────────────────────

function BolnaExecutionDrawer({ exec, onClose }: { exec: BolnaExecution; onClose: () => void }) {
  const tel = exec.telephony_data;
  const cb = exec.cost_breakdown;
  const secs = tel?.duration ?? exec.conversation_time ?? 0;
  const dur = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs ? `${secs}s` : '—';
  const isOutbound = (tel?.call_type ?? '').toLowerCase() === 'outbound';

  const BOLNA_STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
    completed:   { label: 'Completed',   dot: 'bg-green-500',  bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-400' },
    failed:      { label: 'Failed',      dot: 'bg-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-700 dark:text-red-400' },
    in_progress: { label: 'In Progress', dot: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-700 dark:text-blue-400' },
    queued:      { label: 'Queued',      dot: 'bg-gray-400',   bg: 'bg-muted',                          text: 'text-muted-foreground' },
  };
  const statusKey = exec.status.toLowerCase();
  const statusCfg = BOLNA_STATUS_CONFIG[statusKey] ?? { label: exec.status, dot: 'bg-gray-400', bg: 'bg-muted', text: 'text-muted-foreground' };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl overflow-y-auto bg-background shadow-2xl ring-1 ring-border">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                  {statusCfg.label}
                </span>
                <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2.5 py-1 text-xs font-medium">
                  Bolna
                </span>
                {exec.answered_by_voice_mail && (
                  <span className="rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2.5 py-1 text-xs font-medium">
                    Voicemail
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-lg font-semibold truncate font-mono">
                {tel?.to_number ?? tel?.from_number ?? exec.id.slice(0, 8)}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(exec.created_at).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mr-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <Clock className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">{dur}</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <DollarSign className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">${(exec.total_cost ?? 0).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground">Total Cost</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <TrendingUp className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-base font-semibold">{tel?.ring_duration != null ? `${tel.ring_duration}s` : '—'}</p>
              <p className="text-xs text-muted-foreground">Ring Time</p>
            </div>
          </div>

          {/* Telephony info */}
          <div className="rounded-lg border divide-y">
            <Row label="Direction" value={
              <span className="flex items-center gap-1 capitalize">
                {isOutbound
                  ? <PhoneOutgoing className="h-3.5 w-3.5 text-purple-500" />
                  : <PhoneIncoming className="h-3.5 w-3.5 text-green-500" />}
                {tel?.call_type ?? '—'}
              </span>
            } />
            <Row label="From" value={tel?.from_number} />
            <Row label="To" value={tel?.to_number} />
            <Row label="Carrier" value={tel?.to_number_carrier} />
            <Row label="Telephony" value={tel?.provider} />
            {(tel?.hangup_by || tel?.hangup_reason) && (
              <Row label="Hangup" value={[tel.hangup_by, tel.hangup_reason].filter(Boolean).join(' · ')} />
            )}
            {exec.error_message && (
              <Row label="Error" value={<span className="text-destructive text-xs">{exec.error_message}</span>} />
            )}
          </div>

          {/* Recording */}
          {tel?.recording_url && (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Mic className="h-4 w-4 text-muted-foreground" /> Recording
              </p>
              <audio controls src={tel.recording_url} className="w-full h-10" preload="metadata">
                Your browser does not support audio.
              </audio>
              <a href={tel.recording_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="h-3 w-3" />Open in new tab
              </a>
            </div>
          )}

          {/* Cost breakdown */}
          {cb && Object.keys(cb).length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-muted-foreground" /> Cost Breakdown
              </p>
              <div className="space-y-2">
                {Object.entries(cb).filter(([, v]) => v != null).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{k}</span>
                    <span className="font-medium">${Number(v).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {exec.transcript && (
            <div className="rounded-lg border p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" /> Transcript
              </p>
              <div className="max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed">{exec.transcript}</pre>
              </div>
            </div>
          )}

          {/* Extracted data */}
          {exec.extracted_data && Object.keys(exec.extracted_data).length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                <BarChart2 className="h-4 w-4 text-muted-foreground" /> Extracted Data
              </p>
              <div className="space-y-2">
                {Object.entries(exec.extracted_data).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
                    <span className="text-right font-medium">{String(v ?? '—')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution ID */}
          <div className="rounded-lg border divide-y">
            <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Technical</div>
            <Row label="Execution ID" value={<span className="font-mono text-xs">{exec.id}</span>} />
            {exec.batch_id && <Row label="Batch ID" value={<span className="font-mono text-xs">{exec.batch_id}</span>} />}
            {tel?.provider_call_id && <Row label="Provider Call ID" value={<span className="font-mono text-xs">{tel.provider_call_id}</span>} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bolna logs tab ────────────────────────────────────────────────────────────

function BolnaLogsTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedExec, setSelectedExec] = useState<BolnaExecution | null>(null);
  const PAGE_SIZE = 20;

  const { data: agentsData } = useQuery<{ data: Agent[] }>({
    queryKey: ['agents-bolna-filter'],
    queryFn: () => api.get('/agents', { params: { provider: 'BOLNA', limit: 100 } }).then((r) => r.data),
  });
  const bolnaAgents = agentsData?.data ?? [];

  const { data, isLoading, error, refetch, isFetching } = useQuery<{
    data: { executions: BolnaExecution[]; total: number; hasMore: boolean };
  }>({
    queryKey: ['bolna-executions', agentFilter, statusFilter, page],
    queryFn: () =>
      api.get('/calls/logs/bolna', {
        params: {
          agentId: agentFilter !== 'all' ? agentFilter : undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }).then((r) => r.data),
    refetchInterval: 30_000,
    enabled: agentFilter !== 'all', // Only fetch when agent is selected
  });

  const executions = data?.data?.executions ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredExecs = statusFilter !== 'all'
    ? executions.filter((e) => e.status.toLowerCase() === statusFilter)
    : executions;

  return (
    <>
      <div className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {bolnaAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching || agentFilter === 'all'} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {total > 0 && (
            <span className="ml-auto text-sm text-muted-foreground">
              {total} execution{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {agentFilter === 'all' ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed">
            <div className="text-center">
              <Bot className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Select an agent</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a Bolna agent to view its execution logs</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5">
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive/60 mb-2" />
              <p className="text-sm text-destructive">Failed to load Bolna executions</p>
            </div>
          </div>
        ) : filteredExecs.length === 0 ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed">
            <div className="text-center">
              <Phone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No executions found</p>
              <p className="text-xs text-muted-foreground mt-1">Dispatch a Bolna call to get started</p>
            </div>
          </div>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="divide-y">
              {filteredExecs.map((exec) => {
                const tel = exec.telephony_data;
                const secs = tel?.duration ?? exec.conversation_time ?? 0;
                const dur = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs ? `${secs}s` : '—';
                const phone = tel?.to_number ?? tel?.from_number ?? '—';
                const statusKey = exec.status.toLowerCase();
                const statusColors: Record<string, string> = {
                  completed: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400',
                  failed: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
                  in_progress: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
                };
                const statusCls = statusColors[statusKey] ?? 'bg-muted text-muted-foreground';
                const statusDots: Record<string, string> = { completed: 'bg-green-500', failed: 'bg-red-500', in_progress: 'bg-blue-500' };
                const dot = statusDots[statusKey] ?? 'bg-gray-400';

                return (
                  <button
                    key={exec.id}
                    onClick={() => setSelectedExec(exec)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-950/50">
                      <PhoneOutgoing className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm font-mono">{phone}</span>
                        <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 text-xs font-medium">Bolna</span>
                        {exec.answered_by_voice_mail && (
                          <span className="text-xs text-muted-foreground">Voicemail</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(exec.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                        {tel?.hangup_reason && ` · ${tel.hangup_reason}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusCls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {exec.status}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />{dur}
                      </div>
                      {exec.total_cost != null && (
                        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" />{exec.total_cost.toFixed(3)}
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {totalPages > 1 && agentFilter !== 'all' && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</Button>
          </div>
        )}
      </div>

      {selectedExec && (
        <BolnaExecutionDrawer exec={selectedExec} onClose={() => setSelectedExec(null)} />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Calls() {
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'omnidim' | 'bolna' | 'local'>('omnidim');
  const [activeCall, setActiveCall] = useState<{ phone: string; agentName: string } | null>(null);

  const handleDispatched = (phone: string, agentName: string) => {
    setActiveCall({ phone, agentName });
    toast({ title: 'Call dispatched', description: `Calling ${phone}…` });
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calls</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Dispatch and monitor voice calls</p>
        </div>
        <Button onClick={() => setDispatchOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Dispatch Call
        </Button>
      </div>

      {/* Active call banner */}
      {activeCall && (
        <ActiveCallBanner
          phone={activeCall.phone}
          agentName={activeCall.agentName}
          onDismiss={() => setActiveCall(null)}
        />
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {([
          { id: 'omnidim', label: 'Omnidim Logs' },
          { id: 'bolna',   label: 'Bolna Executions' },
          { id: 'local',   label: 'Local Records' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'omnidim' && <OmnidimLogsTab />}
      {activeTab === 'bolna' && <BolnaLogsTab />}
      {activeTab === 'local' && <LocalCallsTab />}

      {/* Dispatch dialog */}
      <DispatchDialog
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        onDispatched={handleDispatched}
      />
    </div>
  );
}
