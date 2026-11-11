"""Soloknuckle Hermes Plugin — production hygiene for solo developers.

Three tools (secrets, intercept, health) plus Hermes-native surfaces that are
each declared in ``plugin.yaml`` and visible in ``hermes plugins capabilities``:

* transcript redaction patterns (additive only),
* a ``soloknuckle:hygiene`` skill,
* ``hermes hygiene`` CLI,
* ``/hygiene`` in-session command,
* a weekly hygiene-report automation blueprint.

No hooks. No middleware. Nothing rewrites LLM input or injects context.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict

try:  # imported as ``hermes_plugins.soloknuckle`` by the Hermes loader
    from .core import (
        REDACTION_PATTERNS,
        calculate_health,
        current_git_diff,
        intercept_command,
        scan_secrets,
    )
except ImportError:  # imported as a top-level module (tests, dashboard bridge)
    from core import (  # type: ignore[no-redef]
        REDACTION_PATTERNS,
        calculate_health,
        current_git_diff,
        intercept_command,
        scan_secrets,
    )

__all__ = [
    "register",
    "scan_secrets",
    "intercept_command",
    "calculate_health",
    "current_git_diff",
    "REDACTION_PATTERNS",
]

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool handlers (self-contained, no hermes_plugin_sdk at import time)
# ---------------------------------------------------------------------------
def _run_secrets(args: Dict[str, Any]) -> str:
    return json.dumps(scan_secrets(args.get("diff", "") or current_git_diff()))


def _run_intercept(args: Dict[str, Any]) -> str:
    command = args.get("command", "")
    if not command:
        return json.dumps({"blocked": False, "reason": "No command provided", "suggestion": None})
    return json.dumps(intercept_command(command))


def _run_health(args: Dict[str, Any]) -> str:
    return json.dumps(calculate_health())


# ---------------------------------------------------------------------------
# Registration (called by Hermes at runtime)
# ---------------------------------------------------------------------------
def _register_tools(ctx: Any) -> None:
    ctx.register_tool(
        name="soloknuckle.secrets",
        toolset="soloknuckle",
        schema={
            "type": "object",
            "properties": {
                "diff": {
                    "type": "string",
                    "description": "Git diff to scan. Empty = auto-scan staged/unstaged.",
                }
            },
            "required": [],
        },
        handler=_run_secrets,
        description="Scan git diff for API keys, tokens, and credentials",
    )

    ctx.register_tool(
        name="soloknuckle.intercept",
        toolset="soloknuckle",
        schema={
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to evaluate"}
            },
            "required": ["command"],
        },
        handler=_run_intercept,
        description="Evaluate shell command safety. Returns blocked/reason/suggestion.",
    )

    ctx.register_tool(
        name="soloknuckle.health",
        toolset="soloknuckle",
        schema={"type": "object", "properties": {}, "required": []},
        handler=_run_health,
        description="Project health score (0-100) with actionable issues",
    )


def _register_redaction(ctx: Any) -> None:
    """Add Soloknuckle's credential regexes to Hermes' transcript redactor.

    Additive only: the host refuses anything that could weaken a built-in
    pattern, so the worst case is over-redaction.
    """
    try:
        enabled = ctx.get_config("redaction_enabled", True)
    except Exception:
        enabled = True
    if not enabled:
        logger.info("soloknuckle: redaction patterns disabled by config")
        return
    try:
        accepted = ctx.register_redaction_patterns(REDACTION_PATTERNS)
        logger.info("soloknuckle: registered %d redaction pattern(s)", accepted)
    except Exception as exc:
        logger.warning("soloknuckle: redaction patterns skipped: %s", exc)


def _register_skill(ctx: Any) -> None:
    skill_path = Path(__file__).resolve().parent / "skills" / "hygiene" / "SKILL.md"
    if not skill_path.is_file():
        logger.warning("soloknuckle: skill file missing at %s", skill_path)
        return
    try:
        ctx.register_skill(
            name="hygiene",
            path=skill_path,
            description=(
                "Check a project for leaked secrets, dangerous shell commands, and "
                "failing health before it ships."
            ),
        )
    except Exception as exc:
        logger.warning("soloknuckle: skill registration skipped: %s", exc)


def _register_surfaces(ctx: Any) -> None:
    try:
        from .hermes_surfaces import (
            blueprint_kwargs,
            build_cli_parser,
            handle_cli,
            handle_slash,
        )
    except ImportError:  # top-level module import (tests, dashboard bridge)
        from hermes_surfaces import (  # type: ignore[no-redef]
            blueprint_kwargs,
            build_cli_parser,
            handle_cli,
            handle_slash,
        )

    ctx.register_cli_command(
        name="hygiene",
        help="Run Soloknuckle hygiene checks (secrets, firewall, health)",
        setup_fn=build_cli_parser,
        handler_fn=handle_cli,
        description=(
            "Production hygiene for the current project: scan a git diff for leaked "
            "credentials, evaluate a shell command before running it, and score "
            "project health."
        ),
    )

    ctx.register_command(
        name="hygiene",
        handler=handle_slash,
        description="Scan for secrets, evaluate a command, or report project health",
        args_hint="[secrets|intercept <cmd>]",
    )

    try:
        ctx.register_automation_blueprint(**blueprint_kwargs())
    except Exception as exc:
        logger.warning("soloknuckle: automation blueprint skipped: %s", exc)


def register(ctx: Any) -> None:
    """Register every declared surface with Hermes."""
    _register_tools(ctx)
    _register_redaction(ctx)
    _register_skill(ctx)
    _register_surfaces(ctx)
