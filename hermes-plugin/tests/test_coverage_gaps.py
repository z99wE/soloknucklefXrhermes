from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

import core
import hermes_surfaces


def test_flag_bits_and_compile():
    assert core._flag_bits("i") & __import__("re").IGNORECASE
    assert core._flag_bits("m") & __import__("re").MULTILINE
    assert core._flag_bits("s") & __import__("re").DOTALL
    pat = core._compile("abc", core._flag_bits("i"))
    assert pat.search("ABC")


def test_load_rules_missing_key(tmp_path: Path):
    bad = tmp_path / "rules.json"
    bad.write_text(json.dumps({"secret_patterns": [], "destructive_patterns": []}))
    with pytest.raises(RuntimeError):
        core._load_rules(bad)


def test_current_git_diff_prefers_cached(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    calls = []

    def fake_run(argv, **kwargs):
        calls.append(list(argv))
        if argv[:3] == ["git", "diff", "--cached"]:
            return subprocess.CompletedProcess(argv, 0, stdout="+cached\n", stderr="")
        return subprocess.CompletedProcess(argv, 0, stdout="+unstaged\n", stderr="")

    monkeypatch.setattr(core.subprocess, "run", fake_run)
    assert core.current_git_diff(str(tmp_path)) == "+cached\n"
    assert calls[0][:3] == ["git", "diff", "--cached"]


def test_current_git_diff_falls_back_to_unstaged(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    def fake_run(argv, **kwargs):
        if "--cached" in argv:
            return subprocess.CompletedProcess(argv, 0, stdout="", stderr="")
        return subprocess.CompletedProcess(argv, 0, stdout="+unstaged\n", stderr="")

    monkeypatch.setattr(core.subprocess, "run", fake_run)
    assert core.current_git_diff(str(tmp_path)) == "+unstaged\n"


def test_current_git_diff_handles_missing_git(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    def boom(*a, **k):
        raise FileNotFoundError()

    monkeypatch.setattr(core.subprocess, "run", boom)
    assert core.current_git_diff(str(tmp_path)) == ""


def test_calculate_health_generic_failures(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    (tmp_path / "package.json").write_text("{}")

    def fake_run(argv, **kwargs):
        if "lint" in argv or "test" in argv:
            raise RuntimeError("boom")
        return subprocess.CompletedProcess(argv, 0, stdout="", stderr="")

    monkeypatch.setattr(core.subprocess, "run", fake_run)
    monkeypatch.setattr(core, "current_git_diff", lambda cwd=None: "")
    result = core.calculate_health(str(tmp_path))
    assert "Lint: failed" in result["issues"]
    assert "Tests: failed" in result["issues"]


def test_calculate_health_secrets_scan_exception(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(core, "scan_secrets", lambda diff: (_ for _ in ()).throw(RuntimeError("x")))
    result = core.calculate_health(str(tmp_path))
    assert "Secrets: scan failed" in result["issues"]


def test_slash_usage_and_intercept_empty():
    assert hermes_surfaces.handle_slash("").startswith("Health:")
    assert hermes_surfaces.handle_slash("intercept") == hermes_surfaces._USAGE
    assert hermes_surfaces.handle_slash("intercept   ") == hermes_surfaces._USAGE
    assert hermes_surfaces.handle_slash("unknown thing") == hermes_surfaces._USAGE


def test_cli_secrets_uses_diff_arg(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    import argparse

    parser = argparse.ArgumentParser()
    hermes_surfaces.build_cli_parser(parser)
    args = parser.parse_args(["secrets", "--diff", "+ok"])
    assert hermes_surfaces.handle_cli(args) == 0
    assert "No secrets detected" in capsys.readouterr().out
