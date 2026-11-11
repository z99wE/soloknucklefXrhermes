"""Parity probe: run the shared corpus through the Python engine.

Invoked by ``test/parity.test.ts``. Prints one JSON object on stdout so the
TypeScript side can compare, case for case, against its own engine. Kept free of
pytest so the Node test suite does not depend on a Python test runner.
"""

from __future__ import annotations

import json
import os
import sys

_plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _plugin_root not in sys.path:
    sys.path.insert(0, _plugin_root)

import core  # noqa: E402  (path is set up above)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: parity_probe.py <corpus.json>", file=sys.stderr)
        return 2

    with open(argv[1], encoding="utf-8") as handle:
        corpus = json.load(handle)

    payload = {
        "secrets": [core.scan_secrets(diff) for diff in corpus["diffs"]],
        "commands": [core.intercept_command(command) for command in corpus["commands"]],
        "redaction_patterns": core.REDACTION_PATTERNS,
    }
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
