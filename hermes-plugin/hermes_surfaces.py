"""Optional Hermes-native surfaces for Soloknuckle.

Registered from ``register()`` in ``__init__.py``, and each one is declared in
``plugin.yaml`` so it shows up in ``hermes plugins capabilities``:

* ``hermes hygiene check|secrets|intercept``  — CLI
* ``/hygiene [secrets|intercept <cmd>]``      — in-session command
* ``soloknuckle:weekly-report``               — automation blueprint

Nothing here rewrites LLM input, injects context, or hides state from the user.
"""

from __future__ import annotations

import argparse
import logging

logger = logging.getLogger(__name__)

_USAGE = "Usage: /hygiene [secrets | intercept <command>]"


try:  # imported as ``hermes_plugins.soloknuckle.hermes_surfaces``
    from .core import (
        calculate_health,
        current_git_diff,
        intercept_command,
        scan_secrets,
    )
except ImportError:  # imported as a top-level module (tests)
    from core import (  # type: ignore[no-redef]
        calculate_health,
        current_git_diff,
        intercept_command,
        scan_secrets,
    )


def build_cli_parser(parser: argparse.ArgumentParser) -> None:
    """Build the ``hermes hygiene`` argparse tree."""
    sub = parser.add_subparsers(dest="hygiene_command")

    sub.add_parser("check", help="Project health score (lint, tests, secrets, dependencies)")

    secrets_parser = sub.add_parser("secrets", help="Scan a git diff for leaked credentials")
    secrets_parser.add_argument(
        "--diff",
        default="",
        help="Diff text to scan. Default: staged diff, then unstaged.",
    )

    intercept_parser = sub.add_parser("intercept", help="Evaluate a shell command before running it")
    # NOTE: the positional must not be called "command" — the top-level Hermes
    # parser stores its own subcommand in ``args.command``, and a list there
    # breaks unrelated startup code that does ``args.command in {None, "chat"}``.
    intercept_parser.add_argument("command_parts", nargs=argparse.REMAINDER, help="Command to evaluate")


def handle_cli(args: argparse.Namespace) -> int:
    """Return a process exit code: 0 clean, 1 problems, 2 usage."""
    command = getattr(args, "hygiene_command", None) or "check"

    if command == "secrets":
        result = scan_secrets(getattr(args, "diff", "") or current_git_diff())
        if result["clean"]:
            print("No secrets detected.")
            return 0
        print(f"{len(result['violations'])} violation(s):")
        for violation in result["violations"]:
            print(f"  {violation}")
        return 1

    if command == "intercept":
        raw = " ".join(getattr(args, "command_parts", []) or []).strip()
        if not raw:
            print("Usage: hermes hygiene intercept <command>")
            return 2
        result = intercept_command(raw)
        if result["blocked"]:
            print(f"Blocked: {result['reason']}")
            return 1
        if result["suggestion"]:
            print(f"{result['reason']} — {result['suggestion']}")
            return 0
        print("Allowed.")
        return 0

    health = calculate_health()
    print(f"Score: {health['score']}/100 ({health['grade']})")
    for issue in health["issues"]:
        print(f"  {issue}")
    return 0 if health["score"] >= 70 else 1


def handle_slash(raw_args: str) -> str:
    """``/hygiene`` in-session handler. Returns text for the transcript."""
    text = (raw_args or "").strip()
    if not text or text == "check":
        health = calculate_health()
        lines = [f"Health: {health['score']}/100 ({health['grade']})"]
        lines.extend(f"- {issue}" for issue in health["issues"])
        return "\n".join(lines)

    if text == "secrets":
        result = scan_secrets(current_git_diff())
        if result["clean"]:
            return "No secrets detected."
        return "\n".join([f"{len(result['violations'])} violation(s):", *result["violations"]])

    if text.startswith("intercept"):
        raw = text[len("intercept"):].strip()
        if not raw:
            return _USAGE
        result = intercept_command(raw)
        if result["blocked"]:
            return f"Blocked: {result['reason']}"
        if result["suggestion"]:
            return f"{result['reason']} — {result['suggestion']}"
        return "Allowed."

    return _USAGE


def blueprint_kwargs() -> dict:
    """Keyword arguments for ``ctx.register_automation_blueprint``."""
    return {
        "key": "weekly-report",
        "title": "Weekly hygiene report",
        "description": (
            "A weekly check of the current project: health score, leaked credentials, "
            "and the issues worth fixing next."
        ),
        "category": "weekly",
        "schedule_template": "{minute} {hour} * * {dow}",
        "prompt_template": (
            "Produce a weekly hygiene report for the current project. Call the "
            "soloknuckle_health tool for the score and issues, then call "
            "soloknuckle_secrets with an empty diff to scan the working tree. "
            "Report the score and grade, every secret violation, and the top issues "
            "worth fixing this week. Do not modify files. If the score is 90 or above "
            "and there are no violations, reply with a single line saying so."
        ),
        "slots": [
            {"name": "time", "type": "time", "label": "Run at", "default": "09:00"},
            {"name": "day", "type": "weekdays", "label": "Which days", "default": "1"},
        ],
        "skills": ("soloknuckle:hygiene",),
        "tags": ("hygiene", "security", "secrets", "weekly"),
    }
