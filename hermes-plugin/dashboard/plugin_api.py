"""Soloknuckle REST API for Hermes desktop plugin."""

from __future__ import annotations

import os
import subprocess
import sys

# Ensure plugin root is on sys.path
_plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _plugin_root not in sys.path:
    sys.path.insert(0, _plugin_root)

from __init__ import scan_secrets, intercept_command, calculate_health


def _get_json(request):
    """Extract JSON body from request, handling both dict and callable."""
    req_json = getattr(request, "json", None)
    if callable(req_json):
        try:
            req_json = req_json()
        except Exception:
            req_json = None
    if isinstance(req_json, dict):
        return req_json
    return {}


class SoloknuckleAPI:
    """REST API exposed to Hermes desktop at /api/plugins/soloknuckle/<method>."""

    def rest_secrets(self, request):
        """Scan git diff for secrets."""
        req = _get_json(request)
        diff = req.get("diff", "")
        if not diff:
            try:
                result = subprocess.run(
                    ["git", "diff", "--cached"],
                    capture_output=True, text=True, timeout=10,
                    cwd=os.getcwd(),
                )
                diff = result.stdout
                if not diff:
                    result = subprocess.run(
                        ["git", "diff"],
                        capture_output=True, text=True, timeout=10,
                        cwd=os.getcwd(),
                    )
                    diff = result.stdout
            except Exception:
                diff = ""
        return {"ok": True, "data": scan_secrets(diff)}

    def rest_intercept(self, request):
        """Evaluate shell command safety."""
        req = _get_json(request)
        command = req.get("command", "")
        return {"ok": True, "data": intercept_command(command)}

    def rest_health(self, request):
        """Project health score."""
        return {"ok": True, "data": calculate_health()}


plugin_api = SoloknuckleAPI