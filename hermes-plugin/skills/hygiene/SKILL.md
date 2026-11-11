---
name: hygiene
description: Check a project for leaked secrets, dangerous shell commands, and failing health before it ships.
version: 1.0.0
author: Soloknuckle Contributors
license: ISC
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [security, secrets, hygiene, pre-commit]
---

# Soloknuckle hygiene

Use this before a commit, before suggesting a destructive shell command, and
whenever the user asks whether a project is in good shape.

## Before committing

Call `soloknuckle.secrets` with the staged diff. If `clean` is false, report
every violation with its line number and stop. Do not commit, and do not
suggest `git commit --no-verify`.

## Before suggesting a shell command

Call `soloknuckle.intercept` with the exact command string. If `blocked` is
true, do not run it — say why. If `suggestion` is present, offer that instead.

## When asked about project health

Call `soloknuckle.health`. Report the score, the grade, and each issue. Do not
pad the answer.

## Rules

- Every claim must come from a tool response. Do not invent results.
- Do not rewrite, bypass, or silence the checks.
- The checks are local and read-only; nothing is uploaded anywhere.
