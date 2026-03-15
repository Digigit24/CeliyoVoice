import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/axios';

export interface AgentDetail {
  id: string;
  name: string;
  provider: string;
  providerAgentId?: string | null;
  voiceLanguage: string;
  voiceModel: string;
  systemPrompt: string;
  isActive: boolean;
  callType?: string | null;
  welcomeMessage?: string | null;
  providerConfig?: Record<string, unknown> | null;
  tools: string[];
  metadata?: {
    importedFrom?: string;
    importedAt?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  _count: { calls: number };
  lastCallAt?: string | null;
  successfulCalls?: number;
  avgDuration?: number | null;
}

export interface UpdateAgentPayload {
  name?: string;
  voiceLanguage?: string;
  voiceModel?: string;
  systemPrompt?: string;
  isActive?: boolean;
  callType?: string;
  welcomeMessage?: string;
  maxConcurrentCalls?: number;
  metadata?: Record<string, unknown>;
}

// ── Get single agent with stats ───────────────────────────────────────────────

export function useAgent(id: string | undefined) {
  return useQuery<AgentDetail>({
    queryKey: ['agent', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: AgentDetail }>(`/agents/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

// ── Update agent ──────────────────────────────────────────────────────────────

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation<AgentDetail, Error, UpdateAgentPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.put<{ success: boolean; data: AgentDetail }>(
        `/agents/${id}`,
        payload,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', id] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

// ── Delete agent ──────────────────────────────────────────────────────────────

export function useDeleteAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await api.delete(`/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

// ── Sync agent from provider ──────────────────────────────────────────────────

export function useSyncAgentById(id: string) {
  const queryClient = useQueryClient();
  return useMutation<AgentDetail, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: AgentDetail }>(
        `/agents/${id}/sync`,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', id] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
