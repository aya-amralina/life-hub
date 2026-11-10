"""Check Supabase keys and project settings before deploy/import. Prints statuses only, no data.

    python3 scripts/import/check_keys.py
"""
from __future__ import annotations

import sys

from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, load_env


def main() -> int:
    ok = True

    def report(passed: bool, text: str) -> None:
        nonlocal ok
        ok &= passed
        print(("✓ " if passed else "✗ ") + text)

    try:
        cfg = config_from_env(load_env())
    except ConfigError as err:
        print(f"✗ {err}")
        return 1
    report(True, "формат ключей: sb_secret_ / sb_publishable_, секрет не в VITE_")

    secret = SupabaseRest(cfg.url, cfg.secret_key)
    try:
        if cfg.email:
            secret.find_user_id(cfg.email)
            report(True, "secret key → Auth admin API работает, пользователь LIFEHUB_EMAIL найден")
        else:
            report(False, "LIFEHUB_EMAIL не задан")
    except (SupabaseError, ConfigError) as err:
        report(False, f"secret key → Auth admin API: {err}")

    for table in ("weeks", "items"):
        try:
            n = secret.count(table)
            report(True, f"secret key → REST {table}: доступ есть, строк {n}")
        except SupabaseError as err:
            hint = " (миграции применены? npm run db:push)" if err.status == 404 else ""
            report(False, f"secret key → REST {table}: {err}{hint}")

    if cfg.publishable_key:
        public = SupabaseRest(cfg.url, cfg.publishable_key)
        try:
            _, settings, _ = public.request("GET", "/auth/v1/settings")
            report(bool(settings.get("disable_signup")), "регистрация новых пользователей выключена")
            report(bool(settings.get("external", {}).get("email")), "вход по e-mail включён")
        except SupabaseError as err:
            report(False, f"publishable key → Auth settings: {err}")
        for table in ("weeks", "items"):
            try:
                public.request("GET", f"/rest/v1/{table}", query={"select": "id", "limit": "1"})
                report(False, f"publishable key без входа → {table}: доступ есть, а у anon не должно быть прав")
            except SupabaseError as err:
                report(err.code == "42501", f"publishable key без входа → {table}: прав нет ({err.code or err.status})")
    else:
        report(False, "VITE_SUPABASE_PUBLISHABLE_KEY не задан")

    print("Всё в порядке." if ok else "Есть проблемы — см. ✗ выше.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
