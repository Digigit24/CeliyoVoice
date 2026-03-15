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
 * All outbound requests and responses are logged at INFO level so they show
 * up in normal dev/prod log output — no debug-level filtering needed.
 */
export class OmnidimService {
  private readonly http: AxiosInstance;
  private readonly baseURL: string;

  constructor(apiKey: string, apiUrl: string) {
    this.baseURL = apiUrl.replace(/\/$/, '');

    logger.info(
      { provider: 'OMNIDIM', baseURL: this.baseURL, keyPrefix: apiKey.slice(0, 8) + '...' },
      'OmnidimService: initialised with credentials',
    );

    this.http = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    });

    // ── Request interceptor — log every outbound call ──────────────────────
    this.http.interceptors.request.use((config) => {
      const fullUrl = `${config.baseURL ?? ''}${config.url ?? ''}`;
      logger.info(
        {
          provider: 'OMNIDIM',
          outbound: true,
          method: config.method?.toUpperCase(),
          url: fullUrl,
          params: config.params as unknown,
          bodyKeys: config.data ? Object.keys(config.data as object) : undefined,
        },
        'OMNIDIM → request',
      );
      return config;
    });

    // ── Response interceptor — log every response ──────────────────────────
    this.http.interceptors.response.use(
      (response) => {
        const fullUrl = `${response.config.baseURL ?? ''}${response.config.url ?? ''}`;
        logger.info(
          {
            provider: 'OMNIDIM',
            inbound: true,
            method: response.config.method?.toUpperCase(),
            url: fullUrl,
            status: response.status,
            dataKeys: response.data && typeof response.data === 'object'
              ? Object.keys(response.data as object).slice(0, 10)
              : undefined,
          },
          'OMNIDIM ← response',
        );
        return response;
      },
      (err: unknown) => {
        if (isAxiosError(err)) {
          const fullUrl = `${err.config?.baseURL ?? ''}${err.config?.url ?? ''}`;
          logger.error(
            {
              provider: 'OMNIDIM',
              inbound: true,
              method: err.config?.method?.toUpperCase(),
              url: fullUrl,
              status: err.response?.status,
              responseBody: err.response?.data,
              axiosMessage: err.message,
            },
            'OMNIDIM ← error response',
          );
        }
        return Promise.reject(err);
      },
    );
  }

  private handleError(err: unknown, context: string): never {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const message =
        (err.response?.data as { message?: string; error?: string })?.message ??
        (err.response?.data as { message?: string; error?: string })?.error ??
        err.message;

      if (status === 401) {
        throw new ProviderAuthError('Omnidim');
      }
      throw new ProviderApiError(status >= 400 && status < 600 ? status : 502, message);
    }
    // Network errors (ENOTFOUND, ECONNREFUSED, etc.) — wrap with URL context
    const networkMessage = err instanceof Error ? err.message : String(err);
    throw new ProviderApiError(
      502,
      `${networkMessage} [baseURL: ${this.baseURL}, context: ${context}]`,
    );
  }

  /** GET /agents — paginated list */
  async listAgents(page = 1, pageSize = 50): Promise<OmnidimAgentListResponse> {
    try {
      const { data } = await this.http.get<OmnidimAgentListResponse>('/agents', {
        params: { pageno: page, pagesize: pageSize },
      });
      return data;
    } catch (err) {
      this.handleError(err, 'listAgents');
    }
  }

  /** GET /agents/{agent_id} — full config */
  async getAgent(agentId: string): Promise<OmnidimFullAgent> {
    try {
      const { data } = await this.http.get<OmnidimFullAgent>(`/agents/${agentId}`);
      return data;
    } catch (err) {
      this.handleError(err, 'getAgent');
    }
  }

  /** POST /agents/create */
  async createAgent(payload: OmnidimCreateAgentPayload): Promise<OmnidimFullAgent> {
    try {
      const { data } = await this.http.post<OmnidimFullAgent>('/agents/create', payload);
      return data;
    } catch (err) {
      this.handleError(err, 'createAgent');
    }
  }

  /** PUT /agents/{agent_id} */
  async updateAgent(
    agentId: string,
    payload: Partial<OmnidimCreateAgentPayload>,
  ): Promise<OmnidimFullAgent> {
    try {
      const { data } = await this.http.put<OmnidimFullAgent>(`/agents/${agentId}`, payload);
      return data;
    } catch (err) {
      this.handleError(err, 'updateAgent');
    }
  }

  /** DELETE /agents/{agent_id} */
  async deleteAgent(agentId: string): Promise<void> {
    try {
      await this.http.delete(`/agents/${agentId}`);
    } catch (err) {
      this.handleError(err, 'deleteAgent');
    }
  }
}
