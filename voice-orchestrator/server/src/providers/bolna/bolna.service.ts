import { logger } from '../../utils/logger';
import type { BolnaAgentListResponse, BolnaAgentV2 } from '../bolna/bolna.types';

// Re-export from bolna types for convenience
export type BolnaCreateAgentPayload = Partial<BolnaAgentV2>;

const STUB_MESSAGE = 'Bolna integration coming soon';

/**
 * Stub service for the Bolna REST API.
 * All mutating methods throw "coming soon" errors.
 * listAgents returns an empty array; getAgent throws "not yet available".
 */
export class BolnaService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_apiKey: string, _apiUrl: string) {
    logger.warn({ provider: 'BOLNA' }, 'BolnaService is a stub — Phase 2 implementation pending');
  }

  /**
   * Returns an empty list (stub).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async listAgents(_page = 1, _pageSize = 50): Promise<BolnaAgentListResponse> {
    logger.debug('Bolna: listAgents (stub) — returning empty list');
    return { agents: [], total: 0, page: _page, page_size: _pageSize };
  }

  /**
   * Throws "not yet available" (stub).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getAgent(_agentId: string): Promise<BolnaAgentV2> {
    throw new Error('Bolna agent import not yet available');
  }

  /**
   * Throws "coming soon" (stub).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createAgent(_payload: BolnaCreateAgentPayload): Promise<BolnaAgentV2> {
    throw new Error(STUB_MESSAGE);
  }

  /**
   * Throws "coming soon" (stub).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async updateAgent(_agentId: string, _payload: Partial<BolnaCreateAgentPayload>): Promise<BolnaAgentV2> {
    throw new Error(STUB_MESSAGE);
  }

  /**
   * Throws "coming soon" (stub).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async deleteAgent(_agentId: string): Promise<void> {
    throw new Error(STUB_MESSAGE);
  }
}
