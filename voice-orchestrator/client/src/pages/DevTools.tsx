import { useState } from 'react';
import { Play, Loader2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/axios';

// ── Preset endpoints ──────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Preset {
  label: string;
  method: HttpMethod;
  path: string;
  params?: string;
  body?: string;
}

const OMNIDIM_PRESETS: Preset[] = [
  { label: 'List Agents', method: 'GET', path: '/agents', params: '{\n  "pageno": 1,\n  "pagesize": 10\n}' },
  { label: 'Get Agent by ID', method: 'GET', path: '/agents/YOUR_ID', params: '{}' },
  { label: 'List Voices', method: 'GET', path: '/voices', params: '{}' },
  { label: 'List Calls', method: 'GET', path: '/calls', params: '{\n  "pageno": 1,\n  "pagesize": 10\n}' },
  { label: 'Get Call by ID', method: 'GET', path: '/calls/YOUR_ID', params: '{}' },
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

function SyntaxHighlight({ json }: { json: string }) {
  // Simple regex-based syntax colouring
  const parts: React.ReactNode[] = [];
  const regex = /("(?:[^"\\]|\\.)*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    if (match.index > last) {
      parts.push(json.slice(last, match.index));
    }
    if (match[1] && match[2]) {
      // key
      parts.push(<span key={match.index} className="text-blue-400">{match[1]}</span>);
      parts.push(match[2]);
    } else if (match[1]) {
      // string value
      parts.push(<span key={match.index} className="text-green-400">{match[1]}</span>);
    } else if (match[3]) {
      // boolean / null
      parts.push(<span key={match.index} className="text-yellow-400">{match[3]}</span>);
    } else if (match[4]) {
      // number
      parts.push(<span key={match.index} className="text-orange-400">{match[4]}</span>);
    }
    last = match.index + match[0].length;
  }
  if (last < json.length) parts.push(json.slice(last));
  return <>{parts}</>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface ProxyResponse {
  status: number;
  statusText: string;
  body: unknown;
}

export default function DevTools() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('/agents');
  const [params, setParams] = useState('{\n  "pageno": 1,\n  "pagesize": 10\n}');
  const [body, setBody] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreset = (preset: Preset) => {
    setMethod(preset.method);
    setPath(preset.path);
    setParams(preset.params ?? '{}');
    setBody(preset.body ?? '{}');
    setResponse(null);
    setError(null);
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
      const { data } = await api.post<{ success: boolean; data: ProxyResponse }>('/dev/omnidim', {
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
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
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
    ? response.status < 300 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : response.status < 400 ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : '';

  const showBody = method !== 'GET' && method !== 'DELETE';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Developer Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test Omnidim API endpoints using your tenant's stored credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* ── Presets sidebar ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Omnidim Presets
          </p>
          {OMNIDIM_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => loadPreset(preset)}
              className="w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className={`text-xs font-bold ${methodColors[preset.method]}`}>
                {preset.method}
              </span>
              <p className="mt-0.5 truncate text-xs text-foreground">{preset.label}</p>
              <p className="truncate text-xs text-muted-foreground">{preset.path}</p>
            </button>
          ))}
        </div>

        {/* ── Request + Response ── */}
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
              placeholder="/agents"
              className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={handleSend} disabled={loading} className="shrink-0">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </div>

          {/* Params */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Query Params (JSON)
            </label>
            <textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="{}"
            />
          </div>

          {/* Body — only for POST/PUT/PATCH */}
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
    </div>
  );
}
