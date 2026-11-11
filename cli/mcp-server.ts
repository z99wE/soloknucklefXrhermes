#!/usr/bin/env node

import { Readable, Writable } from 'stream';
import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from './core';
import { getVersion } from './version';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const TOOLS = [
  {
    name: 'soloknuckle_secrets',
    description: 'Scan a git diff for secrets, API keys, tokens, and credentials. Pass empty string to scan staged/unstaged diff.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        diff: { type: 'string', description: 'The diff text to scan. Empty string scans the current git diff.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'soloknuckle_intercept',
    description: 'Check if a shell command is safe or destructive. Returns whether the command would be blocked and why, with a suggestion for safer alternatives.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The shell command to check' },
      },
      required: ['command'],
    },
  },
  {
    name: 'soloknuckle_health',
    description: 'Get the project health score (0-100) with actionable issues. Checks lint, tests, secrets, and dependencies.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
];

export async function handleRequest(req: MCPRequest): Promise<MCPResponse | undefined> {
  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'soloknuckle', version: getVersion() },
        },
      };

    case 'notifications/initialized':
      return undefined;

    case 'tools/list':
      return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } };

    case 'tools/call': {
      const params = req.params as { name: string; arguments: Record<string, unknown> } | undefined;
      if (!params) {
        return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'Missing params' } };
      }
      return handleToolCall(req.id, params.name, params.arguments || {});
    }

    default:
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Unknown method: ${req.method}` } };
  }
}

export async function handleToolCall(
  id: number | string,
  name: string,
  args: Record<string, unknown>,
): Promise<MCPResponse> {
  try {
    let result: unknown;

    switch (name) {
      case 'soloknuckle_secrets': {
        const diff = String(args.diff || '');
        result = scanSecrets(diff || getGitDiff());
        break;
      }

      case 'soloknuckle_intercept': {
        result = interceptCommand(String(args.command || ''));
        break;
      }

      case 'soloknuckle_health': {
        result = calculateHealth();
        break;
      }

      default:
        return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      },
    };
  }
}

/**
 * Speak MCP over a pair of streams. Kept free of process globals so the
 * transport can be exercised in tests with an in-memory pipe.
 *
 * Requests are handled in arrival order; a malformed line is ignored rather
 * than killing the server, because a host may write non-JSON to stdout.
 */
export function serve(
  input: Readable,
  output: Writable,
  onEnd: () => void = () => {},
): void {
  let buffer = '';
  let pending: Promise<void> = Promise.resolve();

  input.setEncoding('utf-8');
  input.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let request: MCPRequest;
      try {
        request = JSON.parse(trimmed) as MCPRequest;
      } catch {
        continue; // not JSON: ignore
      }
      pending = pending
        .then(async () => {
          const response = await handleRequest(request);
          if (response) output.write(JSON.stringify(response) + '\n');
        })
        .catch(() => {});
    }
  });

  input.on('end', () => {
    pending.finally(onEnd);
  });
}

function main(): void {
  serve(process.stdin, process.stdout, () => process.exit(0));
}

if (require.main === module) {
  main();
}
