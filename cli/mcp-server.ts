#!/usr/bin/env node

import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from './core';
import { getVersion } from './path-utils';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS = [
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

async function handleRequest(req: MCPRequest): Promise<MCPResponse | undefined> {
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

async function handleToolCall(id: number | string, name: string, args: Record<string, unknown>): Promise<MCPResponse> {
  try {
    let result: unknown;

    switch (name) {
      case 'soloknuckle_secrets': {
        const diff = String(args.diff || '');
        const diffToScan = diff || getGitDiff();
        result = scanSecrets(diffToScan);
        break;
      }

      case 'soloknuckle_intercept': {
        const command = String(args.command || '');
        result = interceptCommand(command);
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

function main() {
  let buffer = '';
  let pending: Promise<void> = Promise.resolve();

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as MCPRequest;
        pending = pending.then(async () => {
          const res = await handleRequest(req);
          if (res) process.stdout.write(JSON.stringify(res) + '\n');
        }).catch(() => {});
      } catch {
        // Ignore non-JSON lines
      }
    }
  });

  process.stdin.on('end', () => {
    pending.finally(() => process.exit(0));
  });
}

if (require.main === module) {
  main();
}

export { handleRequest, TOOLS, main };