import type { PrismaClient, Agent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { OmnidimService } from '../providers/omnidim/omnidim.service';
import { BolnaService } from '../providers/bolna/bolna.service';
import { resolveCredentials } from '../providers/credentialResolver';
import type { OmnidimFullAgent } from '../providers/omnidim/omnidim.types';
import { logger } from '../utils/logger';

export type ImportStatus = 'imported' | 'not_imported' | 'outdated';

export interface RemoteAgentWithStatus {
  providerAgentId: string;
  name: string;
  callType?: string;
  isActive?: boolean;
  importStatus: ImportStatus;
  localAgentId?: string;
  updatedAt?: string;
  providerUpdatedAt?: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  failed: Array<{ id: string; error: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a systemPrompt by concatenating context_breakdown entries.
 */
function buildSystemPrompt(agent: OmnidimFullAgent): string {
  if (!agent.context_breakdown?.length) return '';
  return agent.context_breakdown
    .filter((cb) => cb.is_enabled !== false)
    .map((cb) => `## ${cb.title}\n${cb.body}`)
    .join('\n\n');
}

/**
 * Derives the primary language code from an Omnidim agent.
 * Handles both list response (language: string[]) and legacy shapes.
 */
function deriveLanguage(agent: OmnidimFullAgent): string {
  // List response: language is an array of names like ["English","Hindi"]
  const lang = agent.language;
  if (Array.isArray(lang) && lang.length > 0) {
    const nameToCode: Record<string, string> = {
      English: 'en', Hindi: 'hi', Marathi: 'mr', Tamil: 'ta',
      Telugu: 'te', Kannada: 'kn', Bengali: 'bn', Gujarati: 'gu',
      Punjabi: 'pa', Malayalam: 'ml',
    };
    return nameToCode[lang[0]] ?? lang[0].toLowerCase().slice(0, 2);
  }
  if (typeof lang === 'string' && lang.trim()) return lang.trim();
  // Use accent code if available (e.g. "en-IN")
  if (agent.english_voice_accent) return agent.english_voice_accent;
  // Legacy shapes
  if (agent.languages?.length) return agent.languages[0] ?? 'en';
  if (agent.transcriber?.language) return agent.transcriber.language;
  return 'en';
}

/**
 * Maps an OmnidimFullAgent to the Prisma Agent create/update data shape.
 */
function mapOmnidimToAgent(
  omnidimAgent: OmnidimFullAgent,
  tenantId: string,
  ownerUserId: string,
) {
  const systemPrompt = buildSystemPrompt(omnidimAgent);
  const voiceLanguage = deriveLanguage(omnidimAgent);

  // voice can be a string ID (list) or a config object (single-fetch)
  const voiceModel = typeof omnidimAgent.voice === 'string'
    ? omnidimAgent.voice
    : (omnidimAgent.voice as { voice_id?: string } | undefined)?.voice_id ?? 'default';

  return {
    tenantId,
    ownerUserId,
    name: omnidimAgent.name,
    provider: 'OMNIDIM' as const,
    providerAgentId: String(omnidimAgent.id),
    voiceLanguage,
    voiceModel,
    systemPrompt: systemPrompt || omnidimAgent.name,
    isActive: omnidimAgent.is_active ?? true,
    providerConfig: omnidimAgent as unknown as Prisma.InputJsonValue,
    welcomeMessage: omnidimAgent.welcome_message ?? null,
    callType: omnidimAgent.bot_call_type ?? omnidimAgent.call_type ?? 'Incoming',
    tools: [] as Prisma.InputJsonValue,
    metadata: ({
      importedAt: new Date().toISOString(),
      importedFrom: 'omnidim',
    } as unknown) as Prisma.InputJsonValue,
  };
}

// ── AgentImportService ────────────────────────────────────────────────────────

export class AgentImportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Import a single Omnidim agent by its provider ID.
   * If an agent with the same (tenantId, providerAgentId) already exists, it is updated.
   */
  async importFromOmnidim(
    tenantId: string,
    ownerUserId: string,
    omnidimAgentId: string,
  ): Promise<{ agent: Agent; action: 'created' | 'updated' }> {
    const creds = await resolveCredentials(tenantId, 'OMNIDIM', this.prisma);
    const svc = new OmnidimService(creds.apiKey, creds.apiUrl);

    logger.debug({ tenantId, omnidimAgentId }, 'importFromOmnidim: fetching agent');
    const omnidimAgent = await svc.getAgent(omnidimAgentId);

    const data = mapOmnidimToAgent(omnidimAgent, tenantId, ownerUserId);

    // Upsert: unique on (tenantId, providerAgentId)
    const existing = await this.prisma.agent.findFirst({
      where: { tenantId, providerAgentId: String(omnidimAgentId) },
    });

    if (existing) {
      const updated = await this.prisma.agent.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          voiceLanguage: data.voiceLanguage,
          voiceModel: data.voiceModel,
          systemPrompt: data.systemPrompt,
          isActive: data.isActive,
          providerConfig: data.providerConfig,
          welcomeMessage: data.welcomeMessage,
          callType: data.callType,
          metadata: data.metadata,
        },
      });
      logger.info({ tenantId, agentId: updated.id, omnidimAgentId }, 'importFromOmnidim: updated');
      return { agent: updated, action: 'updated' };
    }

    const created = await this.prisma.agent.create({ data });
    logger.info({ tenantId, agentId: created.id, omnidimAgentId }, 'importFromOmnidim: created');
    return { agent: created, action: 'created' };
  }

  /**
   * Import all agents from Omnidim for a tenant.
   * Paginates through all pages and upserts each agent.
   */
  async importAllFromOmnidim(
    tenantId: string,
    ownerUserId: string,
  ): Promise<ImportResult> {
    const creds = await resolveCredentials(tenantId, 'OMNIDIM', this.prisma);
    const svc = new OmnidimService(creds.apiKey, creds.apiUrl);

    // Collect all agents from all pages
    const allAgents: OmnidimFullAgent[] = [];
    let page = 1;
    const pageSize = 50;

    while (true) {
      const resp = await svc.listAgents(page, pageSize);
      const agents = resp.bots ?? [];
      allAgents.push(...agents);
      if (agents.length < pageSize) break;
      page++;
    }

    logger.info({ tenantId, total: allAgents.length }, 'importAllFromOmnidim: starting batch import');

    const result: ImportResult = { imported: 0, updated: 0, failed: [] };

    for (const remoteAgent of allAgents) {
      try {
        // Add a small delay to respect rate limits
        if (allAgents.indexOf(remoteAgent) > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const { action } = await this.importFromOmnidim(
          tenantId,
          ownerUserId,
          String(remoteAgent.id),
        );
        if (action === 'created') result.imported++;
        else result.updated++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ tenantId, agentId: remoteAgent.id, err }, 'importAllFromOmnidim: failed to import agent');
        result.failed.push({ id: remoteAgent.id, error: errorMsg });
      }
    }

    logger.info({ tenantId, ...result }, 'importAllFromOmnidim: batch complete');
    return result;
  }

  /**
   * List remote agents from a provider and enrich each with local import status.
   */
  async listRemoteAgents(
    tenantId: string,
    provider: 'OMNIDIM' | 'BOLNA',
  ): Promise<RemoteAgentWithStatus[]> {
    const creds = await resolveCredentials(tenantId, provider, this.prisma);

    let remoteAgents: Array<{ id: string; name: string; call_type?: string; is_active?: boolean; updated_at?: string }> = [];

    if (provider === 'OMNIDIM') {
      const svc = new OmnidimService(creds.apiKey, creds.apiUrl);
      const resp = await svc.listAgents(1, 100);
      const bots = resp.bots ?? [];
      if (bots.length > 0) {
        logger.info({ firstBotKeys: Object.keys(bots[0] as object), firstBot: bots[0] }, 'listRemoteAgents: sample bot structure from Omnidim');
      }
      remoteAgents = bots.map((a) => ({
        id: String(a.id),
        name: a.name,
        call_type: a.bot_call_type ?? a.call_type,
        is_active: a.is_active ?? true,
        updated_at: a.updated_at,
      }));
    } else {
      const svc = new BolnaService(creds.apiKey, creds.apiUrl);
      const resp = await svc.listAgents(1, 100);
      remoteAgents = (resp.agents ?? []).map((a) => ({
        id: a.id,
        name: a.agent_name,
        is_active: a.agent_status === 'active',
        updated_at: a.updated_at,
      }));
    }

    // Load local agents for this tenant to determine import status
    const localAgents = await this.prisma.agent.findMany({
      where: { tenantId, provider, isActive: true },
      select: { id: true, providerAgentId: true, updatedAt: true },
    });

    const localByProviderAgentId = new Map(
      localAgents.map((a) => [a.providerAgentId, a]),
    );

    return remoteAgents.map((remote): RemoteAgentWithStatus => {
      const local = localByProviderAgentId.get(remote.id);

      let importStatus: ImportStatus = 'not_imported';
      if (local) {
        // Consider "outdated" if remote was updated after local sync
        if (remote.updated_at && new Date(remote.updated_at) > local.updatedAt) {
          importStatus = 'outdated';
        } else {
          importStatus = 'imported';
        }
      }

      return {
        providerAgentId: remote.id,
        name: remote.name,
        callType: remote.call_type,
        isActive: remote.is_active,
        importStatus,
        localAgentId: local?.id,
        updatedAt: local?.updatedAt.toISOString(),
        providerUpdatedAt: remote.updated_at,
      };
    });
  }

  /**
   * Re-sync an existing local agent from its provider.
   */
  async syncAgent(agentId: string, tenantId: string): Promise<Agent> {
    const existing = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId },
    });

    if (!existing) throw new Error('Agent not found');
    if (!existing.providerAgentId) throw new Error('Agent has no provider ID — cannot sync');

    if (existing.provider === 'OMNIDIM') {
      const { agent } = await this.importFromOmnidim(
        tenantId,
        existing.ownerUserId,
        existing.providerAgentId,
      );
      return agent;
    }

    throw new Error(`Sync not yet supported for provider: ${existing.provider}`);
  }
}
