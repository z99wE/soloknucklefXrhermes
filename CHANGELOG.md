# Changelog

All notable changes to Soloknuckle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [5.2.0] - 2026-11-11

### Added

- **One declarative rule set.** `hermes-plugin/rules.json` now drives both engines: `cli/core.ts` imports it and `hermes-plugin/core.py` loads it. Adding a pattern reaches the CLI, the MCP server, the git hooks, the Hermes tools, `/hygiene`, and the transcript redactor at once.
- **Cross-language parity test.** `test/parity.test.ts` runs a shared corpus through the TypeScript and Python engines and fails on the first disagreement about a violation, a `blocked` verdict, or a redaction pattern.
- **`soloknuckle check --min-score N`** (default 70). `check` now exits non-zero below the gate, so it can run in CI.
- **`soloknuckle:allow`** marker: an explicit, greppable way to exempt a fixture line.
- **Caution tier** for `git commit --amend`.

### Fixed

- **`soloknuckle` could not run after a global or npx install** — the bin was emitted without a shebang, so it failed with "exec format error". `soloknuckle-mcp` was unaffected, which is why the CLI looked installed and then did nothing.
- **`intercept` rejected the command it was given.** `soloknuckle intercept rm -rf /` failed with "unknown option '-rf'" unless the caller quoted the whole command.
- **`init` overwrote existing git hooks.** It now preserves `pre-commit`/`pre-push` as `<hook>.local` and chains them, and is idempotent on re-run.
- **`scripts/wipe.sh` destroyed Hermes' data.** It killed every Hermes process and deleted `~/.hermes/state.db`, `memories/`, `logs/`, and `backups/`. Replaced by `scripts/uninstall.sh`, which removes only Soloknuckle's own directories.
- **Placeholder bypass.** A real key was skipped whenever its line happened to mention "mock", "dummy" or "localhost". Only a match that is itself a placeholder is skipped now.
- **Firewall gaps.** `sudo rm -rf /`, `rm -rf ~`, `rm -rf /*`, `rm -rf --no-preserve-root /`, and `bash <(curl …)` are now blocked.
- **Release artifacts were mislabelled.** Five "platform" tarballs were one portable JS bundle copied five times. One `soloknuckle.tar.gz` replaces them, and `install.sh` requires Node 20+ and no longer edits shell rc files.

### Changed

- MCP transport is now `serve(input, output, onEnd)` instead of reading process globals, so the request pipeline is testable and embeddable.
- `cli/path-utils.ts` is now `cli/version.ts`; the unused `findFiles` glob helper is gone.
- CLI output no longer contains emoji.
- Removed `express`, `inquirer`, `supertest`, and `@types/express` (unused).
- Removed the v4 documentation layer: feature-flag templates and schemas, `ROLLOUT.md`, `SKILL.md` (root), `META-PROMPT.md`, `AUDIT-PLAN.md`, `BUG-REPORT.md`, `PRD-TRD-v5.md`, and the host setup scripts.

## [5.1.0] - 2026-11-04

### Added

- **Hermes plugin.** Three tools (`soloknuckle_secrets`, `soloknuckle_intercept`, `soloknuckle_health`) plus native surfaces: credential redaction patterns for the transcript redactor, the `soloknuckle:hygiene` skill, `hermes hygiene` CLI, `/hygiene` slash command, and a weekly hygiene report blueprint. Health project lint/test scripts are opt-in (`health_run_project_scripts`, default `false`) and run with a minimal environment when enabled.
- **MCP server** (`soloknuckle-mcp`) exposing the same three tools over stdio.

## [5.0.0] - 2026-10-31

### Changed

- **Rebuilt around one engine.** The 13-dimension scorer, telemetry, webhook daemon, governance framework, compliance audits, feature flags, and AI watcher were removed. What remains is three deterministic functions — `scanSecrets`, `interceptCommand`, `calculateHealth` — reached from four CLI commands, three MCP tools, and git hooks.
- The engine makes no network calls and holds no state.

### Removed

- Everything that required an account, a server, or a background process.

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
