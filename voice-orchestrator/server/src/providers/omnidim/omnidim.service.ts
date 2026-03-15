import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { logger } from '../../utils/logger';
import type {
  OmnidimFullAgent,
  OmnidimAgentListResponse,
  OmnidimCreateAgentPayload,
} from './omnidim.types';

// ── Custom errors ─────────────────────────────────────────────────────────────

export class ProviderAuthError extends Error {
  readonly statusCode = 401;
  constructor(provider: string) {
    super(`Authentication failed for provider: ${provider}. Check your API key.`);
    this.name = 'ProviderAuthError';
  }
}

export class ProviderApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

// ── Omnidim Service ───────────────────────────────────────────────────────────

/**
 * Direct HTTP client for the Omnidim REST API.
 * Wraps all calls with error handling, logging, and typed responses.
 * Base URL: https://backend.omnidim.io/api/v1
 */
export class OmnidimService {
  private readonly http: AxiosInstance;

  constructor(apiKey: string, apiUrl: string) {
    const baseURL = apiUrl.replace(/\/$/, '');
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  private handleError(err: unknown, context: string): never {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const message =
        (err.response?.data as { message?: string; error?: string })?.message ??
        (err.response?.data as { message?: string; error?: string })?.error ??
        err.message;

      logger.debug({ status, message, context }, 'Omnidim API error');

      if (status === 401) {
        throw new ProviderAuthError('Omnidim');
      }
      throw new ProviderApiError(status >= 400 && status < 600 ? status : 502, message);
    }
    throw err;
  }

  /**
   * GET /api/v1/agents
   * Returns a paginated list of agents from Omnidim.
   */
  async listAgents(page = 1, pageSize = 50): Promise<OmnidimAgentListResponse> {
    try {
      logger.debug({ page, pageSize }, 'Omnidim: listAgents');
      const { data } = await this.http.get<OmnidimAgentListResponse>('/agents', {
        params: { pageno: page, pagesize: pageSize },
      });
      logger.debug({ count: data.agents?.length ?? 0 }, 'Omnidim: listAgents response');
      return data;
    } catch (err) {
      this.handleError(err, 'listAgents');
    }
  }

  /**
   * GET /api/v1/agents/{agent_id}
   * Returns the full agent configuration including all nested configs.
   */
  async getAgent(agentId: string): Promise<OmnidimFullAgent> {
    try {
      logger.debug({ agentId }, 'Omnidim: getAgent');
      const { data } = await this.http.get<OmnidimFullAgent>(`/agents/${agentId}`);
      logger.debug({ agentId, name: data.name }, 'Omnidim: getAgent response');
      return data;
    } catch (err) {
      this.handleError(err, 'getAgent');
    }
  }

  /**
   * POST /api/v1/agents/create
   * Creates a new agent on Omnidim.
   */
  async createAgent(payload: OmnidimCreateAgentPayload): Promise<OmnidimFullAgent> {
    try {
      logger.debug({ name: payload.name }, 'Omnidim: createAgent');
      const { data } = await this.http.post<OmnidimFullAgent>('/agents/create', payload);
      logger.debug({ agentId: data.id }, 'Omnidim: createAgent response');
      return data;
    } catch (err) {
      this.handleError(err, 'createAgent');
    }
  }

  /**
   * PUT /api/v1/agents/{agent_id}
   * Partial update of an existing agent.
   */
  async updateAgent(
    agentId: string,
    payload: Partial<OmnidimCreateAgentPayload>,
  ): Promise<OmnidimFullAgent> {
    try {
      logger.debug({ agentId }, 'Omnidim: updateAgent');
      const { data } = await this.http.put<OmnidimFullAgent>(`/agents/${agentId}`, payload);
      logger.debug({ agentId }, 'Omnidim: updateAgent response');
      return data;
    } catch (err) {
      this.handleError(err, 'updateAgent');
    }
  }

  /**
   * DELETE /api/v1/agents/{agent_id}
   */
  async deleteAgent(agentId: string): Promise<void> {
    try {
      logger.debug({ agentId }, 'Omnidim: deleteAgent');
      await this.http.delete(`/agents/${agentId}`);
      logger.debug({ agentId }, 'Omnidim: deleteAgent done');
    } catch (err) {
      this.handleError(err, 'deleteAgent');
    }
  }
}
