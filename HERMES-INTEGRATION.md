# Hermes Integration

Soloknuckle is a standalone tool. It works without Hermes: `npx soloknuckle`
in a terminal, a pre-commit hook in git, or an MCP server in any agent.

This document covers the second half: what Soloknuckle gives **to** Hermes, and
the rules that keep that integration honest.

---

## The baseline

Hermes does not depend on Soloknuckle. Soloknuckle does not depend on Hermes.
Install the plugin and the agent gains tools; remove it and nothing breaks.

The engine lives in `hermes-plugin/core.py` and has no Hermes imports. Every
surface below is a thin adapter over the same three functions:

- `scan_secrets(diff)`
- `intercept_command(command)`
- `calculate_health(run_project_scripts=...)`

Those three functions read `hermes-plugin/rules.json`, the same file the
TypeScript engine imports. One rule change, every surface. Project lint/test
scripts in `soloknuckle_health` are opt-in (`health_run_project_scripts`,
default `false`) and, when enabled, run with a minimal environment (never
inheriting Hermes/provider secrets). Git diff subprocesses also use a minimal
environment.

---

## Surfaces

Every surface is declared in `plugin.yaml` and mirrored in
`hermes plugins capabilities`. Nothing is registered quietly.

| Surface | Hermes API | Declared as | What it actually does |
|---|---|---|---|
| Tools | `ctx.register_tool` | `provides_tools` | Three callable tools the agent may use |
| Redaction | `ctx.register_redaction_patterns` | `config_schema` | Adds 19 credential regexes to the host redactor |
| Skill | `ctx.register_skill` | skill namespace | `soloknuckle:hygiene`, listed in `<available_skills>` |
| CLI | `ctx.register_cli_command` | CLI registry | `hermes hygiene check\|secrets\|intercept` |
| Slash | `ctx.register_command` | command registry | `/hygiene [secrets\|intercept <cmd>]` |
| Blueprint | `ctx.register_automation_blueprint` | blueprint catalog | Weekly hygiene report for the scheduler |

### Why each one is safe

**Redaction** is additive by construction. `agent.redact` refuses any pattern
that could weaken a built-in one, rejects catastrophic quantifiers, and drops
anything without a literal prefix. The failure mode is over-redaction, never
under-redaction. Set `redaction_enabled: false` to turn it off.

**Skill** is content the user can read and invoke. It appears in
`<available_skills>` exactly like a bundled skill; it does not run on every
turn and cannot rewrite a system prompt.

**CLI, slash, blueprint** are user-initiated. A command only runs when a human
types it; a blueprint only runs when a human schedules it from the gallery.

---

## What we deliberately do not do

| Not done | Why |
|---|---|
| `pre_llm_call` / `post_llm_call` | Rewriting model input is prompt injection. |
| `register_middleware` | Wraps tool execution invisibly. |
| `register_system_prompt_section` | Injects text into every new session prompt. |
| `pre_tool_call` veto | Hermes' `terminal` tool already has a dangerous-command check. A second veto would be redundant *and* would make this plugin an interceptor again. Soloknuckle's firewall stays a tool the agent calls deliberately. |
| `register_secret_source` | Soloknuckle is not a vault. Hermes already ships Bitwarden, 1Password, and command sources; adding a fourth would be a worse version of an existing feature. |
| Self-update | The catalog's exact-SHA pin is the trust model. A plugin that replaces its own files defeats it. |

`provides_hooks: []` and `provides_middleware: []` are the machine-checkable
form of all of the above.

---

## Verify

```bash
hermes plugins validate ./hermes-plugin   # catalog admission gate
hermes plugins doctor ./hermes-plugin     # real runtime contracts
hermes plugins capabilities soloknuckle   # declared vs granted
hermes hygiene --help
python3 -m pytest -q hermes-plugin/tests
```

The expected doctor output is:

```
registrations: 3 tool(s), 0 hook(s)
```

`soloknuckle_health` reports lint/test as skipped by default unless
`health_run_project_scripts` is enabled in plugin config.

---

## Moat

A secret scanner is not a moat. Anyone can write twenty regexes.

The moat is that the **same engine** answers the same way at every point where
a project can go wrong:

| Moment | Surface | What it prevents |
|---|---|---|
| Before a command runs | `soloknuckle_intercept` | Destructive shell operations |
| Before a commit | git hook + `soloknuckle_secrets` | A credential entering git history |
| Before a push | `soloknuckle_health` / `soloknuckle check` | Shipping a red build |
| During a session | `/hygiene`, skill, tools | The agent guessing instead of checking |
| Every log line | redaction patterns | A credential landing in a transcript |
| Every week | blueprint | Rot that nobody noticed |

Deterministic, local, and identical across surfaces. That consistency is the
product; the regexes are just the payload.

---

## Catalog submission

The Hermes catalog is a human-reviewed trust signal, not a registry you publish
to. Admission rules that matter here:

1. Entries are added only by PR to `hermes-agent`, reviewed by a maintainer.
2. The entry pins a full 40-character commit SHA.
3. No self-updating code in the listed build.
4. `capabilities:` must match what `register()` actually does.
5. The security scan runs at admission; `dangerous` findings fail the entry.
6. Desktop plugins may only use the plugin SDK.

`hermes-plugin/plugin-catalog-entry.yaml` is the entry to submit. Fill `sha`
with the commit you want reviewed:

```bash
git rev-parse HEAD
```

Submit it as a PR from the repository owner or a major contributor. Drive-by
submissions of third-party repos are declined.

---

## Two engines, one rule set

The TypeScript CLI (`cli/core.ts`) and the Python plugin
(`hermes-plugin/core.py`) are two implementations on purpose: the plugin must
stay self-contained so `hermes plugins install` never shells out to `npx`, and
the CLI must not require a Python interpreter.

They are not two *products*. Both load `hermes-plugin/rules.json` — the
TypeScript side imports it, the Python side reads it next to `core.py` — so a
pattern is defined exactly once and reaches every surface together.

What data sharing cannot guarantee is behavioural equivalence: JavaScript and
Python differ at the edges of `\b`, of `$`, and of Unicode case folding. So
`test/parity.test.ts` runs a shared corpus (`test/fixtures/parity-corpus.json`)
through both engines and fails on the first disagreement, comparing the
violation strings, the `blocked`/`reason`/`suggestion` triple, and the derived
redaction list. `npm test` therefore requires a Python interpreter; set
`SOLOKNUCKLE_PYTHON` if it is not on `PATH`.

