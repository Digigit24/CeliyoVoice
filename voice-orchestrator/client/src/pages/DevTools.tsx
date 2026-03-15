import { useState } from 'react';
import { Play, Loader2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/axios';

// ── Types ─────────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Provider = 'omnidim' | 'bolna';

interface Preset {
  label: string;
  method: HttpMethod;
  path: string;
  params?: string;
  body?: string;
  description?: string;
}

// ── Omnidim presets (real API paths from omnidim.service.ts) ─────────────────

const OMNIDIM_PRESETS: Preset[] = [
  {
    label: 'List Agents',
    method: 'GET',
    path: '/agents',
    params: '{\n  "pageno": 1,\n  "pagesize": 10\n}',
    description: 'Paginated list of all agents',
  },
  {
    label: 'Get Agent by ID',
    method: 'GET',
    path: '/agents/YOUR_AGENT_ID',
    params: '{}',
    description: 'Fetch full config for a single agent',
  },
  {
    label: 'Create Agent',
    method: 'POST',
    path: '/agents/create',
    params: '{}',
    body: '{\n  "name": "Test Agent",\n  "welcome_message": "Hello!"\n}',
    description: 'Create a new agent',
  },
  {
    label: 'Update Agent',
    method: 'PUT',
    path: '/agents/YOUR_AGENT_ID',
    params: '{}',
    body: '{\n  "name": "Updated Name"\n}',
    description: 'Update an existing agent',
  },
  {
    label: 'Delete Agent',
    method: 'DELETE',
    path: '/agents/YOUR_AGENT_ID',
    params: '{}',
    description: 'Delete an agent by ID',
  },
  {
    label: 'Dispatch Call',
    method: 'POST',
    path: '/calls/dispatch',
    params: '{}',
    body: '{\n  "agent_id": 0,\n  "to_number": "+1234567890",\n  "from_number": "+0987654321"\n}',
    description: 'Trigger an outbound call via an agent',
  },
  {
    label: 'List Call Logs',
    method: 'GET',
    path: '/calls/logs',
    params: '{\n  "pageno": 1,\n  "pagesize": 10\n}',
    description: 'Paginated call history',
  },
  {
    label: 'Get Call Log',
    method: 'GET',
    path: '/calls/logs/YOUR_CALL_LOG_ID',
    params: '{}',
    description: 'Fetch a single call log entry',
  },
];

// ── Bolna presets (all endpoints from bolna.service.ts) ──────────────────────

const BOLNA_PRESETS: Preset[] = [
  {
    label: 'List All Agents',
    method: 'GET',
    path: '/v2/agent/all',
    params: '{}',
    description: 'Returns all agents as an array',
  },
  {
    label: 'Get Agent by ID',
    method: 'GET',
    path: '/v2/agent/YOUR_AGENT_ID',
    params: '{}',
    description: 'Fetch full config for a single agent',
  },
  {
    label: 'Create Agent',
    method: 'POST',
    path: '/v2/agent',
    params: '{}',
    body: '{\n  "agent_name": "Test Agent",\n  "agent_type": "outbound"\n}',
    description: 'Create a new Bolna agent',
  },
  {
    label: 'Update Agent (PUT)',
    method: 'PUT',
    path: '/v2/agent/YOUR_AGENT_ID',
    params: '{}',
    body: '{\n  "agent_name": "Updated Agent"\n}',
    description: 'Full update of an agent',
  },
  {
    label: 'Patch Agent',
    method: 'PATCH',
    path: '/v2/agent/YOUR_AGENT_ID',
    params: '{}',
    body: '{\n  "agent_welcome_message": "Hi there!"\n}',
    description: 'Partial update of an agent',
  },
  {
    label: 'Dispatch Call',
    method: 'POST',
    path: '/call',
    params: '{}',
    body: '{\n  "agent_id": "YOUR_AGENT_ID",\n  "recipient_phone_number": "+1234567890",\n  "from_phone_number": "+0987654321"\n}',
    description: 'Dispatch an outbound call; returns execution_id',
  },
  {
    label: 'Stop Call',
    method: 'POST',
    path: '/call/YOUR_EXECUTION_ID/stop',
    params: '{}',
    body: '{}',
    description: 'Stop a single active call by execution_id',
  },
  {
    label: 'Stop All Agent Calls',
    method: 'POST',
    path: '/v2/agent/YOUR_AGENT_ID/stop',
    params: '{}',
    body: '{}',
    description: 'Stop all active executions of an agent',
  },
  {
    label: 'Get Execution',
    method: 'GET',
    path: '/executions/YOUR_EXECUTION_ID',
    params: '{}',
    description: 'Fetch call details: telephony_data, cost_breakdown, transcript',
  },
  {
    label: 'Get Execution Log',
    method: 'GET',
    path: '/executions/YOUR_EXECUTION_ID/log',
    params: '{}',
    description: 'Detailed execution event log',
  },
  {
    label: 'Get Agent Executions',
    method: 'GET',
    path: '/v2/agent/YOUR_AGENT_ID/executions',
    params: '{\n  "page_number": 1,\n  "page_size": 20\n}',
    description: 'Paginated list of executions for an agent',
  },
  {
    label: 'Get Agent Execution',
    method: 'GET',
    path: '/agent/YOUR_AGENT_ID/execution/YOUR_EXECUTION_ID',
    params: '{}',
    description: 'Single execution under a specific agent',
  },
  {
    label: 'Get Batch Executions',
    method: 'GET',
    path: '/batches/YOUR_BATCH_ID/executions',
    params: '{}',
    description: 'All executions belonging to a batch',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryParseJson(str: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!str.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function SyntaxHighlight({ json }: { json: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /("(?:[^"\\]|\\.)*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    if (match.index > last) parts.push(json.slice(last, match.index));
    if (match[1] && match[2]) {
      parts.push(<span key={match.index} className="text-blue-400">{match[1]}</span>);
      parts.push(match[2]);
    } else if (match[1]) {
      parts.push(<span key={match.index} className="text-green-400">{match[1]}</span>);
    } else if (match[3]) {
      parts.push(<span key={match.index} className="text-yellow-400">{match[3]}</span>);
    } else if (match[4]) {
      parts.push(<span key={match.index} className="text-orange-400">{match[4]}</span>);
    }
    last = match.index + match[0].length;
  }
  if (last < json.length) parts.push(json.slice(last));
  return <>{parts}</>;
}

function JsonViewer({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          JSON
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {expanded && (
        <pre className="max-h-[28rem] overflow-auto p-4 text-xs leading-relaxed">
          <SyntaxHighlight json={formatted} />
        </pre>
      )}
    </div>
  );
}

// ── Response shape ─────────────────────────────────────────────────────────────

interface ProxyResponse {
  status: number;
  statusText: string;
  body: unknown;
}

// ── Provider panel ────────────────────────────────────────────────────────────

function ProviderPanel({ provider }: { provider: Provider }) {
  const presets = provider === 'omnidim' ? OMNIDIM_PRESETS : BOLNA_PRESETS;
  const proxyEndpoint = `/dev/${provider}`;

  const [method, setMethod] = useState<HttpMethod>(presets[0].method);
  const [path, setPath] = useState(presets[0].path);
  const [params, setParams] = useState(presets[0].params ?? '{}');
  const [body, setBody] = useState(presets[0].body ?? '{}');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState(presets[0].label);

  const loadPreset = (preset: Preset) => {
    setMethod(preset.method);
    setPath(preset.path);
    setParams(preset.params ?? '{}');
    setBody(preset.body ?? '{}');
    setResponse(null);
    setError(null);
    setActivePreset(preset.label);
  };

  const handleSend = async () => {
    setError(null);
    setResponse(null);

    const parsedParams = tryParseJson(params);
    if (!parsedParams.ok) { setError(`Params JSON error: ${parsedParams.error}`); return; }
    const parsedBody = tryParseJson(body);
    if (!parsedBody.ok) { setError(`Body JSON error: ${parsedBody.error}`); return; }

    setLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data: ProxyResponse }>(proxyEndpoint, {
        method,
        path,
        params: parsedParams.value && Object.keys(parsedParams.value as object).length > 0
          ? parsedParams.value
          : undefined,
        body: parsedBody.value && Object.keys(parsedBody.value as object).length > 0
          ? parsedBody.value
          : undefined,
      });
      setResponse(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const methodColors: Record<HttpMethod, string> = {
    GET: 'text-green-500',
    POST: 'text-blue-500',
    PUT: 'text-yellow-500',
    PATCH: 'text-orange-500',
    DELETE: 'text-red-500',
  };

  const statusColor = response
    ? response.status < 300
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : response.status < 400
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : '';

  const showBody = method !== 'GET' && method !== 'DELETE';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      {/* Presets sidebar */}
      <div className="space-y-1.5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Presets
        </p>
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => loadPreset(preset)}
            className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent ${
              activePreset === preset.label ? 'border-primary/40 bg-accent' : ''
            }`}
          >
            <span className={`text-xs font-bold ${methodColors[preset.method]}`}>
              {preset.method}
            </span>
            <p className="mt-0.5 truncate text-xs font-medium text-foreground">{preset.label}</p>
            {preset.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{preset.description}</p>
            )}
          </button>
        ))}
      </div>

      {/* Request + Response */}
      <div className="space-y-4">
        {/* URL bar */}
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className={`rounded-md border bg-background px-3 py-2 text-sm font-bold ${methodColors[method]} focus:outline-none focus:ring-2 focus:ring-ring`}
          >
            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/v2/agent/all"
            className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleSend} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </div>

        {/* Query Params */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Query Params (JSON)
          </label>
          <textarea
            value={params}
            onChange={(e) => setParams(e.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="{}"
          />
        </div>

        {/* Request Body */}
        {showBody && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Request Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="{}"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}>
                {response.status} {response.statusText}
              </span>
              <span className="text-xs text-muted-foreground">Response</span>
            </div>
            <JsonViewer data={response.body} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DevTools() {
  const [activeProvider, setActiveProvider] = useState<Provider>('omnidim');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Developer Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test provider API endpoints directly using your tenant's stored credentials.
        </p>
      </div>

      {/* Provider tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(['omnidim', 'bolna'] as Provider[]).map((p) => (
          <button
            key={p}
            onClick={() => setActiveProvider(p)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeProvider === p
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p === 'omnidim' ? 'Omnidim' : 'Bolna'}
          </button>
        ))}
      </div>

      {activeProvider === 'omnidim'
        ? <ProviderPanel key="omnidim" provider="omnidim" />
        : <ProviderPanel key="bolna" provider="bolna" />
      }
    </div>
  );
}
