"""Soloknuckle REST bridge for the Hermes desktop plugin.

Every handler is a thin pass-through to the engine in ``core.py``. Nothing here
duplicates a pattern or a git call: the dashboard must answer exactly like the
CLI and the tools do.
"""

from __future__ import annotations

import logging
import os
import sys

# Loaded by the plugin host as a standalone module, so make the plugin root
# importable before pulling in the engine.
_plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _plugin_root not in sys.path:
    sys.path.insert(0, _plugin_root)

try:  # imported as ``hermes_plugins.soloknuckle.dashboard.plugin_api``
    from ..core import calculate_health, current_git_diff, intercept_command, scan_secrets
except (ImportError, ValueError):  # top-level module import (host, tests)
    from core import (  # type: ignore[no-redef]
        calculate_health,
        current_git_diff,
        intercept_command,
        scan_secrets,
    )

logger = logging.getLogger(__name__)


def _get_json(request):
    """Extract a JSON body from the host request object."""
    req_json = getattr(request, "json", None)
    if callable(req_json):
        try:
            req_json = req_json()
        except Exception:
            logger.debug("soloknuckle: dashboard request body was not JSON")
            req_json = None
    return req_json if isinstance(req_json, dict) else {}


class SoloknuckleAPI:
    """REST API exposed at /api/plugins/soloknuckle/<method>."""

    def rest_secrets(self, request):
        """Scan a supplied diff, or the working tree's diff when none is given."""
        diff = _get_json(request).get("diff", "")
        return {"ok": True, "data": scan_secrets(diff or current_git_diff())}

    def rest_intercept(self, request):
        """Evaluate a shell command before it runs."""
        command = _get_json(request).get("command", "")
        if not command:
            return {"ok": False, "error": "command is required"}
        return {"ok": True, "data": intercept_command(command)}

    def rest_health(self, request):
        """Score the project the host is running in."""
        return {"ok": True, "data": calculate_health()}


plugin_api = SoloknuckleAPI
