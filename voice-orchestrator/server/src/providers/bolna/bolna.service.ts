import axios, { type AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger';
import type {
  BolnaAgentV2,
  BolnaCreateAgentPayload,
  BolnaDispatchCallRequest,
  BolnaDispatchCallResponse,
  BolnaExecution,
  BolnaExecutionListResponse,
  BolnaExecutionLogResponse,
  BolnaStopCallResponse,
  BolnaStopAllResponse,
} from './bolna.types';

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

export class BolnaService {
  private readonly http: AxiosInstance;

  constructor(apiKey: string, apiUrl: string) {
    this.http = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    // Request logging
    this.http.interceptors.request.use((config) => {
      logger.info({
        provider: 'BOLNA',
        method: config.method?.toUpperCase(),
        url: config.url,
        params: config.params,
      }, 'Bolna API request');
      return config;
    });

    // Response logging + error normalisation
    this.http.interceptors.response.use(
      (res) => {
        logger.info({
          provider: 'BOLNA',
          url: res.config.url,
          status: res.status,
          dataType: Array.isArray(res.data) ? 'array' : typeof res.data,
          dataLength: Array.isArray(res.data) ? res.data.length : undefined,
        }, 'Bolna API response');
        return res;
      },
      (err: AxiosError) => {
        const status = err.response?.status ?? 0;
        const msg = (err.response?.data as { detail?: string; message?: string })?.detail
          ?? (err.response?.data as { detail?: string; message?: string })?.message
          ?? err.message;

        logger.error({ provider: 'BOLNA', status, url: err.config?.url, msg }, 'Bolna API error');

        if (status === 401 || status === 403) {
          throw new ProviderAuthError(`Bolna authentication failed: ${msg}`);
        }
        throw new ProviderApiError(`Bolna API error ${status}: ${msg}`, status, err.response?.data);
      },
    );
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  /** GET /v2/agent/all — returns array directly */
  async listAgents(): Promise<BolnaAgentV2[]> {
    const resp = await this.http.get<BolnaAgentV2[]>('/v2/agent/all');
    return Array.isArray(resp.data) ? resp.data : [];
  }

  /** GET /v2/agent/{agent_id} */
  async getAgent(agentId: string): Promise<BolnaAgentV2> {
    const resp = await this.http.get<BolnaAgentV2>(`/v2/agent/${agentId}`);
    return resp.data;
  }

  /** POST /v2/agent */
  async createAgent(payload: BolnaCreateAgentPayload): Promise<BolnaAgentV2> {
    const resp = await this.http.post<BolnaAgentV2>('/v2/agent', payload);
    return resp.data;
  }

  /** PUT /v2/agent/{agent_id} */
  async updateAgent(agentId: string, payload: BolnaCreateAgentPayload): Promise<BolnaAgentV2> {
    const resp = await this.http.put<BolnaAgentV2>(`/v2/agent/${agentId}`, payload);
    return resp.data;
  }

  /** PATCH /v2/agent/{agent_id} — partial update */
  async patchAgent(agentId: string, payload: Partial<BolnaCreateAgentPayload>): Promise<BolnaAgentV2> {
    const resp = await this.http.patch<BolnaAgentV2>(`/v2/agent/${agentId}`, payload);
    return resp.data;
  }

  // ── Calls ──────────────────────────────────────────────────────────────────

  /** POST /call — dispatch a call */
  async dispatchCall(payload: BolnaDispatchCallRequest): Promise<BolnaDispatchCallResponse> {
    const resp = await this.http.post<BolnaDispatchCallResponse>('/call', payload);
    return resp.data;
  }

  /** POST /call/{execution_id}/stop — stop a single call */
  async stopCall(executionId: string): Promise<BolnaStopCallResponse> {
    const resp = await this.http.post<BolnaStopCallResponse>(`/call/${executionId}/stop`);
    return resp.data;
  }

  /** POST /v2/agent/{agent_id}/stop — stop all active executions of an agent */
  async stopAllExecutions(agentId: string): Promise<BolnaStopAllResponse> {
    const resp = await this.http.post<BolnaStopAllResponse>(`/v2/agent/${agentId}/stop`);
    return resp.data;
  }

  // ── Executions ─────────────────────────────────────────────────────────────

  /** GET /executions/{execution_id} — single execution (call) details */
  async getExecution(executionId: string): Promise<BolnaExecution> {
    const resp = await this.http.get<BolnaExecution>(`/executions/${executionId}`);
    return resp.data;
  }

  /** GET /v2/agent/{agent_id}/executions — paginated execution list */
  async getAgentExecutions(
    agentId: string,
    pageNumber = 1,
    pageSize = 20,
  ): Promise<BolnaExecutionListResponse> {
    const resp = await this.http.get<BolnaExecutionListResponse>(
      `/v2/agent/${agentId}/executions`,
      { params: { page_number: pageNumber, page_size: pageSize } },
    );
    return resp.data;
  }

  /** GET /agent/{agent_id}/execution/{execution_id} — execution under agent */
  async getAgentExecution(agentId: string, executionId: string): Promise<BolnaExecution> {
    const resp = await this.http.get<BolnaExecution>(
      `/agent/${agentId}/execution/${executionId}`,
    );
    return resp.data;
  }

  /** GET /executions/{execution_id}/log — detailed execution log */
  async getExecutionLog(executionId: string): Promise<BolnaExecutionLogResponse> {
    const resp = await this.http.get<BolnaExecutionLogResponse>(
      `/executions/${executionId}/log`,
    );
    return resp.data;
  }

  /** GET /batches/{batch_id}/executions */
  async getBatchExecutions(batchId: string): Promise<BolnaExecution[]> {
    const resp = await this.http.get<BolnaExecution[]>(`/batches/${batchId}/executions`);
    return Array.isArray(resp.data) ? resp.data : [];
  }
}
