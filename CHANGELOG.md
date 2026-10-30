# Changelog

All notable changes to Soloknuckle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.1] - 2026-10-30

### Fixed

- **Git hygiene scoring ignores direct commits to `main`** — the main-branch penalty had been commented out, so a project committing straight to `main`/`master` still scored a perfect 100 on Git Hygiene. The 15-point penalty and its warning are restored.
- **Feature flags scored 10 points for a missing `ROLLOUT.md`** — projects with no rollout documentation at all were awarded 10/100 for nothing. That credit is removed; the missing file is now reported instead.

### Changed

- **Supply chain scoring** now credits SBOM generation, a `SECURITY.md` security policy, and `publishConfig.access` controls.
- **CI/CD pipeline detection** matches hyphenated and multi-word tokens correctly (`type-check`, `npm audit`), so those steps are no longer missed.
- **Debugger detection** strips comments before matching, removing false positives when the word "debugger" appears in a comment or docstring.

## [1.3.0] - 2026-10-04

### Added

- **Deepened Static Application Security Testing (SAST)** — static vulnerability rules engine detecting `eval()`, `new Function()`, dynamic `child_process.exec` command interpolation, unsanitized `dangerouslySetInnerHTML`, raw `.innerHTML =` assignments, weak crypto algorithms (DES/RC4/MD5/SHA1), and disabled TLS verification (`rejectUnauthorized: false`).
- **Expanded Secret Detection Patterns** — added regex coverage for database URIs with embedded cleartext credentials (`postgres://`, `mongodb://`, `mysql://`, `redis://`), PyPI upload tokens, Slack workspace tokens, Twilio account tokens, and PKCS8/OpenSSL private keys.
- **Cognitive & Cyclomatic Complexity Analysis** — advanced branching complexity evaluator detecting decision density (> 45 branches), true block nesting depth (> 4 levels), and monolithic file structures.
- **Async Loop Bottleneck Scanner** — static detection of serial `await` expressions executed inside sequential `for` and `while` loops, prompting concurrency optimization via `Promise.all` or worker queues.
- **Enhanced Code Quality & Smell Diagnostics** — added static inspection for leftover `debugger;` statements in production source trees, empty `catch (e) {}` blocks that swallow runtime errors, and excessive `@ts-ignore` / `@ts-nocheck` suppressions.

## [1.2.0] - 2026-10-04

### Added

- **8-Domain Scorecard Architecture** — elevated Accessibility & Usability to its own first-class dedicated top-level domain with 10% weight parity alongside Security, Performance, and Reliability

- **Comprehensive WCAG 2.1 AA Engine** — static analysis checking for missing `alt` text, placeholder `alt` values, form `<input>` labels/IDs, accessible `<button>` names, ambiguous links, positive `tabIndex` anti-patterns, non-interactive `onClick` handlers, viewport zoom restrictions, and missing HTML `lang` attributes
- **Accessibility Hard Gate** — added mandatory `accessibility >= 70` gate in strict mode (`--strict`) to block inaccessible commits before they reach production

## [1.1.1] - 2026-09-26

### Added

- **Documentation & Agent Contract Hardening** — strict veto-by-contract for AI coding agents

## [1.1.0] - 2026-09-11

### Added

- **`intercept` CLI command** — run a shell command through Soloknuckle's firewall rules; exits `1` when blocked and offers machine-readable `--json` output for agents
- **`guard-install` command** — optionally wrap `rm`, `git`, `chmod`, `dd`, `mkfs`, `curl`, and `wget` in `~/.zshrc` / `~/.bashrc` so raw terminals get Malware-style protection too; `--remove` cleans it up
- **macOS Keychain storage** — prompt-saved LLM API keys are stored in Keychain (`apiKeyRef` marker in config) with a permission-safe fallback; `resolveApiKey()` reads env → stored config → keychain
- **`ai-watch --mark <sha>:ai|human`** — manual overrides in `.soloknuckle/ai-overrides.json`
- **Shared secret scanner** — `scanTextForSecrets` line classifier reused by the compliance hardcoded-secret check over `src/*` and root `.env*`
- **2FA-protected publishing** — every npm publish requires the owner's two-factor authentication (security key / Touch ID); no unattended CI credential can publish

### Fixed

- **Webhook read route was unauthenticated** — `GET /webhooks/incidents` now requires `X-Webhook-Secret`; loud warning when `WEBHOOK_HOST` is set to a non-loopback address
- **Compliance now detects committed `.env` files** (11th check: "No `.env` committed to git")
- **Hardcoded credential assignment detection** + placeholder heuristic so `.env.example` / docs don't self-flag
- **`ai-watch` misclassification** — scoring for AI signatures/bot authors/human authors with high/low confidence
- **`capabilities -f json`** emitted banner noise from dotenv; now real JSON
- **Pre-publish guard** — `prepublishOnly` builds and runs the full test suite before any npm publish
- **`dev` script** — replaced broken `ts-node` with `tsx` (works on Node 24)

## [1.0.0] - 2026-08-19

### Added

- **13-dimension scoring across 7 domains** — quality, testing, security, efficiency, accessibility, dependencies, documentation, git hygiene, CI/CD, feature flags, performance, reliability, supply chain
- **Human-friendly CLI** — `soloknuckle check` with expandable `--fix` commands
- **AI Watcher** — detects AI-authored commits, scans diffs, creates approval/quarantine branches
- **Budget system** — enforce limits on AI agent actions (commits, edits, deploys, API calls)
- **Sentry integration** — auto-detect AI commits as incident culprits, auto-revert, create reports
- **MCP Server** — stdio-based server with 9 tools for AI agent integration
- **Express API** — REST endpoints for scoring and health checks
- **React dashboard** — neo-brutalist UI for visualizing scores
- **Secret scanner** — detects API keys, passwords, tokens, PII in code
- **Agent guardrails** — requires AGENTS.md, .cursorrules, or SKILL.md for AI coding
- **Configurable weights** — customize dimension importance via `.soloknuckle/score-weights.json`
- **Zero-config setup** — `npx soloknuckle init` just works
- **Landing page** — SEO-optimized, deployable to Netlify/Vercel/GitHub Pages/Render
- **CI pipeline** — GitHub Actions with Node 22/24 matrix, security audit, typecheck, lint, tests
- **Test suite** — unit tests for CLI, scorer, API, MCP, scanner, and webhook logic
- **ISC license** — free forever, no accounts, no cloud

### Security

- No secrets in code
- No PII in logs
- Input validation on all endpoints
- Webhook signature verification
- Timing-safe comparison for secrets
