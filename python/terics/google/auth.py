from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.app.created",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
]
KEYRING_SERVICE = "terics-google-oauth"
KEYRING_USER = "default"


class GoogleOAuthNotConfiguredError(RuntimeError):
    pass


class KeyringTokenStore:
    def load(self) -> dict[str, Any] | None:
        import keyring

        raw = keyring.get_password(KEYRING_SERVICE, KEYRING_USER)
        return json.loads(raw) if raw else None

    def save(self, token: dict[str, Any]) -> None:
        import keyring

        keyring.set_password(KEYRING_SERVICE, KEYRING_USER, json.dumps(token, separators=(",", ":")))

    def clear(self) -> None:
        import keyring

        try:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except keyring.errors.PasswordDeleteError:
            pass


def google_client_config() -> dict[str, Any] | None:
    config_path = os.getenv("TERICS_GOOGLE_CLIENT_CONFIG")
    if config_path:
        path = Path(config_path)
        if not path.exists():
            raise GoogleOAuthNotConfiguredError(f"Google OAuth 配置文件不存在：{path}")
        return json.loads(path.read_text(encoding="utf-8"))
    client_id = os.getenv("TERICS_GOOGLE_CLIENT_ID")
    if not client_id:
        return None
    return {
        "installed": {
            "client_id": client_id,
            "client_secret": os.getenv("TERICS_GOOGLE_CLIENT_SECRET", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://127.0.0.1"],
        }
    }


def oauth_configured() -> bool:
    try:
        return google_client_config() is not None
    except GoogleOAuthNotConfiguredError:
        return False


def load_credentials(store: KeyringTokenStore | None = None):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    store = store or KeyringTokenStore()
    token = store.load()
    if not token:
        return None
    credentials = Credentials.from_authorized_user_info(token, GOOGLE_SCOPES)
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        token = json.loads(credentials.to_json())
        store.save(token)
    return credentials if credentials.valid else None


def authenticate(store: KeyringTokenStore | None = None):
    from google_auth_oauthlib.flow import InstalledAppFlow

    store = store or KeyringTokenStore()
    existing = load_credentials(store)
    if existing:
        return existing
    client_config = google_client_config()
    if not client_config:
        raise GoogleOAuthNotConfiguredError(
            "未配置 Google OAuth Desktop Client。请设置 TERICS_GOOGLE_CLIENT_ID / TERICS_GOOGLE_CLIENT_SECRET "
            "或 TERICS_GOOGLE_CLIENT_CONFIG。"
        )
    flow = InstalledAppFlow.from_client_config(client_config, GOOGLE_SCOPES)
    credentials = flow.run_local_server(
        host="127.0.0.1",
        port=0,
        open_browser=True,
        access_type="offline",
        prompt="consent",
        authorization_prompt_message="请在浏览器中完成 Google 授权，完成后会自动返回 terics：{url}",
        success_message="Google 授权完成，可以关闭此页面并返回 terics。",
    )
    store.save(json.loads(credentials.to_json()))
    return credentials


def clear_google_credentials(store: KeyringTokenStore | None = None) -> None:
    (store or KeyringTokenStore()).clear()
