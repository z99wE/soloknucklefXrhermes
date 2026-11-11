# Soloknuckle

Production hygiene for solo developers. Catches secrets, blocks dangerous commands, and scores your tests — before you push.

**Local-first. No surveillance. No tracking. Open source.**

## Quick Start

```bash
npx soloknuckle init
```

That's it. Soloknuckle scaffolds git hooks and an `AGENTS.md` file into your project. From that point on, every commit is checked.

## What It Does

### 1. Secrets
Scans staged git diffs for API keys, tokens, and credentials before they hit your history.

```bash
npx soloknuckle secrets
```

Catches: AWS keys, GitHub PATs, Stripe keys, OpenAI/Anthropic keys, Slack tokens, database URIs, private keys, and more.

### 2. Firewall
Evaluates shell commands for destructive patterns before they execute.

```bash
npx soloknuckle intercept "rm -rf /"
# → { blocked: true, reason: "Recursive delete of root" }

npx soloknuckle intercept "rm -rf ./build"
# → { blocked: false, reason: "Recursive force delete", suggestion: "Use 'rm -i' or 'trash-put' instead" }
```

Blocks: `curl | sh`, SQL drops, root deletion, raw disk writes, filesystem formats.
Suggests alternatives for: `rm -rf`, `git push --force`, `chmod 777`, `git reset --hard`.

### 3. Health
One score (0-100) for your project. Four checks: lint, tests, secrets, dependencies.

```bash
npx soloknuckle check
```

Output:
```
Score: 75/100 (B)
Issues:
  - Tests: failing
  - Secrets: 2 violation(s)
```

## Commands

| Command | Description |
|---------|-------------|
| `npx soloknuckle init` | Scaffold git hooks and AGENTS.md |
| `npx soloknuckle check` | Run health check (lint, tests, secrets, deps) |
| `npx soloknuckle secrets [diff]` | Scan a git diff for secrets |
| `npx soloknuckle intercept <cmd>` | Test if a shell command is safe |

## Hermes Agent Integration

Soloknuckle integrates with Hermes Agent via MCP. Three tools are available:

| Tool | Description |
|------|-------------|
| `soloknuckle.secrets` | Scan git diff for API keys, tokens, credentials |
| `soloknuckle.intercept` | Evaluate shell command safety |
| `soloknuckle.health` | Project health score (0-100) with issues |

All tools return structured JSON. No middleware. No hooks. No prompt injection.

### Setup

1. Install the plugin: `hermes plugins install soloknuckle`
2. Enable in Hermes: Capabilities → Plugins → Soloknuckle
3. Hermes can now call `soloknuckle.secrets`, `soloknuckle.intercept`, and `soloknuckle.health`

## Security

- **100% local.** No data leaves your machine. No external API calls.
- **No tracking.** No telemetry. No analytics. No phone-home.
- **No surveillance.** Does not track which LLM or tool you use.
- **Open source.** Read every line of code.
- **Transparent.** All checks are deterministic — same input, same output, every time.

## Deep Wipe

To remove all soloknuckle traces from your Hermes installation:

**Mac/Linux:**
```bash
bash scripts/wipe.sh
```

**Windows:**
```powershell
.\scripts\wipe.ps1
```

This removes only Hermes state files. Source code is never touched.

## License

ISC License. See [LICENSE](LICENSE) for details.

## Links

- [GitHub](https://github.com/soch-ship-it/soloknuckle)
- [npm](https://www.npmjs.com/package/soloknuckle)
- [Security Policy](SECURITY.md)