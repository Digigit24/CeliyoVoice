import type { ExecutionContext } from '../tool.executor';

type ToolFunction = (
  input: Record<string, unknown>,
  context: ExecutionContext,
) => Promise<Record<string, unknown>>;

const registry = new Map<string, ToolFunction>();

// ── Built-in functions ───────────────────────────────────────────────────────

registry.set('echo', async (input) => ({ echo: input }));

registry.set('timestamp', async () => ({
  timestamp: new Date().toISOString(),
  unix: Date.now(),
}));

registry.set('json_extract', async (input) => {
  const { json, path } = input as { json: string; path: string };
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const parts = String(path).split('.');
    let current: unknown = parsed;
    for (const part of parts) {
      if (current === null || current === undefined) break;
      current = (current as Record<string, unknown>)[part];
    }
    return { value: current };
  } catch {
    return { error: 'Invalid JSON or path' };
  }
});

registry.set('math', async (input) => {
  const { operation, a, b } = input as { operation: string; a: number; b: number };
  switch (operation) {
    case 'add': return { result: a + b };
    case 'subtract': return { result: a - b };
    case 'multiply': return { result: a * b };
    case 'divide': return b !== 0 ? { result: a / b } : { error: 'Division by zero' };
    default: return { error: `Unknown operation: ${operation}` };
  }
});

// ── Registry API ─────────────────────────────────────────────────────────────

export function getBuiltInFunction(name: string): ToolFunction | undefined {
  return registry.get(name);
}

export function listBuiltInFunctions(): string[] {
  return Array.from(registry.keys());
}
