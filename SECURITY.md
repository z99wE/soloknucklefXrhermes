# Security

## What Soloknuckle Protects

- **Secrets in code** — API keys, tokens, credentials, database URIs
- **Dangerous commands** — `rm -rf /`, `curl | sh`, SQL drops, raw disk writes
- **Weak tests** — Missing assertions, flaky patterns, low mutation scores

## What Soloknuckle Does NOT Do

- **No tracking.** Does not collect usage data, telemetry, or analytics.
- **No surveillance.** Does not track which LLM, IDE, or tool you use.
- **No phone-home.** All checks run locally. Zero external API calls.
- **No governance.** Does not enforce policies or compliance frameworks.
- **No prompt injection.** Does not inject text into LLM context.
- **No middleware.** Does not wrap or intercept AI tool calls.

## Data Flow

1. You run a command (or Hermes calls an MCP tool)
2. Soloknuckle reads local files (git diff, package.json, etc.)
3. Soloknuckle returns results to you (or to Hermes)
4. **Nothing leaves your machine.**

## Privacy

- Config lives in `~/.soloknuckle/` (user-controlled, deletable)
- Per-project data in `.soloknuckle/` (gitignored by default)
- No names, emails, or usage data collected
- Your identity is nobody's business

## Reporting Vulnerabilities

Report security issues via GitHub Private Vulnerability Reporting:
https://github.com/soch-ship-it/soloknuckle/security/advisories/new

## Supply Chain

- `ignore-scripts=true` blocks malicious install scripts
- `min-package-age=72h` prevents typosquatting
- npm provenance ties every publish to the source commit via OIDC
- All releases are manual (no automated publishing)