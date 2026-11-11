# MCP Integration

## Hermes Agent

Soloknuckle integrates with Hermes Agent via MCP. Three tools are available:

### soloknuckle.secrets

Scan a git diff for API keys, tokens, and credentials.

**Input:** `{ diff: string }` (optional — empty string scans staged/unstaged diff)
**Output:** `{ clean: boolean, violations: string[] }`

### soloknuckle.intercept

Evaluate a shell command for destructive patterns.

**Input:** `{ command: string }` (required)
**Output:** `{ blocked: boolean, reason: string | null, suggestion: string | null }`

### soloknuckle.health

Get the project health score.

**Input:** `{}`
**Output:** `{ score: number, grade: string, issues: string[] }`

## Setup

1. Install: `hermes plugins install soloknuckle`
2. Enable: Capabilities → Plugins → Soloknuckle
3. Hermes can now call all three tools

## Example Usage

```
Hermes: "Should I commit this code?"
→ calls soloknuckle.secrets({ diff: "..." })
→ { clean: true, violations: [] }
→ "Looks good, committing"
```

```
Hermes: "Is this command safe?"
→ calls soloknuckle.intercept({ command: "rm -rf ./build" })
→ { blocked: false, reason: "Recursive force delete", suggestion: "Use 'rm -i' or 'trash-put' instead" }
→ "Command is safe but consider using 'rm -i' instead"
```

```
Hermes: "What's the project health?"
→ calls soloknuckle.health({})
→ { score: 85, grade: "B", issues: ["Tests: 2 failing"] }
→ "Health is 85/100. Fix 2 failing tests."
```

## No Hidden Behavior

- No middleware wrapping AI calls
- No hooks injecting context
- No background processes
- Tools are called explicitly by the agent when needed
- All outputs are structured JSON