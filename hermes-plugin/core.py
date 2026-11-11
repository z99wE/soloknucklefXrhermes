"""Soloknuckle engine — the one implementation behind every surface.

CLI, git hooks, MCP, the Hermes tools, and the dashboard all call these
functions. Deterministic and local: no network, no model, no state.

The rules themselves live in ``rules.json`` next to this file, which is the same
file ``cli/core.ts`` imports. Both engines therefore read one rule set, and
``test/parity.test.ts`` fails if they ever stop agreeing.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_RULES_PATH = Path(__file__).resolve().with_name("rules.json")


def _load_rules(path: Path = _RULES_PATH) -> Dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:  # pragma: no cover - packaging error
        raise RuntimeError(
            f"soloknuckle: rules file missing at {path}. "
            "Reinstall the plugin; rules.json ships next to core.py."
        ) from exc
    for key in ("secret_patterns", "destructive_patterns", "advisory_patterns"):
        if not isinstance(data.get(key), list):
            raise RuntimeError(f"soloknuckle: rules.json is missing '{key}'")
    return data


RULES = _load_rules()


def _compile(source: str, flags: int = 0) -> "re.Pattern[str]":
    """Compile a rule, failing loudly instead of silently scanning nothing."""
    try:
        return re.compile(source, flags)
    except re.error as exc:  # pragma: no cover - only on a hand-edited rule file
        raise RuntimeError(f"soloknuckle: invalid rule pattern {source!r}: {exc}") from exc


def _flag_bits(flags: Optional[str]) -> int:
    bits = 0
    for flag in flags or "":
        if flag == "i":
            bits |= re.IGNORECASE
        elif flag == "m":
            bits |= re.MULTILINE
        elif flag == "s":
            bits |= re.DOTALL
    return bits


SECRET_PATTERNS: List[Tuple["re.Pattern[str]", str]] = [
    (_compile(rule["pattern"], _flag_bits(rule.get("flags"))), rule["label"])
    for rule in RULES["secret_patterns"]
]

# The subset Hermes' transcript redactor accepts. It requires at least two
# literal prefix characters and refuses top-level alternation, which is why a
# rule can carry a narrower ``redact_pattern``.
REDACTION_PATTERNS: List[str] = [
    rule.get("redact_pattern") or rule["pattern"]
    for rule in RULES["secret_patterns"]
    if rule.get("redact")
]

PLACEHOLDER_TOKENS = tuple(token.lower() for token in RULES["placeholder_tokens"])
ALLOW_MARKER = RULES["allow_marker"].lower()


def is_placeholder_match(match: str) -> bool:
    """True only when the *matched text* looks like a placeholder.

    Testing the whole line (the old behaviour) silently skipped a real key that
    merely sat on a line mentioning "mock" or "localhost".
    """
    lower = match.lower()
    return any(token in lower for token in PLACEHOLDER_TOKENS)


def scan_secrets(diff: str) -> Dict[str, Any]:
    """Scan a git diff for secrets. Returns {clean, violations}."""
    violations: List[str] = []
    for i, line in enumerate(diff.split("\n"), 1):
        # Only additions can introduce a secret; skip headers and removals.
        if not line.startswith("+") or line.startswith("+++"):
            continue
        # Explicit, greppable escape hatch for fixtures and documentation.
        if ALLOW_MARKER in line.lower():
            continue
        for pattern, label in SECRET_PATTERNS:
            match = pattern.search(line)
            if match is None:
                continue
            if is_placeholder_match(match.group(0)):
                continue
            violations.append(f"Line {i}: {label} detected.")
            break
    return {"clean": len(violations) == 0, "violations": violations}


def current_git_diff(cwd: Optional[str] = None) -> str:
    """Staged diff if there is one, else unstaged. Empty string outside a repo."""
    for argv in (["git", "diff", "--cached"], ["git", "diff"]):
        try:
            result = subprocess.run(
                argv, capture_output=True, text=True, timeout=10, cwd=cwd or os.getcwd()
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return ""
        if result.stdout:
            return result.stdout
    return ""


# ---------------------------------------------------------------------------
# Command firewall
# ---------------------------------------------------------------------------
DESTRUCTIVE_PATTERNS: List[Tuple["re.Pattern[str]", str]] = [
    (_compile(rule["pattern"], _flag_bits(rule.get("flags"))), rule["reason"])
    for rule in RULES["destructive_patterns"]
]

ADVISORY_PATTERNS: List[Tuple["re.Pattern[str]", str, str]] = [
    (
        _compile(rule["pattern"], _flag_bits(rule.get("flags"))),
        rule["reason"],
        rule.get("suggestion") or "",
    )
    for rule in RULES["advisory_patterns"]
]

# Kept as an alias so existing callers and tests keep one name for the advisory
# tier.
SUGGEST_PATTERNS = ADVISORY_PATTERNS


def intercept_command(command: str) -> Dict[str, Any]:
    """Evaluate a shell command. Returns {blocked, reason, suggestion}."""
    for pattern, reason in DESTRUCTIVE_PATTERNS:
        if pattern.search(command):
            return {"blocked": True, "reason": reason, "suggestion": None}

    for pattern, reason, suggestion in ADVISORY_PATTERNS:
        if pattern.search(command):
            return {"blocked": False, "reason": reason, "suggestion": suggestion or None}

    return {"blocked": False, "reason": None, "suggestion": None}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def calculate_health(cwd: Optional[str] = None) -> Dict[str, Any]:
    """Run basic health checks. Returns {score, grade, issues}.

    Every npm invocation is guarded by a local ``package.json``: without it,
    ``npm`` walks up to a parent directory and lints someone else's project.
    """
    issues: List[str] = []
    checks_passed = 0
    total_checks = 4
    cwd = cwd or os.getcwd()
    has_package_json = os.path.exists(os.path.join(cwd, "package.json"))

    # 1. Dependency check
    if has_package_json:
        checks_passed += 1
    else:
        issues.append("Dependencies: no package.json")

    # 2. Lint check
    if not has_package_json:
        issues.append("Lint: no package.json")
    else:
        try:
            result = subprocess.run(
                ["npm", "run", "lint", "--silent"],
                capture_output=True,
                timeout=30,
                cwd=cwd,
            )
            if result.returncode == 0:
                checks_passed += 1
            else:
                issues.append("Lint: failing")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            issues.append("Lint: no lint script or timed out")
        except Exception:
            issues.append("Lint: failed")

    # 3. Test check
    if not has_package_json:
        issues.append("Tests: no package.json")
    else:
        try:
            result = subprocess.run(
                ["npm", "test", "--silent", "--run"],
                capture_output=True,
                timeout=60,
                cwd=cwd,
            )
            if result.returncode == 0:
                checks_passed += 1
            else:
                issues.append("Tests: failing")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            issues.append("Tests: no test script or timed out")
        except Exception:
            issues.append("Tests: failed")

    # 4. Secrets check
    try:
        result = scan_secrets(current_git_diff(cwd))
        if result["clean"]:
            checks_passed += 1
        else:
            issues.append(f"Secrets: {len(result['violations'])} violation(s)")
    except Exception:
        issues.append("Secrets: scan failed")

    score = int((checks_passed / total_checks) * 100)
    grade = "A" if score >= 90 else "B" if score >= 70 else "C" if score >= 40 else "F"

    return {"score": score, "grade": grade, "issues": issues[:5]}
