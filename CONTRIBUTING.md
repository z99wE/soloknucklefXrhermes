# Contributing

Thanks for helping. This project is small on purpose — three functions, two
engines, one rule file — so almost every change touches something that has a
test.

## Setup

```bash
git clone https://github.com/z99wE/soloknucklefXrhermes.git
cd soloknuckle
npm install
```

You need Node 20+ and Python 3.9+ (the Hermes plugin is Python, and the parity
test runs both engines).

## Gates

Every one of these must pass before a PR is merged. CI runs them on Linux,
macOS and Windows across Node 22 and 24.

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint over the JS tooling
npm test              # vitest, includes the TS <-> Python parity test
npm run test:coverage # 80% statements / lines / functions, 70% branches
npm run build         # tsc emit: verifies the dist layout
npm run build:bin     # single-file release bundle
python3 -m pytest hermes-plugin/tests -q
```

If Python is not on your `PATH`, point the parity test at it:

```bash
SOLOKNUCKLE_PYTHON=/path/to/python3 npm test
```

## Layout

```
cli/core.ts              the engine: secrets, firewall, health
cli/index.ts             the four CLI commands
cli/mcp-server.ts        MCP server (stdio) over the same engine
cli/version.ts           version lookup
cli/banner.ts            ASCII banner, suppressed when piped or in CI

hermes-plugin/rules.json the one rule set both engines read
hermes-plugin/core.py    the Python engine
hermes-plugin/__init__.py        registration: 3 tools + 4 host surfaces
hermes-plugin/hermes_surfaces.py CLI, slash command, blueprint
hermes-plugin/skills/    the soloknuckle:hygiene skill
hermes-plugin/tests/     pytest suite + parity probe

test/                    vitest suite + the shared parity corpus
scripts/                 release bundle, logo assets, uninstallers
```

## Changing a rule

Patterns are data. Edit `hermes-plugin/rules.json` — not the engines — and add a
case to `test/fixtures/parity-corpus.json` for anything you are not certain both
languages agree on. Then run `npm test`.

Two constraints come from the Hermes redactor and are enforced by a test:

- a redaction pattern needs at least two literal prefix characters;
- it cannot start with `(` (no top-level alternation).

If a pattern cannot satisfy those, set `"redact": false` and say why in a
`"note"`. Do not delete the scan rule to make redaction happy.

## Adding a surface to the plugin

Every surface must be declared in `hermes-plugin/plugin.yaml` *and* registered in
`register()`. A capability that exists in one place and not the other fails
admission. The plugin registers three tools and no hooks; keep it that way —
`provides_hooks: []` and `provides_middleware: []` encode the promise that
nothing rewrites model input.

If you add a tool, add it to `hermes-plugin/tests/test_backend.py`
(`test_register_exact_surface` asserts the exact list) and to
`HERMES-INTEGRATION.md`.

## Branches and commits

`main` and `develop` are protected. Work on `feature/<short-kebab-name>`, open a
PR against `develop`, and let staging run before it reaches `main`.

Commit messages explain **why**, not what the diff already shows. Conventional
prefixes (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`) are expected. One
logical change per commit; if the message needs "and also", it is two commits.

## Safety rules for this repository

This is a tool that tells people what is dangerous. It has to be boringly safe
itself.

- Never add a network call to the engine.
- Never write outside the paths `init` documents.
- Never delete user data, especially not a host application's database. An
  earlier `wipe.sh` did exactly that and was removed.
- An installer must not edit shell rc files without saying so.
- Destructive behaviour behind a flag is still destructive behaviour.

## Reporting bugs

Open an issue with the command you ran, the output, your OS, your Node version,
and (for the plugin) your Hermes version. For a security issue, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing you agree your work is licensed under ISC.
