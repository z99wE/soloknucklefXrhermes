# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 5.x | Yes |
| ≤ 4.x | No — the 4.x line was a different product and is no longer maintained |

## Reporting a vulnerability

Use GitHub private vulnerability reporting:
https://github.com/z99wE/soloknucklefXrhermes/security/advisories/new

Please do not open a public issue for a vulnerability. Include the command you
ran, the observed behaviour, and what you expected. Expect an initial reply
within seven days.

## What Soloknuckle does

Three deterministic checks, all local:

- **Secret scanning** matches added lines in a diff against credential patterns.
- **Command firewall** matches a shell command against destructive patterns.
- **Health** runs the project's own lint and test scripts and scores the result.

## What Soloknuckle does not do

- No network access. There is no account, no API key, and no endpoint.
- No telemetry, analytics, or usage reporting.
- No background process, file watcher, or daemon.
- No modification of your code — the only writes are `AGENTS.md` and git hooks
  during `init`, and both refuse to overwrite without preserving what was there.
- No `eval`, no `new Function`, no shell interpolation of user input. Commands
  are passed as argument arrays to `execSync`.
- No prompt injection or context rewriting in the Hermes plugin.

## Threat model and known limits

Be precise about what a regex-based scanner is worth.

**False negatives are expected.** A credential that is split across lines,
base64-encoded, or generated in a shape no pattern describes will not be
detected. This is a pre-flight check, not a secrets manager.

**The allow marker is a bypass.** Any line containing `soloknuckle:allow` is
skipped. That is deliberate — fixtures need it — but it means a contributor
could smuggle a key past the hook with that comment. Reviewers should treat the
marker as a red flag, the same way they would treat a skipped test.

**Placeholder matching is heuristic.** A token whose matched text contains
`xxxx`, `mock`, `dummy`, `placeholder`, `changeme`, `your_key_here`,
`localhost`, or `<token>` is treated as documentation. A real key that happened
to contain one of those substrings would be skipped.

**The firewall matches syntax, not intent.** `sh -c "$(printf ...)"` will get
past it. It blocks the mistakes people actually make, not an adversary.

**Git hooks are local.** `git commit --no-verify` skips the pre-commit hook
entirely. That is git's design, not a bug in this tool.

**Scope of what it reads.** Only the current diff, the current directory's
`package.json`, and the outcome of your own lint and test scripts. Nothing else
is read, and nothing is transmitted.

**No environment loading.** The tool does not read `.env` files. Loading one
would inject its variables into the `npm run lint` / `npm test` subprocesses
that `check` spawns, so a repository you just cloned could set `NODE_OPTIONS`
and execute code. Configuration is a JSON rule file, not environment variables.

## Supply chain

- Dependencies are three runtime packages (`chalk`, `commander`, `dotenv`), all
  pinned to exact versions via `.npmrc` (`save-exact=true`).
- `engine-strict=true` refuses an install under an unsupported Node version.
- Releases are cut from tags by CI; npm publishing is a manual step protected by
  the maintainer's 2FA.
- The parity test runs on every platform in CI, so a rule cannot mean one thing
  in the CLI and another in the plugin.

## Uninstalling

`scripts/uninstall.sh` removes the plugin directory and `~/.soloknuckle`. It does
not touch `~/.hermes/state.db`, memories, logs, or backups, and it does not stop
or restart any process.
