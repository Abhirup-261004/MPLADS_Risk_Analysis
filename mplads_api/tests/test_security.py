import asyncio
import os

import pytest
from fastapi import HTTPException

from mplads_api.core import security
from mplads_api.config import settings


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_dev_escape_hatch_allows_any_key(monkeypatch):
    monkeypatch.setenv("MPLADS_ENV", "development")
    monkeypatch.setattr(settings, "API_KEY", "secret")
    assert _run(security.verify_api_key("anything")) == "anything"


def test_missing_key_rejected_401(monkeypatch):
    monkeypatch.delenv("MPLADS_ENV", raising=False)
    monkeypatch.setattr(settings, "API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        _run(security.verify_api_key(None))
    assert exc.value.status_code == 401


def test_wrong_key_rejected_401(monkeypatch):
    monkeypatch.delenv("MPLADS_ENV", raising=False)
    monkeypatch.setattr(settings, "API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        _run(security.verify_api_key("wrong"))
    assert exc.value.status_code == 401


def test_correct_key_accepted(monkeypatch):
    monkeypatch.delenv("MPLADS_ENV", raising=False)
    monkeypatch.setattr(settings, "API_KEY", "secret")
    assert _run(security.verify_api_key("secret")) == "secret"


def test_unconfigured_server_key_fails_closed_500(monkeypatch):
    monkeypatch.delenv("MPLADS_ENV", raising=False)
    monkeypatch.setattr(settings, "API_KEY", None)
    with pytest.raises(HTTPException) as exc:
        _run(security.verify_api_key("secret"))
    assert exc.value.status_code == 500