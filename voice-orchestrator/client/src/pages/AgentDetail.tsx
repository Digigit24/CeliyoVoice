import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ExternalLink,
  Webhook,
  Plus,
  Trash,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  XCircle,
  Clock,
  Link,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { api } from '@/lib/axios';

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

// Bolna config shape (matches BolnaAgentV2)
interface BolnaTaskConfig {
  task_type?: string;
  tools_config?: {
    llm_agent?: {
      llm_config?: {
        provider?: string;
        model?: string;
        temperature?: number;
        max_tokens?: number;
      };
    };
    synthesizer?: {
      provider?: string;
      provider_config?: { voice?: string; voice_id?: string; model?: string };
      audio_format?: string;
    };
    transcriber?: {
      provider?: string;
      model?: string;
      language?: string;
      endpointing?: number;
    };
    input?: { provider?: string };
    output?: { provider?: string };
  };
  task_config?: {
    hangup_after_silence?: number;
    incremental_delay?: number;
    number_of_words_for_interruption?: number;
    call_terminate?: number;
    backchanneling?: boolean;
    ambient_noise?: boolean;
    ambient_noise_track?: string;
    voicemail?: boolean;
  };
}

interface BolnaConfig {
  id?: string;
  agent_name?: string;
  agent_type?: string;
  agent_status?: string;
  agent_welcome_message?: string;
  webhook_url?: string | null;
  tasks?: BolnaTaskConfig[];
  agent_prompts?: { task_1?: { system_prompt?: string } };
  [key: string]: unknown;
}

