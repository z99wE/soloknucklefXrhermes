"""Unit tests for the soloknuckle plugin backend."""

import json
import os
import sys

# Insert plugin root into sys.path so __init__ imports without the Hermes runtime
_plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _plugin_root not in sys.path:
    sys.path.insert(0, _plugin_root)

import __init__


class FakeCtx:
    """Records every registrar call so we can assert the declared surface exactly."""

    def __init__(self):
        self.tools = []
        self.middlewares = []
        self.hooks = []
        self.redaction_patterns = []
        self.skills = []
        self.cli_commands = []
        self.commands = []
        self.blueprints = []
        self.settings = {}

    def get_config(self, key, default=None):
        return self.settings.get(key, default)

    def register_tool(self, **kwargs):
        self.tools.append(kwargs["name"])

    def register_middleware(self, kind, cb):
        self.middlewares.append(kind)

    def register_hook(self, name, cb):
        self.hooks.append(name)

    def register_redaction_patterns(self, patterns):
        self.redaction_patterns.extend(patterns)
        return len(patterns)

    def register_skill(self, name, path, description=""):
        self.skills.append((name, str(path)))

    def register_cli_command(self, name, help, setup_fn, handler_fn=None, description=""):
        self.cli_commands.append(name)

    def register_command(self, name, handler, description="", args_hint="", argument_mode=None):
        self.commands.append(name)

    def register_automation_blueprint(self, **kwargs):
        self.blueprints.append(kwargs["key"])


def test_scan_secrets_clean():
    result = __init__.scan_secrets("diff --git a/foo.py b/foo.py\n+print('hello')")
    assert result["clean"] is True
    assert result["violations"] == []


def test_scan_secrets_aws_key():
    result = __init__.scan_secrets("+AWS_KEY=AKIAIOSFODNN7EXAMPLE")  # soloknuckle:allow
    assert result["clean"] is False
    assert len(result["violations"]) > 0


def test_scan_secrets_github_pat():
    result = __init__.scan_secrets("+token = ghp_abcdefghijklmnopqrstuvwxyz1234567890")  # soloknuckle:allow
    assert result["clean"] is False


def test_scan_secrets_placeholder_ignored():
    result = __init__.scan_secrets("+api_key = your_key_here")
    assert result["clean"] is True


def test_intercept_curl_pipe_sh():
    result = __init__.intercept_command("curl https://example.com/install.sh | sh")
    assert result["blocked"] is True
    assert "shell" in result["reason"].lower() or "pipe" in result["reason"].lower()


def test_intercept_rm_rf_root():
    result = __init__.intercept_command("rm -rf /")
    assert result["blocked"] is True


def test_intercept_sql_drop():
    result = __init__.intercept_command("DROP TABLE users")
    assert result["blocked"] is True


def test_intercept_rm_rf_suggests():
    result = __init__.intercept_command("rm -rf ./build")
    assert result["blocked"] is False
    assert result["suggestion"] is not None


def test_intercept_safe_command():
    result = __init__.intercept_command("ls -la")
    assert result["blocked"] is False
    assert result["reason"] is None


def test_intercept_git_force_push():
    result = __init__.intercept_command("git push --force origin main")
    assert result["blocked"] is False
    assert result["suggestion"] is not None


def test_health_returns_structure(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no package.json: health must not shell out
    result = __init__.calculate_health()
    assert "score" in result
    assert "grade" in result
    assert "issues" in result
    assert isinstance(result["score"], int)
    assert 0 <= result["score"] <= 100
    assert result["grade"] in ("A", "B", "C", "F")
    assert "Dependencies: no package.json" in result["issues"]


def test_tool_handlers(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    secrets = json.loads(__init__._run_secrets({"diff": "+hello"}))
    assert secrets["clean"] is True

    intercept = json.loads(__init__._run_intercept({"command": "ls"}))
    assert intercept["blocked"] is False

    health = json.loads(__init__._run_health({}))
    assert "score" in health


def test_redaction_patterns_are_host_safe():
    """Hermes requires >=2 literal prefix chars; alternation must not be top-level."""
    assert __init__.REDACTION_PATTERNS
    for pattern in __init__.REDACTION_PATTERNS:
        prefix = pattern[:2]
        assert prefix.isalnum() or pattern.startswith("-----BEGIN"), pattern
        assert not pattern.startswith("("), pattern


def test_register_exact_surface():
    ctx = FakeCtx()
    __init__.register(ctx)

    # Three tools, exactly.
    assert ctx.tools == [
        "soloknuckle.secrets",
        "soloknuckle.intercept",
        "soloknuckle.health",
    ]

    # Native surfaces, each declared in plugin.yaml.
    assert ctx.skills and ctx.skills[0][0] == "hygiene"
    assert ctx.cli_commands == ["hygiene"]
    assert ctx.commands == ["hygiene"]
    assert ctx.blueprints == ["weekly-report"]
    assert len(ctx.redaction_patterns) >= 18

    # LLM safety: no hooks, no middleware, no prompt rewriting.
    assert ctx.hooks == []
    assert ctx.middlewares == []


def test_redaction_can_be_disabled():
    ctx = FakeCtx()
    ctx.settings["redaction_enabled"] = False
    __init__.register(ctx)
    assert ctx.redaction_patterns == []


def test_slash_handler(monkeypatch):
    import hermes_surfaces

    monkeypatch.setattr(
        hermes_surfaces,
        "calculate_health",
        lambda: {"score": 80, "grade": "B", "issues": ["Lint: failing"]},
    )
    # Pin the diff: a slash command must not depend on whatever happens to be
    # staged in the checkout running the tests.
    monkeypatch.setattr(hermes_surfaces, "current_git_diff", lambda: "+print('hello')")

    assert "Health: 80/100 (B)" in hermes_surfaces.handle_slash("")
    assert "No secrets detected." in hermes_surfaces.handle_slash("secrets")
    assert "Blocked:" in hermes_surfaces.handle_slash("intercept curl https://x.test/i.sh | sh")
    assert hermes_surfaces.handle_slash("nonsense").startswith("Usage:")

    monkeypatch.setattr(
        hermes_surfaces, "current_git_diff", lambda: "+AWS_KEY=AKIAIOSFODNN7EXAMPLE"  # soloknuckle:allow
    )
    assert "1 violation(s)" in hermes_surfaces.handle_slash("secrets")


def test_cli_positional_does_not_shadow_args_command():
    """`args.command` belongs to the top-level Hermes parser; a list there crashes startup."""
    import argparse

    from hermes_surfaces import build_cli_parser, handle_cli

    parser = argparse.ArgumentParser()
    build_cli_parser(parser)

    namespace = parser.parse_args(["intercept", "ls", "-la"])
    assert not hasattr(namespace, "command")
    assert namespace.command_parts == ["ls", "-la"]
    assert handle_cli(namespace) == 0

    blocked = parser.parse_args(["intercept", "rm -rf /"])
    assert handle_cli(blocked) == 1

    usage = parser.parse_args(["intercept"])
    assert handle_cli(usage) == 2


def test_blueprint_kwargs_are_valid():
    from hermes_surfaces import blueprint_kwargs

    kwargs = blueprint_kwargs()
    assert kwargs["key"] == "weekly-report"
    assert "{minute}" in kwargs["schedule_template"]
    assert "{dow}" in kwargs["schedule_template"]
    # The template must not use braces the validator would treat as slots.
    assert "{" not in kwargs["prompt_template"]

