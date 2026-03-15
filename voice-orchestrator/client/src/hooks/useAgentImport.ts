import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/axios';

export interface RemoteAgent {
  providerAgentId: string;
  name: string;
  callType?: string;
  isActive?: boolean;
  importStatus: 'imported' | 'not_imported' | 'outdated';
  localAgentId?: string;
  updatedAt?: string;
  providerUpdatedAt?: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  failed: Array<{ id: string; error: string }>;
}

export interface ImportAgentResponse {
  agent: {
    id: string;
    name: string;
    provider: string;
  };
  action: 'created' | 'updated';
}

// ── Remote agent listing ──────────────────────────────────────────────────────

export function useRemoteAgents(provider: 'omnidim' | 'bolna', enabled = true) {
  return useQuery<RemoteAgent[]>({
    queryKey: ['remote-agents', provider],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: RemoteAgent[] }>(
        `/agents/remote/${provider}`,
      );
      return data.data;
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

// ── Single import (Omnidim) ───────────────────────────────────────────────────

export function useImportAgent() {
  const queryClient = useQueryClient();
  return useMutation<ImportAgentResponse, Error, string>({
    mutationFn: async (agentId: string) => {
      const { data } = await api.post<{ success: boolean; data: ImportAgentResponse }>(
        '/agents/import/omnidim',
        { agentId },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['remote-agents', 'omnidim'] });
    },
  });
}

// ── Bulk import (Omnidim) ─────────────────────────────────────────────────────

export function useImportAllAgents() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/agents/import/omnidim/all',
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['remote-agents', 'omnidim'] });
    },
  });
}

// ── Single import (Bolna) ─────────────────────────────────────────────────────

export function useImportBolnaAgent() {
  const queryClient = useQueryClient();
  return useMutation<ImportAgentResponse, Error, string>({
    mutationFn: async (agentId: string) => {
      const { data } = await api.post<{ success: boolean; data: ImportAgentResponse }>(
        '/agents/import/bolna',
        { agentId },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['remote-agents', 'bolna'] });
    },
  });
}

// ── Bulk import (Bolna) ───────────────────────────────────────────────────────

export function useImportAllBolnaAgents() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/agents/import/bolna/all',
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['remote-agents', 'bolna'] });
    },
  });
}

// ── Sync agent ────────────────────────────────────────────────────────────────

export function useSyncAgent() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: async (agentId: string) => {
      const { data } = await api.post<{ success: boolean; data: { id: string } }>(
        `/agents/${agentId}/sync`,
      );
      return data.data;
    },
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
