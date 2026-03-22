import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentCard } from '@/components/agents/AgentCard';
import { ImportAgentsDialog } from '@/components/agents/ImportAgentsDialog';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';
import type { AgentCardData } from '@/components/agents/AgentCard';

interface AgentsResponse {
  success: boolean;
  data: AgentCardData[];
  pagination: { total: number; page: number; limit: number };
}

type AgentTypeFilter = 'ALL' | 'VOICE' | 'CHAT' | 'HYBRID';

const TYPE_TABS: { value: AgentTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'VOICE', label: 'Voice' },
  { value: 'CHAT', label: 'Chat' },
  { value: 'HYBRID', label: 'Hybrid' },
];

type AgentType = 'VOICE' | 'CHAT' | 'HYBRID';

interface CreateForm {
  name: string;
  agentType: AgentType;
  provider: string;
  systemPrompt: string;
  voiceModel: string;
  voiceLanguage: string;
  llmProvider: string;
  llmModel: string;
  isActive: boolean;
}

const emptyForm: CreateForm = {
  name: '',
  agentType: 'VOICE',
  provider: 'OMNIDIM',
  systemPrompt: '',
  voiceModel: 'female',
  voiceLanguage: 'en',
  llmProvider: 'OPENAI',
  llmModel: 'gpt-4o',
  isActive: true,
};

const LLM_MODELS: Record<string, string[]> = {
  OPENAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  ANTHROPIC: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
  GOOGLE: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
};

export default function Agents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AgentTypeFilter>('ALL');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);

  const { data, isLoading } = useQuery<AgentsResponse>({
    queryKey: ['agents', search, typeFilter],
    queryFn: () =>
      api
        .get('/agents', {
          params: {
            search: search || undefined,
            agentType: typeFilter !== 'ALL' ? typeFilter : undefined,
            limit: 50,
          },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/agents', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setCreateDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'Agent created' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to create agent' }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.systemPrompt) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      agentType: form.agentType,
      systemPrompt: form.systemPrompt,
      isActive: form.isActive,
    };

    const isVoice = form.agentType === 'VOICE' || form.agentType === 'HYBRID';
    const isChat = form.agentType === 'CHAT' || form.agentType === 'HYBRID';

    if (isVoice) {
      payload.provider = form.provider;
      payload.voiceLanguage = form.voiceLanguage;
      payload.voiceModel = form.voiceModel;
    }
    if (isChat) {
      payload.llmProvider = form.llmProvider;
      payload.llmModel = form.llmModel;
    }

    createMutation.mutate(payload);
  };

  const agents = data?.data ?? [];
  const isVoice = form.agentType === 'VOICE' || form.agentType === 'HYBRID';
  const isChat = form.agentType === 'CHAT' || form.agentType === 'HYBRID';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Manage your AI agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Download className="h-4 w-4" />
            Import Agents
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex rounded-lg bg-muted p-1">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                typeFilter === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          {agents.length === 0 && (
            <div className="col-span-full flex h-40 flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">No agents found.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Import from Provider
                </Button>
                <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Create Agent
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Agent Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Type</Label>
              <Select
                value={form.agentType}
                onValueChange={(v) => setForm({ ...form, agentType: v as AgentType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VOICE">Voice Agent</SelectItem>
                  <SelectItem value="CHAT">Chat Agent</SelectItem>
                  <SelectItem value="HYBRID">Hybrid (Voice + Chat)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My AI Agent"
              />
            </div>

            {/* Voice fields */}
            {isVoice && (
              <>
                <div className="space-y-2">
                  <Label>Voice Provider</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OMNIDIM">Omnidim</SelectItem>
                      <SelectItem value="BOLNA">Bolna</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={form.voiceLanguage}
                    onValueChange={(v) => setForm({ ...form, voiceLanguage: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Voice Model</Label>
                  <Select
                    value={form.voiceModel}
                    onValueChange={(v) => setForm({ ...form, voiceModel: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Chat/LLM fields */}
            {isChat && (
              <>
                <div className="space-y-2">
                  <Label>LLM Provider</Label>
                  <Select
                    value={form.llmProvider}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        llmProvider: v,
                        llmModel: LLM_MODELS[v]?.[0] ?? '',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPENAI">OpenAI</SelectItem>
                      <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                      <SelectItem value="GOOGLE">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={form.llmModel}
                    onValueChange={(v) => setForm({ ...form, llmModel: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(LLM_MODELS[form.llmProvider] ?? []).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="You are a helpful assistant..."
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !form.name || !form.systemPrompt}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Agents Dialog */}
      <ImportAgentsDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  );
}
