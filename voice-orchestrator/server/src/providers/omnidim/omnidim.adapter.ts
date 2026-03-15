import axios, { type AxiosInstance, isAxiosError } from 'axios';
import type {
  IVoiceProvider,
  AgentCreatePayload,
  AgentUpdatePayload,
  ProviderAgentResponse,
  ProviderCallResponse,
  CallStatusResponse,
  StartCallPayload,
  NormalizedWebhookEvent,
  ProviderCredentials,
} from '../interfaces/voiceProvider.interface';
import {
  toOmnidimAgent,
  toOmnidimAgentUpdate,
  fromOmnidimAgent,
  toOmnidimCall,
  fromOmnidimCall,
  fromOmnidimWebhook,
} from './omnidim.mapper';
import type {
  OmnidimAgentResponse,
  OmnidimCallResponse,
  OmnidimCallStatusResponse,
  OmnidimWebhookPayload,
} from './omnidim.types';
import { logger } from '../../utils/logger';

export class OmnidimAdapter implements IVoiceProvider {
  readonly providerType = 'OMNIDIM' as const;
  private readonly http: AxiosInstance;

  constructor(credentials: ProviderCredentials) {
    this.http = axios.create({
      baseURL: credentials.apiUrl.replace(/\/$/, ''),
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30_000,
    });

    this.http.interceptors.response.use(
      (r) => r,
      (err: unknown) => {
        if (isAxiosError(err)) {
          const status = err.response?.status ?? 0;
          const detail = (err.response?.data as { message?: string })?.message ?? err.message;
          logger.warn({ status, detail, url: err.config?.url }, 'Omnidim API error');
          const appError = new Error(`Omnidim API error (${status}): ${detail}`);
          (appError as NodeJS.ErrnoException & { statusCode: number }).statusCode =
            status >= 400 && status < 500 ? status : 502;
          return Promise.reject(appError);
        }
        return Promise.reject(err);
      },
    );
  }

  async createAgent(payload: AgentCreatePayload): Promise<ProviderAgentResponse> {
    const body = toOmnidimAgent(payload);
    const { data } = await this.http.post<OmnidimAgentResponse>('/v1/agents', body);
    return fromOmnidimAgent(data);
  }

  async updateAgent(providerAgentId: string, payload: AgentUpdatePayload): Promise<void> {
    const body = toOmnidimAgentUpdate(payload);
    await this.http.put<OmnidimAgentResponse>(`/v1/agents/${providerAgentId}`, body);
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    await this.http.delete(`/v1/agents/${providerAgentId}`);
  }

  async startCall(params: StartCallPayload): Promise<ProviderCallResponse> {
    const body = toOmnidimCall(params);
    const { data } = await this.http.post<OmnidimCallResponse>('/v1/calls', body);
    return fromOmnidimCall(data);
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.http.post(`/v1/calls/${providerCallId}/end`);
  }

  async getCallStatus(providerCallId: string): Promise<CallStatusResponse> {
    const { data } = await this.http.get<OmnidimCallStatusResponse>(
      `/v1/calls/${providerCallId}`,
    );
    return {
      providerCallId: data.call_id,
      status: data.status,
      duration: data.duration,
      recordingUrl: data.recording_url,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  async handleWebhook(
    payload: Record<string, unknown>,
    _headers: Record<string, string>,
  ): Promise<NormalizedWebhookEvent> {
    return fromOmnidimWebhook(payload as unknown as OmnidimWebhookPayload);
  }
}
