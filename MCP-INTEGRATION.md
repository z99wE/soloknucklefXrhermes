# MCP Integration

Soloknuckle ships an MCP server (`soloknuckle-mcp`) that exposes the same three
functions the CLI uses. Any MCP-capable client — Hermes Agent, Claude Desktop,
an editor, or your own script — gets the same answers.

## Setup

Add the server to your client's MCP configuration:

```json
{
  "mcpServers": {
    "soloknuckle": {
      "command": "npx",
      "args": ["-y", "soloknuckle-mcp"]
    }
  }
}
```

If you installed the CLI globally, `"command": "soloknuckle-mcp"` is enough.

The server speaks JSON-RPC 2.0 over stdio, one message per line, and calls
nothing on the network.

## Tools

### `soloknuckle_secrets`

Scan a git diff for API keys, tokens, and credentials.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `diff` | string | no | Diff text. Empty or omitted scans the staged diff, then the unstaged one. |

```json
{ "clean": false, "violations": ["Line 12: Stripe live key detected."] }
```

### `soloknuckle_intercept`

Evaluate a shell command before it runs.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `command` | string | yes | The command to evaluate. |

```json
{ "blocked": false, "reason": "Recursive force delete", "suggestion": "Use 'rm -i' or 'trash-put' instead" }
```

### `soloknuckle_health`

Score the project. No input.

```json
{ "score": 75, "grade": "B", "issues": ["Tests: failing", "Secrets: 2 violation(s)"] }
```

The health tool runs `npm run lint` and `npm test` in the server's working
directory, so start it from the project root and only in a project you trust.

## Example session

```
Agent: "Should I commit this?"
  -> soloknuckle_secrets({ diff: "..." })
  <- { clean: true, violations: [] }
  -> "Nothing sensitive in the diff. Committing."

Agent: "Is this safe?"
  -> soloknuckle_intercept({ command: "rm -rf ./build" })
  <- { blocked: false, reason: "Recursive force delete", suggestion: "Use 'rm -i' instead" }
  <- "It will run. Consider 'rm -i' first."

Agent: "Where do I stand?"
  -> soloknuckle_health({})
  <- { score: 85, grade: "B", issues: ["Tests: 2 failing"] }
  -> "85/100. Two failing tests first."
```

## No hidden behaviour

- No middleware wrapping model or tool calls.
- No hooks injecting context into a prompt.
- No background process, no file watcher, no network call.
- Nothing is registered that the agent does not see in `tools/list`.
- Every response is plain JSON in a text content block.

## Protocol notes

- Protocol version: `2024-11-05`.
- Supported methods: `initialize`, `notifications/initialized`, `tools/list`,
  `tools/call`.
- Requests are handled in arrival order; a line that is not JSON is ignored
  rather than closing the connection.
- Errors inside a tool are returned as `isError: true` content, not as a
  protocol error, so one bad input cannot take the server down.
