# AGENTS.md — Rules for working in this repository

> Read this before changing anything. Soloknuckle tells other people what is
> dangerous; it has to be boringly safe itself.

## 1. What this project is

Three deterministic functions — secret scanning, a command firewall, and a
health score — behind a CLI, a git hook, an MCP server, and a Hermes plugin.

- `cli/core.ts` (TypeScript) and `hermes-plugin/core.py` (Python) are the
  engines. Both read `hermes-plugin/rules.json`.
- Everything else is a thin adapter over those functions.

If a change is not expressible as a rule in `rules.json` or as an adapter over
the three functions, stop and ask.

## 2. Hard rules

These are not preferences.

1. **No network calls in the engine.** No `fetch`, no `http`, no SDK, no
   telemetry, no analytics, no crash reporting, no "anonymous usage stats".
2. **No state.** The engine is a pure function of its input (plus the repo it
   is pointed at). No daemon, no watcher, no cache directory, no lock file.
3. **No writing outside documented paths.** `init` writes `AGENTS.md` and git
   hooks; `uninstall.sh` removes Soloknuckle's own directories. Nothing else
   writes anything, ever.
4. **Never destroy another application's data.** A previous `wipe.sh` deleted
   `~/.hermes/state.db`, memories, logs, and backups. It was removed for that
   reason. Do not reintroduce anything like it.
5. **No `eval`, no `new Function`, no `dangerouslySetInnerHTML`, no shell
   string interpolation of user input.** Pass argument arrays to `execSync`.
6. **No secrets in the repository**, including in tests and documentation. Use
   shapes that cannot be real keys.
7. **The plugin registers no hooks and no middleware.** `provides_hooks: []`
   and `provides_middleware: []` in `plugin.yaml` are a promise to the user that
   nothing rewrites model input. Keep them empty.
8. **A behavioural rule change needs a parity case.** Add it to
   `test/fixtures/parity-corpus.json`.

## 3. Branches and releases

- Work on `feature/<short-kebab-name>`. Open a PR against `develop`; `main` is
  what users install.
- One logical change per commit. The message explains *why*; the diff already
  says what.
- A release is a version bump in `package.json`, `hermes-plugin/plugin.yaml`,
  and `hermes-plugin/plugin-catalog-entry.yaml`, plus a `CHANGELOG.md` entry.

## 4. Quality gates

All of these must pass. CI runs them on Linux, macOS, and Windows.

```bash
npm run typecheck
npm run lint
npm test                 # includes the TS <-> Python parity test
npm run test:coverage    # 80% statements/lines/functions, 70% branches
npm run build
npm run build:bin
python3 -m pytest hermes-plugin/tests -q
hermes plugins validate ./hermes-plugin   # when touching plugin.yaml
```

Never bypass a gate with `--no-verify`, `--force`, or by lowering a threshold.
If a gate is wrong, fix the gate in its own commit and say why.

## 5. Security baseline

- Validate at every boundary. The MCP server and the CLI both accept text from
  other programs.
- Error paths must not leak the input. A violation message names the pattern and
  the line, never the credential itself.
- Never widen an allowlist to make a test pass.
- A false negative is worse than a false positive in the firewall, and the
  reverse in the health score. Know which one you are changing.

## 6. Documentation

- `README.md` is the product. Keep the Mermaid diagrams true; a diagram that
  lies is worse than no diagram.
- `HERMES-INTEGRATION.md` must match what `register()` actually registers.
  `plugin.yaml`, the tests, and that document disagreeing is a bug.
- `SECURITY.md` documents known limits. Do not soften them.

## 7. Accessibility and performance (landing page)

- `index.html` is served directly. Every image needs `alt`; every interactive
  element must be keyboard reachable with a visible focus ring; touch targets
  ≥ 44×44px; colour is never the only signal.
- No render-blocking third-party scripts. The page is static and stays static.

## 8. When in doubt

Ask. A question costs a message; a destructive default costs a user their
database.
