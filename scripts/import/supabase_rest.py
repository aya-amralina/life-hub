"""Minimal Supabase REST client for the local import (stdlib only).

Keys are the new format: `sb_secret_…` (server) and `sb_publishable_…` (client). They are not JWTs,
so they travel only in the `apikey` header — never as `Authorization: Bearer`. The API gateway maps
the secret key to the `service_role` Postgres role (bypasses RLS) and the publishable key to `anon`.

Privacy: errors carry the PostgREST `code` and `message` only. `details`/`hint` can echo row values
(e.g. «Failing row contains …») and are never printed.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
USER_AGENT = "life-hub-import/1.0"

PROJECT_URL = re.compile(r"^https://[a-z0-9]+\.supabase\.co$")
SECRET_PREFIX = "sb_secret_"
PUBLISHABLE_PREFIX = "sb_publishable_"


class ConfigError(Exception):
    pass


class SupabaseError(Exception):
    def __init__(self, status: int, code: str | None, message: str):
        super().__init__(f"HTTP {status}{f' {code}' if code else ''}: {message}")
        self.status = status
        self.code = code


def parse_env(text: str) -> dict[str, str]:
    """Parse a .env file: KEY=VALUE lines, # comments, optional quotes."""
    env: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        env[key] = value
    return env


def load_env(path: Path | None = None) -> dict[str, str]:
    """`.env.local` overlaid by the process environment."""
    path = path or ROOT / ".env.local"
    env = parse_env(path.read_text(encoding="utf-8")) if path.exists() else {}
    env.update({k: v for k, v in os.environ.items() if k.startswith(("VITE_SUPABASE_", "SUPABASE_", "LIFEHUB_"))})
    return env


@dataclass(frozen=True)
class Config:
    url: str
    secret_key: str
    publishable_key: str | None
    email: str | None


def config_from_env(env: dict[str, str]) -> Config:
    url = env.get("VITE_SUPABASE_URL", "").rstrip("/")
    secret = env.get("SUPABASE_SECRET_KEY", "")
    publishable = env.get("VITE_SUPABASE_PUBLISHABLE_KEY") or None
    if not url.startswith("https://"):
        raise ConfigError("VITE_SUPABASE_URL не задан в .env.local")
    if "YOUR-PROJECT" in url:
        raise ConfigError("VITE_SUPABASE_URL — ещё плейсхолдер из .env.example: впиши адрес проекта (Project Settings → API)")
    if not PROJECT_URL.match(url):
        raise ConfigError("VITE_SUPABASE_URL должен выглядеть как https://<ref>.supabase.co — без пути и без точки в конце")
    if not secret:
        raise ConfigError("SUPABASE_SECRET_KEY не задан в .env.local")
    if not secret.startswith(SECRET_PREFIX):
        raise ConfigError("SUPABASE_SECRET_KEY должен начинаться с sb_secret_ (legacy service_role больше не используется)")
    if publishable and not publishable.startswith(PUBLISHABLE_PREFIX):
        raise ConfigError("VITE_SUPABASE_PUBLISHABLE_KEY должен начинаться с sb_publishable_")
    for name, value in env.items():
        if name.startswith("VITE_") and value.startswith(SECRET_PREFIX):
            raise ConfigError(f"{name}: секретный ключ в VITE_-переменной попадёт во фронтенд")
    return Config(url=url, secret_key=secret, publishable_key=publishable, email=env.get("LIFEHUB_EMAIL") or None)


def key_headers(key: str) -> dict[str, str]:
    """Headers for a new-format key: `apikey` only. A JWT session token, if any, is added by the caller."""
    if not key.startswith((SECRET_PREFIX, PUBLISHABLE_PREFIX)):
        raise ConfigError("ожидается ключ нового формата (sb_secret_… или sb_publishable_…)")
    return {"apikey": key, "User-Agent": USER_AGENT}


Opener = Callable[[urllib.request.Request], Any]


class SupabaseRest:
    def __init__(self, url: str, key: str, opener: Opener | None = None):
        self.url = url.rstrip("/")
        self.headers = key_headers(key)
        self._open = opener or (lambda req: urllib.request.urlopen(req, timeout=30))

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str] | None = None,
        body: Any = None,
        prefer: str | None = None,
    ) -> tuple[int, Any, dict[str, str]]:
        url = f"{self.url}{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query, safe=",.*()")
        headers = dict(self.headers)
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with self._open(req) as resp:
                raw = resp.read()
                payload = json.loads(raw) if raw else None
                return resp.status, payload, {k.lower(): v for k, v in resp.headers.items()}
        except urllib.error.HTTPError as err:
            raise _safe_error(err.code, err.read()) from None
        except (urllib.error.URLError, TimeoutError) as err:
            reason = getattr(err, "reason", err)
            raise SupabaseError(0, "network", f"нет соединения ({type(reason).__name__})") from None

    # ── helpers used by the importer ──

    def find_user_id(self, email: str) -> str:
        """Look up the single app user via the Auth admin API (secret key required)."""
        target = email.strip().lower()
        page = 1
        while True:
            _, data, _ = self.request("GET", "/auth/v1/admin/users", query={"page": str(page), "per_page": "100"})
            users = data.get("users", []) if isinstance(data, dict) else []
            for user in users:
                if (user.get("email") or "").lower() == target:
                    return user["id"]
            if len(users) < 100:
                raise ConfigError("пользователь с LIFEHUB_EMAIL не найден в Supabase Auth")
            page += 1

    def count(self, table: str, filters: dict[str, str] | None = None) -> int:
        query = {"select": "id", **(filters or {})}
        _, _, headers = self.request("HEAD", f"/rest/v1/{table}", query=query, prefer="count=exact")
        total = headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str = "user_id,source_id") -> None:
        for start in range(0, len(rows), 500):
            self.request(
                "POST",
                f"/rest/v1/{table}",
                query={"on_conflict": on_conflict},
                body=rows[start : start + 500],
                prefer="resolution=merge-duplicates,return=minimal",
            )


def _safe_error(status: int, raw: bytes) -> SupabaseError:
    code = None
    message = "ошибка без описания"
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            code = payload.get("code") or payload.get("error_code") or payload.get("error")
            message = payload.get("message") or payload.get("msg") or payload.get("error_description") or message
    except (ValueError, TypeError):
        pass
    return SupabaseError(status, str(code) if code is not None else None, str(message)[:200])
