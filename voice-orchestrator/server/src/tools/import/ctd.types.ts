/** Celiyo Tool Definition file — v1.0 */
export interface CeliyoToolFile {
  celiyo_version: '1.0';
  name: string;
  description?: string;
  baseUrl?: string;
  auth?: CeliyoAuth;
  rateLimit?: { maxPerMinute?: number };
  tools: CeliyoToolDef[];
}

export interface CeliyoAuth {
  type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth';
  config: Record<string, unknown>;
}

export interface CeliyoToolDef {
  name: string;
  description: string;
  whenToUse?: string;
  category?: string;
  type?: 'http' | 'function';

  // HTTP
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  auth?: CeliyoAuth;

  // Schema
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: unknown[];
      default?: unknown;
      items?: Record<string, unknown>;
    }>;
    required?: string[];
  };

  bodyTemplate?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;

  responseMapping?: {
    extractFields?: string[];
    summaryTemplate?: string;
  };

  // Function
  functionName?: string;

  // Config
  timeout?: number;
  retries?: number;
}

export interface ParsedTool {
  name: string;
  description: string;
  toolType: 'HTTP' | 'FUNCTION';
  endpoint?: string;
  method: string;
  headers: Record<string, string>;
  authType: string;
  authConfig: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  bodyTemplate?: Record<string, unknown>;
  category?: string;
  timeout: number;
  retries: number;
  rateLimitPerMinute?: number;
  source: 'CELIYO_IMPORT' | 'SWAGGER_IMPORT';
  importMeta: {
    collectionName: string;
    whenToUse?: string;
    responseMapping?: Record<string, unknown>;
    queryParams?: Record<string, unknown>;
  };
}