function isBolnaConfig(cfg: unknown): cfg is BolnaConfig {
  return cfg != null && typeof cfg === 'object' && 'tasks' in (cfg as object);
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

  const rawCfg = agent.providerConfig as OmnidimConfig | BolnaConfig | null;
  const cfg = isBolnaConfig(rawCfg) ? null : rawCfg as OmnidimConfig | null;
  const bolnaCfg = isBolnaConfig(rawCfg) ? rawCfg : null;
  const bolnaTask = bolnaCfg?.tasks?.[0];

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
          <InfoRow label="Voice" value={
            cfg?.voice_name
              ?? bolnaTask?.tools_config?.synthesizer?.provider_config?.voice
              ?? agent.voiceModel
          } />
          <InfoRow label="Voice Provider" value={
            cfg?.voice_provider
              ?? bolnaTask?.tools_config?.synthesizer?.provider
          } />
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
          {bolnaTask && (
            <>
              <Separator className="my-1" />
              <InfoRow label="LLM" value={<span className="font-mono text-xs">{bolnaTask.tools_config?.llm_agent?.llm_config?.model}</span>} />
              <InfoRow label="LLM Provider" value={bolnaTask.tools_config?.llm_agent?.llm_config?.provider} />
              <InfoRow label="ASR" value={`${bolnaTask.tools_config?.transcriber?.provider ?? ''} ${bolnaTask.tools_config?.transcriber?.model ?? ''}`.trim() || undefined} />
              <InfoRow label="Telephony" value={bolnaTask.tools_config?.input?.provider} />
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

  const rawCfgP = agent.providerConfig as OmnidimConfig | BolnaConfig | null;
  const cfg = isBolnaConfig(rawCfgP) ? null : rawCfgP as OmnidimConfig | null;
  const bolnaCfgP = isBolnaConfig(rawCfgP) ? rawCfgP : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Live config from {agent.provider}. Sync to refresh from provider.
          </p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[agent.provider] ?? 'bg-muted'}`}>
            {agent.provider}
          </span>
        </div>
        {agent.providerAgentId && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Sync
          </Button>
        )}
      </div>

      {!rawCfgP ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No provider config stored. Import this agent to populate config.</p>
        </div>
      ) : bolnaCfgP ? (
        // ── Bolna config layout ──────────────────────────────────────────
        <BolnaConfigView cfg={bolnaCfgP} />
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

// ── Bolna config view ─────────────────────────────────────────────────────────

function BolnaConfigView({ cfg }: { cfg: BolnaConfig }) {
  const task = cfg.tasks?.[0];
  const llm = task?.tools_config?.llm_agent?.llm_config;
  const synth = task?.tools_config?.synthesizer;
  const trans = task?.tools_config?.transcriber;
  const taskCfg = task?.task_config;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Voice / Synthesizer */}
      <SectionCard icon={<Mic className="h-4 w-4" />} title={<span className="flex items-center gap-1.5">Voice <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 text-xs font-medium">Bolna</span></span>}>
        <InfoRow label="Provider" value={synth?.provider} />
        <InfoRow label="Voice" value={synth?.provider_config?.voice ?? synth?.provider_config?.voice_id} />
        <InfoRow label="TTS Model" value={synth?.provider_config?.model} />
        <InfoRow label="Format" value={synth?.audio_format} />
      </SectionCard>

      {/* LLM */}
      <SectionCard icon={<Brain className="h-4 w-4" />} title={<span className="flex items-center gap-1.5">AI Model <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 text-xs font-medium">Bolna</span></span>}>
        <InfoRow label="Provider" value={llm?.provider} />
        <InfoRow label="Model" value={<span className="font-mono text-xs">{llm?.model}</span>} />
        <InfoRow label="Temperature" value={llm?.temperature} />
        <InfoRow label="Max Tokens" value={llm?.max_tokens} />
      </SectionCard>

      {/* Transcriber (ASR) */}
      <SectionCard icon={<Settings2 className="h-4 w-4" />} title="Speech Recognition (ASR)">
        <InfoRow label="Provider" value={trans?.provider} />
        <InfoRow label="Model" value={<span className="font-mono text-xs">{trans?.model}</span>} />
        <InfoRow label="Language" value={trans?.language} />
        <InfoRow label="Endpointing" value={trans?.endpointing != null ? `${trans.endpointing}ms` : undefined} />
      </SectionCard>

      {/* Call config */}
      <SectionCard icon={<Phone className="h-4 w-4" />} title="Call Behavior">
        <InfoRow label="Hangup after silence" value={taskCfg?.hangup_after_silence != null ? `${taskCfg.hangup_after_silence}s` : undefined} />
        <InfoRow label="Max call duration" value={taskCfg?.call_terminate != null ? `${taskCfg.call_terminate}s` : undefined} />
        <InfoRow label="Incremental delay" value={taskCfg?.incremental_delay != null ? `${taskCfg.incremental_delay}ms` : undefined} />
        <InfoRow label="Words to interrupt" value={taskCfg?.number_of_words_for_interruption} />
        <InfoRow label="Backchanneling" value={<BoolBadge value={taskCfg?.backchanneling} />} />
        <InfoRow label="Ambient noise" value={taskCfg?.ambient_noise ? (taskCfg.ambient_noise_track ?? 'On') : 'Off'} />
        <InfoRow label="Voicemail" value={<BoolBadge value={taskCfg?.voicemail} />} />
      </SectionCard>

      {/* Telephony */}
      {(task?.tools_config?.input?.provider || task?.tools_config?.output?.provider) && (
        <SectionCard icon={<Phone className="h-4 w-4" />} title="Telephony">
          <InfoRow label="Input provider" value={task.tools_config?.input?.provider} />
          <InfoRow label="Output provider" value={task.tools_config?.output?.provider} />
        </SectionCard>
      )}

      {/* Agent meta */}
      <SectionCard icon={<Bot className="h-4 w-4" />} title="Agent Meta">
        <InfoRow label="Agent Type" value={cfg.agent_type} />
        <InfoRow label="Status" value={cfg.agent_status} />
        <InfoRow label="Webhook URL" value={cfg.webhook_url ? <span className="font-mono text-xs break-all">{cfg.webhook_url}</span> : 'Not set'} />
      </SectionCard>

      {/* Raw JSON */}
      <div className="md:col-span-2">
        <Collapsible title="Raw Provider Config (JSON)">
          <pre className="max-h-[24rem] overflow-auto text-xs leading-relaxed">
            {JSON.stringify(cfg, null, 2)}
          </pre>
        </Collapsible>
      </div>
    </div>
  );
}

// ── Calls tab ─────────────────────────────────────────────────────────────────

interface AgentCallLog {
  id?: number | string;
  to_number?: string;
  from_number?: string;
  call_status?: string;
  call_duration_in_seconds?: number;
  time_of_call?: string;
  recording_url?: string;
  internal_recording_url?: string;
  sentiment_score?: string;
  call_cost?: number;
  call_direction?: string;
  [key: string]: unknown;
}

// Bolna execution shape (trimmed)
interface BolnaExecLog {
  id: string;
  status: string;
  conversation_time?: number;
  total_cost?: number;
  created_at: string;
  telephony_data?: {
    to_number?: string;
    from_number?: string;
    recording_url?: string;
    duration?: number;
    call_type?: string;
    hangup_reason?: string;
  };
  extracted_data?: Record<string, unknown>;
}

const AGENT_CALL_STATUS: Record<string, { bg: string; text: string; dot: string }> = {
  completed:  { bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-400',  dot: 'bg-green-500' },
  failed:     { bg: 'bg-red-50 dark:bg-red-950/30',    text: 'text-red-700 dark:text-red-400',    dot: 'bg-red-500' },
  busy:       { bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  'no-answer':{ bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
};

function parseAgentDate(raw?: string | null): string {
  if (!raw) return '—';
  try {
    const [datePart, timePart] = raw.split(' ');
    const [month, day, year] = datePart.split('/');
    return new Date(`${year}-${month}-${day}T${timePart}`).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return raw; }
}

function OmnidimCallsTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['agent-call-logs', agentId, page],
    queryFn: async () => {
      const res = await api.get('/calls/logs/remote', {
        params: { agentId, page, pageSize: PAGE_SIZE },
      });
      return res.data.data as { logs: AgentCallLog[]; total: number };
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (!logs.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed">
        <div className="text-center">
          <Phone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No calls yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Dispatch a call to see activity here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} call{total !== 1 ? 's' : ''} total</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="divide-y">
          {logs.map((log, i) => {
            const key = (log.call_status ?? '').toLowerCase().replace(/ /g, '_');
            const statusCfg = AGENT_CALL_STATUS[key] ?? { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-gray-400' };
            const secs = log.call_duration_in_seconds ?? 0;
            const dur = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs ? `${secs}s` : '—';
            const isOutbound = (log.call_direction ?? '').toLowerCase() === 'outbound';
            const recUrl = (() => {
              const raw = log.internal_recording_url ?? log.recording_url ?? '';
              if (typeof raw === 'string' && raw.startsWith('https://')) return raw;
              if (typeof raw === 'string' && raw.startsWith('/')) return `https://www.omnidim.io${raw}`;
              return raw ? String(raw) : '';
            })();

            return (
              <div key={String(log.id ?? i)} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isOutbound ? 'bg-blue-50 dark:bg-blue-950/50' : 'bg-green-50 dark:bg-green-950/50'
                }`}>
                  {isOutbound
                    ? <PhoneOff className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    : <Phone className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium">{log.to_number ?? log.from_number ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{parseAgentDate(log.time_of_call)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {secs > 0 && <span className="text-xs text-muted-foreground">{dur}</span>}
                  {log.call_cost != null && (
                    <span className="text-xs text-muted-foreground">${log.call_cost.toFixed(3)}</span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                    {log.call_status ?? '—'}
                  </span>
                  {recUrl && (
                    <a href={recUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />Play
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}

function BolnaCallsTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['agent-bolna-executions', agentId, page],
    queryFn: async () => {
      const res = await api.get('/calls/logs/bolna', {
        params: { agentId, page, pageSize: PAGE_SIZE },
      });
      return res.data.data as { executions: BolnaExecLog[]; total: number; hasMore: boolean };
    },
  });

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (!executions.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed">
        <div className="text-center">
          <Phone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No executions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Dispatch a call to see activity here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} execution{total !== 1 ? 's' : ''} total</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="divide-y">
          {executions.map((exec) => {
            const statusKey = (exec.status ?? '').toLowerCase();
            const statusCfg = AGENT_CALL_STATUS[statusKey] ?? { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-gray-400' };
            const secs = exec.telephony_data?.duration ?? exec.conversation_time ?? 0;
            const dur = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs ? `${secs}s` : '—';
            const phone = exec.telephony_data?.to_number ?? exec.telephony_data?.from_number ?? '—';
            const recUrl = exec.telephony_data?.recording_url ?? '';
            const isOutbound = (exec.telephony_data?.call_type ?? '').toLowerCase() === 'outbound';

            return (
              <div key={exec.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isOutbound ? 'bg-purple-50 dark:bg-purple-950/50' : 'bg-green-50 dark:bg-green-950/50'
                }`}>
                  {isOutbound
                    ? <PhoneOff className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    : <Phone className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-medium">{phone}</p>
                    <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 text-xs font-medium">Bolna</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(exec.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {secs > 0 && <span className="text-xs text-muted-foreground">{dur}</span>}
                  {exec.total_cost != null && (
                    <span className="text-xs text-muted-foreground">${exec.total_cost.toFixed(4)}</span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                    {exec.status}
                  </span>
                  {recUrl && (
                    <a href={recUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />Play
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}

function CallsTab({ agentId }: { agentId: string }) {
  const { data: agent } = useAgent(agentId);
  const isBolna = agent?.provider === 'BOLNA';
  return isBolna ? <BolnaCallsTab agentId={agentId} /> : <OmnidimCallsTab agentId={agentId} />;
}

// ── Post-Call tab ──────────────────────────────────────────────────────────────

interface PostCallAction {
  id: string;
  name: string;
  type: 'WEBHOOK';
  config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    includeRawPayload: boolean;
    secret?: string;
  };
  isEnabled: boolean;
  createdAt: string;
}

interface PostCallExecution {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  responseStatus?: number;
  error?: string;
  executedAt: string;
  action: { name: string; type: string };
}

const EXEC_STATUS: Record<string, { icon: typeof CheckCircle; cls: string; label: string }> = {
  SUCCESS: { icon: CheckCircle, cls: 'text-green-600', label: 'Success' },
  FAILED:  { icon: XCircle,     cls: 'text-red-600',   label: 'Failed' },
  SKIPPED: { icon: Clock,       cls: 'text-muted-foreground', label: 'Skipped' },
};

function AddActionDialog({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    secret: '',
    includeRawPayload: false,
  });

  const mutation = useMutation({
    mutationFn: (body: object) =>
      api.post(`/agents/${agentId}/post-call-actions`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-call-actions', agentId] });
      toast({ title: 'Action created' });
      onClose();
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create action' }),
  });

  const handleSave = () => {
    mutation.mutate({
      name: form.name,
      type: 'WEBHOOK',
      config: {
        url: form.url,
        method: form.method,
        headers: {},
        includeRawPayload: form.includeRawPayload,
        ...(form.secret ? { secret: form.secret } : {}),
      },
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Add Webhook Action
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Action Name <span className="text-destructive">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Send to CRM"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Webhook URL <span className="text-destructive">*</span></Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://your-server.com/hook"
                className="font-mono text-sm"
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Signing Secret <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              placeholder="hmac secret for X-Webhook-Signature header"
              type="password"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-raw"
              checked={form.includeRawPayload}
              onChange={(e) => setForm({ ...form, includeRawPayload: e.target.checked })}
              className="h-4 w-4 rounded border"
            />
            <label htmlFor="include-raw" className="text-sm text-muted-foreground cursor-pointer">
              Include raw provider payload in request body
            </label>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={mutation.isPending || !form.name || !form.url}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostCallTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const { data: urlData } = useQuery({
    queryKey: ['post-call-webhook-url', agentId],
    queryFn: () =>
      api.get(`/agents/${agentId}/post-call-actions/webhook-url`).then((r) => r.data.data as { url: string }),
  });

  const { data: actionsData, isLoading: actionsLoading } = useQuery({
    queryKey: ['post-call-actions', agentId],
    queryFn: () =>
      api.get(`/agents/${agentId}/post-call-actions`).then((r) => r.data.data as PostCallAction[]),
  });

  const { data: execData } = useQuery({
    queryKey: ['post-call-executions', agentId],
    queryFn: () =>
      api.get(`/agents/${agentId}/post-call-actions/executions`).then((r) => r.data.data as PostCallExecution[]),
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.put(`/agents/${agentId}/post-call-actions/${id}`, { isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['post-call-actions', agentId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${agentId}/post-call-actions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-call-actions', agentId] });
      toast({ title: 'Action deleted' });
    },
  });

  const webhookUrl = urlData?.url ?? '';

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const actions = actionsData ?? [];
  const executions = execData ?? [];

  return (
    <div className="space-y-6">
      {/* ── Incoming Webhook URL ─────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
            <Link className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Incoming Webhook URL</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste this URL in your Omnidim dashboard → Agent → Post-Call → Delivery Method → Webhook
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-background border px-3 py-1.5 text-xs font-mono">
                {webhookUrl || 'Loading…'}
              </code>
              <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0 gap-1.5">
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border bg-background/60 p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Setup Instructions</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the Omnidim dashboard and go to your agent</li>
            <li>Click <strong>Post-Call</strong> tab → <strong>Delivery Method</strong> → select <strong>Webhook</strong></li>
            <li>Paste the URL above into the webhook URL field</li>
            <li>Select what to include: Summary, Sentiment, Extracted Variables, Full Conversation</li>
            <li>Save — Omnidim will POST after every completed call</li>
          </ol>
        </div>
      </div>

      {/* ── Outbound Actions ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold text-sm">Outbound Actions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actions fired after every call ends — forward data to your CRM, database, or any HTTP endpoint
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Action
          </Button>
        </div>

        {actionsLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : actions.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-xl border border-dashed">
            <div className="text-center">
              <Webhook className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No actions configured</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Add a webhook to forward call data after each call</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((action) => (
              <div key={action.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Webhook className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{action.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {action.config.method} {action.config.url}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium ${action.isEnabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {action.isEnabled ? 'On' : 'Off'}
                  </span>
                  <button
                    onClick={() => toggleMutation.mutate({ id: action.id, isEnabled: !action.isEnabled })}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    disabled={toggleMutation.isPending}
                  >
                    {action.isEnabled
                      ? <ToggleRight className="h-5 w-5 text-primary" />
                      : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(action.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Execution Log ────────────────────────────────────────────── */}
      {executions.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-3">Recent Executions</p>
          <div className="rounded-xl border overflow-hidden">
            <div className="divide-y">
              {executions.slice(0, 20).map((exec) => {
                const cfg = EXEC_STATUS[exec.status] ?? EXEC_STATUS.FAILED;
                const Icon = cfg.icon;
                return (
                  <div key={exec.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon className={`h-4 w-4 shrink-0 ${cfg.cls}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{exec.action.name}</p>
                      {exec.error && (
                        <p className="text-xs text-destructive truncate">{exec.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {exec.responseStatus != null && (
                        <span className={`font-mono font-medium ${exec.responseStatus < 400 ? 'text-green-600' : 'text-red-600'}`}>
                          {exec.responseStatus}
                        </span>
                      )}
                      <span>{new Date(exec.executedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {addOpen && <AddActionDialog agentId={agentId} onClose={() => setAddOpen(false)} />}
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
  const rawPageCfg = agent.providerConfig as OmnidimConfig | BolnaConfig | null;
  const cfg = isBolnaConfig(rawPageCfg) ? null : rawPageCfg as OmnidimConfig | null;
  const bolnaPageCfg = isBolnaConfig(rawPageCfg) ? rawPageCfg : null;
  const bolnaLLM = bolnaPageCfg?.tasks?.[0]?.tools_config?.llm_agent?.llm_config?.model;

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
                {(cfg?.llm_service ?? bolnaLLM) && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                    {cfg?.llm_service ?? bolnaLLM}
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
          <TabsTrigger value="post-call">Post-Call</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agentId={id!} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <ProviderConfigTab agentId={id!} />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <CallsTab agentId={id!} />
        </TabsContent>

        <TabsContent value="post-call" className="mt-4">
          <PostCallTab agentId={id!} />
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
