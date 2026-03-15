import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Loader2,
  Pencil,
  Phone,
  Mic,
  Brain,
  Settings2,
  Mail,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Languages,
  Zap,
  PhoneOff,
  PhoneForwarded,
  Variable,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/useToast';
import { useAgent, useUpdateAgent, useDeleteAgent, useSyncAgentById } from '@/hooks/useAgentDetail';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContextBreakdown {
  id?: number;
  context_title?: string;
  context_body?: string;
  title?: string;
  body?: string;
  is_enabled?: boolean;
}

interface PostCallConfig {
  id?: number;
  destination?: string;
  delivery_method?: unknown;
  include_summary?: boolean;
  include_full_conversation?: boolean;
  include_sentiment?: boolean;
  include_extracted_info?: boolean;
  extracted_variables?: Array<{ key: string; description: string }>;
  webhook_url?: string | false;
}

interface OmnidimConfig {
  voice_name?: string;
  voice_provider?: string;
  english_voice_accent?: string;
  speech_speed?: number;
  llm_service?: string;
  llm_temperature?: number;
  llm_straming_enabled?: boolean;
  asr_service?: string;
  asr_sarvam_model?: string;
  silence_timeout?: number;
  speech_start_timeout?: number;
  min_speech_duration_ms?: number;
  is_interruption_allowed?: boolean;
  interruption_min_words?: number;
  bot_call_type?: string;
  max_call_duration_in_sec?: number;
  call_cost_per_min?: number;
  is_end_call_enabled?: boolean;
  end_call_condition?: string | false;
  end_call_message?: string | false;
  is_transfer_enabled?: boolean;
  transfer_options?: unknown[];
  welcome_message?: string;
  context_breakdown?: ContextBreakdown[];
  post_call_config_ids?: PostCallConfig[];
  dynamic_variables?: unknown[];
  voicemail_enabled?: boolean;
  background_noise_enabled?: boolean;
  enable_web_search?: boolean;
  should_apply_noise_reduction?: boolean;
  languages?: Array<{ label: string; value: number }>;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value ?? '—'}</span>
    </div>
  );
}

