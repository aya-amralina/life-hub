"""Full backup of the app user's data to data/backups/ (never committed). Local only, secret key.

    npm run backup

Free Supabase has no daily backups — run it after each import and every week or so. The file has the same
format as «Экспорт JSON» in Настройки, so it can be restored there («Восстановить из JSON»). Prints counts only.
"""
from __future__ import annotations

import datetime as dt
import json
import sys

from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, load_env
from xl import DATA

# Every user table, parents first (the restore goes in this order).
TABLES = [
    "weeks", "plan_stages", "activity_types", "envelopes", "debts", "people",
    "items", "transactions", "actual_balances", "week_limits", "daily_logs", "activities", "intake",
    "strength_sets", "measurements", "notes", "wishlist", "reviews", "import_baseline",
]
FORMAT = "life-hub-backup"
VERSION = 1


def main() -> int:
    try:
        cfg = config_from_env(load_env())
        if not cfg.email:
            raise ConfigError("LIFEHUB_EMAIL не задан в .env.local")
        rest = SupabaseRest(cfg.url, cfg.secret_key)
        uid = rest.find_user_id(cfg.email)
        tables = {t: rest.select(t, "*", {"user_id": f"eq.{uid}", "order": "created_at.asc"}) for t in TABLES}
    except (ConfigError, SupabaseError) as err:
        print(f"✗ {err}")
        return 1
    now = dt.datetime.now(dt.timezone.utc)
    folder = DATA / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"lifehub-backup-{now.astimezone(dt.timezone(dt.timedelta(hours=1))):%Y-%m-%d-%H%M}.json"
    payload = {"format": FORMAT, "version": VERSION, "exported_at": now.isoformat(), "tables": tables}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    total = sum(len(v) for v in tables.values())
    print(f"✓ бэкап: {path.relative_to(DATA.parent)} · {total} строк, {path.stat().st_size // 1024} КБ")
    print("  " + ", ".join(f"{t} {len(v)}" for t, v in tables.items() if v))
    return 0


if __name__ == "__main__":
    sys.exit(main())
