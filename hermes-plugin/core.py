"""Soloknuckle engine — the one implementation behind every surface.

CLI, git hooks, MCP, the Hermes tools, and the dashboard all call these
functions. Deterministic and local: no network, no model, no state.
"""

from __future__ import annotations

import os
import re
import subprocess
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Secret patterns (credentials only, no PII)
# ---------------------------------------------------------------------------
SECRET_PATTERNS = [
    (re.compile(r"sk_live_[0-9a-zA-Z]{24}"), "Stripe live key"),
    (re.compile(r"rk_live_[0-9a-zA-Z]{24}"), "Stripe restricted key"),
    (re.compile(r"sk-[a-zA-Z0-9]{32,}"), "OpenAI/Anthropic-style API key"),
    (re.compile(r"sk-proj-[0-9A-Za-z_-]{20,}"), "OpenAI project API key"),
    (re.compile(r"sk-ant-api[0-9]{2}-[0-9A-Za-z_-]{40,}"), "Anthropic API key"),
    (re.compile(r"xox[baprs]-[a-zA-Z0-9-]+"), "Slack token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key"),
    (re.compile(r"ASIA[0-9A-Z]{16}"), "AWS temporary access key"),
    (re.compile(r"ghp_[A-Za-z0-9]{36}"), "GitHub personal access token"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{22,}"), "GitHub fine-grained PAT"),
    (re.compile(r"ghs_[A-Za-z0-9]{36}"), "GitHub server-to-server token"),
    (re.compile(r"gho_[A-Za-z0-9]{36}"), "GitHub OAuth token"),
    (re.compile(r"npm_[A-Za-z0-9]{36}"), "npm access token"),
    (re.compile(r"SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}"), "SendGrid API key"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "GCP API key"),
    (re.compile(r"\bglpat-[0-9A-Za-z_-]{20,}"), "GitLab personal access token"),
    (re.compile(r"\bhf_[A-Za-z0-9]{16,}"), "Hugging Face access token"),
    (re.compile(r"shpat_[0-9a-fA-F]{32}"), "Shopify access token"),
    (re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY"), "Private key"),
    (re.compile(r"(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|mariadb)://[a-zA-Z0-9_\-\.]+:[^@\s\"']+@[a-zA-Z0-9_\-\.]+", re.IGNORECASE), "Database URI with credentials"),
]

# The subset Hermes' transcript redactor accepts: it requires at least two
# literal prefix characters and refuses top-level alternation, so the database
# URI pattern (a leading group of alternatives) is deliberately excluded.
REDACTION_PATTERNS = [
    r"sk_live_[0-9a-zA-Z]{24}",
    r"rk_live_[0-9a-zA-Z]{24}",
    r"sk-ant-api[0-9]{2}-[0-9A-Za-z_-]{40,}",
    r"sk-proj-[0-9A-Za-z_-]{20,}",
    r"sk-[a-zA-Z0-9]{32,}",
    r"xox[baprs]-[a-zA-Z0-9-]+",
    r"AKIA[0-9A-Z]{16}",
    r"ASIA[0-9A-Z]{16}",
    r"ghp_[A-Za-z0-9]{36}",
    r"github_pat_[A-Za-z0-9_]{22,}",
    r"ghs_[A-Za-z0-9]{36}",
    r"gho_[A-Za-z0-9]{36}",
    r"npm_[A-Za-z0-9]{36}",
    r"SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}",
    r"AIza[0-9A-Za-z\-_]{35}",
    r"glpat-[0-9A-Za-z_-]{20,}",
    r"hf_[A-Za-z0-9]{16,}",
    r"shpat_[0-9a-fA-F]{32}",
    r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY",
]

PLACEHOLDER_WORDS = {"your_key_here", "placeholder", "xxxx", "localhost", "mock", "dummy", "changeme", "<token>"}


def _is_placeholder(line: str) -> bool:
    lower = line.lower()
    return any(w in lower for w in PLACEHOLDER_WORDS)


def scan_secrets(diff: str) -> Dict[str, Any]:
    """Scan a git diff for secrets. Returns {clean, violations}."""
    violations: List[str] = []
    for i, line in enumerate(diff.split("\n"), 1):
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(line):
                if _is_placeholder(line):
                    continue
                violations.append(f"Line {i}: {label} detected.")
                break
    return {"clean": len(violations) == 0, "violations": violations}


def current_git_diff(cwd: str | None = None) -> str:
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
# Destructive command patterns
# ---------------------------------------------------------------------------
DESTRUCTIVE_PATTERNS = [
    (re.compile(r"curl\s+.*\|\s*(?:ba|z|k|c|tc)?sh", re.IGNORECASE), "Piping remote script to shell"),
    (re.compile(r"wget\s+.*\|\s*(?:ba|z|k|c|tc)?sh", re.IGNORECASE), "Piping remote script to shell"),
    (re.compile(r"\brm\s+-rf\s+/\s*$", re.IGNORECASE), "Recursive delete of root"),
    (re.compile(r"\bdd\s+if=.*of=/dev/", re.IGNORECASE), "Raw disk write"),
    (re.compile(r"\bmkfs\b", re.IGNORECASE), "Filesystem format"),
    (re.compile(r"\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b", re.IGNORECASE), "SQL drop"),
]

SUGGEST_PATTERNS = [
    (re.compile(r"\brm\s+-rf\b", re.IGNORECASE), "Recursive force delete", "Use 'rm -i' or 'trash-put' instead"),
    (re.compile(r"\bgit\s+push\s+(?:--force|-f)\b", re.IGNORECASE), "Force push", "Use '--force-with-lease' instead"),
    (re.compile(r"\bchmod\s+(?:-R\s+)?777\b", re.IGNORECASE), "Overly permissive chmod", "Use 'chmod 644' or 'chmod u=rwx,go=rx' instead"),
    (re.compile(r"\bgit\s+reset\s+--hard\b", re.IGNORECASE), "Hard reset", "Use 'git stash' or 'git reset --soft' instead"),
]


def intercept_command(command: str) -> Dict[str, Any]:
    """Evaluate a shell command. Returns {blocked, reason, suggestion}."""
    for pattern, reason in DESTRUCTIVE_PATTERNS:
        if pattern.search(command):
            return {"blocked": True, "reason": reason, "suggestion": None}

    for pattern, reason, suggestion in SUGGEST_PATTERNS:
        if pattern.search(command):
            return {"blocked": False, "reason": reason, "suggestion": suggestion}

    return {"blocked": False, "reason": None, "suggestion": None}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def calculate_health(cwd: str | None = None) -> Dict[str, Any]:
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