function BoolBadge({ value, trueLabel = 'Yes', falseLabel = 'No' }: { value: unknown; trueLabel?: string; falseLabel?: string }) {
  const isTrue = Boolean(value);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      isTrue
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-muted text-muted-foreground'
    }`}>
      {isTrue ? trueLabel : falseLabel}
    </span>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/50">
        {children}
      </CardContent>
    </Card>
  );
}

function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
      >
        {title}
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
}

const PROVIDER_COLORS: Record<string, string> = {
  OMNIDIM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BOLNA: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ agentId }: { agentId: string }) {
  const { data: agent, isLoading } = useAgent(agentId);
  const updateMutation = useUpdateAgent(agentId);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [welcomeDraft, setWelcomeDraft] = useState('');

  if (isLoading || !agent) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cfg = agent.providerConfig as OmnidimConfig | null;

  const handleSavePrompt = async () => {
    try {
      await updateMutation.mutateAsync({ systemPrompt: promptDraft });
      setEditingPrompt(false);
      toast({ title: 'System prompt updated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update system prompt' });
    }
  };

  const handleSaveWelcome = async () => {
    try {
      await updateMutation.mutateAsync({ welcomeMessage: welcomeDraft });
      setEditingWelcome(false);
      toast({ title: 'Welcome message updated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update welcome message' });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Basic Info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Basic Info</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border/50 text-sm">
          <InfoRow label="Provider" value={
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[agent.provider] ?? 'bg-muted'}`}>
              {agent.provider}
            </span>
          } />
          {agent.providerAgentId && (
            <InfoRow label="Provider ID" value={
              <span className="flex items-center font-mono text-xs">
                {agent.providerAgentId}
                <CopyButton text={agent.providerAgentId} />
              </span>
            } />
          )}
          <InfoRow label="Language" value={agent.voiceLanguage} />
          <InfoRow label="Voice" value={cfg?.voice_name ?? agent.voiceModel} />
          <InfoRow label="Voice Provider" value={cfg?.voice_provider} />
          <InfoRow label="Call Type" value={
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              (agent.callType ?? 'Incoming') === 'Outgoing'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
            }`}>
              {agent.callType ?? 'Incoming'}
            </span>
          } />
          <Separator className="my-1" />
          <InfoRow label="Created" value={<span className="text-xs">{formatDate(agent.createdAt)}</span>} />
          <InfoRow label="Updated" value={<span className="text-xs">{formatDate(agent.updatedAt)}</span>} />
          {agent.metadata?.importedAt && (
            <InfoRow label="Imported" value={<span className="text-xs">{formatDate(String(agent.metadata.importedAt))}</span>} />
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Quick Stats</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border/50 text-sm">
          <InfoRow label="Total Calls" value={<span className="font-semibold">{agent._count.calls}</span>} />
          <InfoRow label="Successful Calls" value={agent.successfulCalls ?? 0} />
          <InfoRow label="Avg Duration" value={formatDuration(agent.avgDuration)} />
          <InfoRow label="Last Call" value={<span className="text-xs">{formatDate(agent.lastCallAt)}</span>} />
          {cfg && (
            <>
              <Separator className="my-1" />
              <InfoRow label="LLM Model" value={<span className="font-mono text-xs">{cfg.llm_service}</span>} />
              <InfoRow label="LLM Temp" value={cfg.llm_temperature} />
              <InfoRow label="ASR Service" value={cfg.asr_service} />
              <InfoRow label="Cost/min" value={cfg.call_cost_per_min != null ? `$${cfg.call_cost_per_min}` : undefined} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Welcome Message */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Welcome Message
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => { setWelcomeDraft(agent.welcomeMessage ?? cfg?.welcome_message ?? ''); setEditingWelcome(true); }}>
              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {agent.welcomeMessage ?? cfg?.welcome_message ?? 'No welcome message set.'}
          </p>
        </CardContent>
      </Card>

      {/* Languages */}
      {cfg?.languages && cfg.languages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Languages className="h-4 w-4 text-muted-foreground" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(cfg.languages as Array<{ label: string; value: number }>).map((l) => (
              <span key={l.value} className="rounded-full border px-3 py-1 text-xs font-medium">
                {l.label}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* System Prompt */}
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">System Prompt</CardTitle>
            <Button variant="outline" size="sm" onClick={() => { setPromptDraft(agent.systemPrompt); setEditingPrompt(true); }}>
              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Context breakdown as readable sections if available */}
          {cfg?.context_breakdown && cfg.context_breakdown.length > 0 ? (
            cfg.context_breakdown
              .filter((cb) => cb.is_enabled !== false)
              .map((cb, i) => (
                <div key={cb.id ?? i} className="rounded-lg border p-3">
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {cb.context_title ?? cb.title}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {cb.context_body ?? cb.body}
                  </p>
                </div>
              ))
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed">
              {agent.systemPrompt || 'No system prompt set.'}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Edit dialogs */}
      <Dialog open={editingPrompt} onOpenChange={setEditingPrompt}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit System Prompt</DialogTitle></DialogHeader>
          <Textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} rows={14} className="font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrompt(false)}>Cancel</Button>
            <Button onClick={handleSavePrompt} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingWelcome} onOpenChange={setEditingWelcome}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Welcome Message</DialogTitle></DialogHeader>
          <Textarea value={welcomeDraft} onChange={(e) => setWelcomeDraft(e.target.value)} rows={4} placeholder="Hello! How can I help you today?" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWelcome(false)}>Cancel</Button>
            <Button onClick={handleSaveWelcome} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Provider Config tab ───────────────────────────────────────────────────────

function ProviderConfigTab({ agentId }: { agentId: string }) {
  const { data: agent } = useAgent(agentId);
  const syncMutation = useSyncAgentById(agentId);

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast({ title: 'Agent synced', description: 'Provider config updated successfully.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      toast({ variant: 'destructive', title: 'Sync failed', description: message });
    }
  };

  if (!agent) return null;

  const cfg = agent.providerConfig as OmnidimConfig | null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Live config from {agent.provider}. Sync to refresh from provider.
        </p>
        {agent.providerAgentId && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Sync
          </Button>
        )}
      </div>

      {!cfg ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No provider config stored. Import this agent to populate config.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Voice */}
          <SectionCard icon={<Mic className="h-4 w-4" />} title="Voice">
            <InfoRow label="Voice Name" value={cfg.voice_name} />
            <InfoRow label="Provider" value={cfg.voice_provider} />
            <InfoRow label="Accent" value={cfg.english_voice_accent} />
            <InfoRow label="Speed" value={cfg.speech_speed != null ? `${cfg.speech_speed}×` : undefined} />
          </SectionCard>

          {/* LLM */}
          <SectionCard icon={<Brain className="h-4 w-4" />} title="AI Model">
            <InfoRow label="Model" value={<span className="font-mono text-xs">{cfg.llm_service}</span>} />
            <InfoRow label="Temperature" value={cfg.llm_temperature} />
            <InfoRow label="Streaming" value={<BoolBadge value={cfg.llm_straming_enabled} />} />
          </SectionCard>

          {/* Speech recognition */}
          <SectionCard icon={<Settings2 className="h-4 w-4" />} title="Speech Recognition (ASR)">
            <InfoRow label="Provider" value={cfg.asr_service} />
            {cfg.asr_sarvam_model && <InfoRow label="Model" value={<span className="font-mono text-xs">{cfg.asr_sarvam_model}</span>} />}
            <InfoRow label="Silence Timeout" value={cfg.silence_timeout != null ? `${cfg.silence_timeout}ms` : undefined} />
            <InfoRow label="Speech Start Timeout" value={cfg.speech_start_timeout != null ? `${cfg.speech_start_timeout}ms` : undefined} />
            <InfoRow label="Min Speech Duration" value={cfg.min_speech_duration_ms != null ? `${cfg.min_speech_duration_ms}ms` : undefined} />
            <InfoRow label="Interruption" value={<BoolBadge value={cfg.is_interruption_allowed} trueLabel="Allowed" falseLabel="Disabled" />} />
            {cfg.is_interruption_allowed && cfg.interruption_min_words != null && (
              <InfoRow label="Min Words to Interrupt" value={cfg.interruption_min_words} />
            )}
          </SectionCard>

          {/* Call behavior */}
          <SectionCard icon={<Phone className="h-4 w-4" />} title="Call Behavior">
            <InfoRow label="Call Type" value={
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                cfg.bot_call_type === 'Outgoing'
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
              }`}>{cfg.bot_call_type ?? '—'}</span>
            } />
            <InfoRow label="Max Duration" value={cfg.max_call_duration_in_sec != null ? `${cfg.max_call_duration_in_sec}s (${Math.round(cfg.max_call_duration_in_sec / 60)}min)` : undefined} />
            <InfoRow label="Cost/min" value={cfg.call_cost_per_min != null ? `$${cfg.call_cost_per_min}` : undefined} />
            <InfoRow label="Voicemail Detection" value={<BoolBadge value={cfg.voicemail_enabled} />} />
            <InfoRow label="Background Noise" value={<BoolBadge value={cfg.background_noise_enabled} />} />
            <InfoRow label="Noise Reduction" value={<BoolBadge value={cfg.should_apply_noise_reduction} />} />
            <InfoRow label="Web Search" value={<BoolBadge value={cfg.enable_web_search} />} />
          </SectionCard>

          {/* End Call */}
          <SectionCard icon={<PhoneOff className="h-4 w-4" />} title="End Call Rules">
            <InfoRow label="Auto End Call" value={<BoolBadge value={cfg.is_end_call_enabled} />} />
            {cfg.is_end_call_enabled && (
              <>
                <InfoRow label="Condition" value={cfg.end_call_condition || undefined} />
                <InfoRow label="Message" value={cfg.end_call_message || undefined} />
              </>
            )}
          </SectionCard>

          {/* Transfer */}
          <SectionCard icon={<PhoneForwarded className="h-4 w-4" />} title="Call Transfer">
            <InfoRow label="Transfer Enabled" value={<BoolBadge value={cfg.is_transfer_enabled} />} />
            <InfoRow label="Transfer Options" value={
              cfg.transfer_options?.length
                ? `${cfg.transfer_options.length} configured`
                : 'None'
            } />
          </SectionCard>

          {/* Dynamic Variables */}
          {cfg.dynamic_variables && (
            <SectionCard icon={<Variable className="h-4 w-4" />} title="Dynamic Variables">
              {cfg.dynamic_variables.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No dynamic variables configured.</p>
              ) : (
                cfg.dynamic_variables.map((v, i) => (
                  <InfoRow key={i} label={String((v as { key?: string }).key ?? i)} value={String((v as { value?: unknown }).value ?? '—')} />
                ))
              )}
            </SectionCard>
          )}

          {/* Post Call Config */}
          {cfg.post_call_config_ids && cfg.post_call_config_ids.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Post Call Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cfg.post_call_config_ids.map((pc, i) => (
                  <div key={pc.id ?? i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{pc.destination || 'No destination'}</span>
                      {pc.include_summary && <Badge variant="secondary" className="text-xs">Summary</Badge>}
                      {pc.include_full_conversation && <Badge variant="secondary" className="text-xs">Transcript</Badge>}
                      {pc.include_sentiment && <Badge variant="secondary" className="text-xs">Sentiment</Badge>}
                      {pc.include_extracted_info && <Badge variant="secondary" className="text-xs">Extracted Info</Badge>}
                    </div>
                    {pc.extracted_variables && pc.extracted_variables.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Extracted Variables</p>
                        {pc.extracted_variables.map((v) => (
                          <div key={v.key} className="rounded-md bg-muted/50 px-3 py-2">
                            <p className="text-xs font-semibold">{v.key}</p>
                            <p className="text-xs text-muted-foreground">{v.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {pc.webhook_url && pc.webhook_url !== false && (
                      <InfoRow label="Webhook" value={<span className="font-mono text-xs break-all">{String(pc.webhook_url)}</span>} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Raw JSON — collapsible */}
          <div className="md:col-span-2">
            <Collapsible title="Raw Provider Config (JSON)">
              <pre className="max-h-[24rem] overflow-auto text-xs leading-relaxed">
                {JSON.stringify(cfg, null, 2)}
              </pre>
            </Collapsible>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calls tab ─────────────────────────────────────────────────────────────────

function CallsTab() {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
      <div className="text-center">
        <Phone className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No calls yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Start a call to see activity here.</p>
      </div>
    </div>
  );
}

// ── Tools tab ─────────────────────────────────────────────────────────────────

function ToolsTab() {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
      <div className="text-center">
        <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No tools configured</p>
        <p className="mt-1 text-xs text-muted-foreground">Tool assignment coming in a future update.</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const updateMutation = useUpdateAgent(id!);
  const deleteMutation = useDeleteAgent(id!);
  const syncMutation = useSyncAgentById(id!);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ isActive: checked });
      toast({ title: checked ? 'Agent activated' : 'Agent deactivated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update status' });
    }
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast({ title: 'Agent synced', description: 'Latest config fetched from provider.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      toast({ variant: 'destructive', title: 'Sync failed', description: message });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      toast({ title: 'Agent deleted' });
      navigate('/agents');
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete agent' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  const providerColor = PROVIDER_COLORS[agent.provider] ?? 'bg-muted text-muted-foreground';
  const cfg = agent.providerConfig as OmnidimConfig | null;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Agents
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">{agent.name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${providerColor}`}>
                  {agent.provider}
                </span>
                {cfg?.llm_service && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                    {cfg.llm_service}
                  </span>
                )}
                {agent.providerAgentId && (
                  <Badge variant="outline" className="text-xs">Synced</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="agent-active" className="text-sm">Active</Label>
            <Switch
              id="agent-active"
              checked={agent.isActive}
              onCheckedChange={handleToggleActive}
              disabled={updateMutation.isPending}
            />
          </div>

          {agent.providerAgentId && (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending}>
              {syncMutation.isPending
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Sync
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Provider Config</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agentId={id!} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <ProviderConfigTab agentId={id!} />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <CallsTab />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <ToolsTab />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Agent</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{agent.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
