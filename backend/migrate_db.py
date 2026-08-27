"""
Copy every row from one Finance Track database to another.

Typical use - move local MySQL up to TiDB Cloud:

    python migrate_db.py \
        --source "mysql+pymysql://root:PASSWORD@localhost:3306/finance_track?charset=utf8mb4" \
        --target "mysql+pymysql://USER:PASSWORD@gateway01.<region>.prod.aws.tidbcloud.com:4000/finance_track?charset=utf8mb4"

Or read both from environment files instead of the command line:

    python migrate_db.py --source-env .env --target-env .env.production

Flags:
    --dry-run     report what would be copied, write nothing
    --replace     wipe the target tables first (required if the target has rows)
    --skip-users  comma-separated emails to leave behind, with everything they own

Tables are copied in foreign-key order, primary keys are preserved, and the row
counts are re-checked afterwards, so a partial copy cannot pass silently.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Iterable, Optional
from urllib.parse import quote_plus

from sqlalchemy import create_engine, delete, func, insert, select
from sqlalchemy.engine import Engine

# Importing the models registers all 22 tables on Base.metadata.
from app.db.session import Base
import app.models  # noqa: F401

BATCH = 500


def build_ssl_args(url: str) -> dict:
    """Managed hosts require TLS; a local server has no certificate."""
    local = any(h in url for h in ("@localhost", "@127.0.0.1", "@::1"))
    if local:
        return {}
    import certifi

    return {"ssl": {"ca": certifi.where()}}


def url_from_env_file(path: str) -> str:
    """Assembles a SQLAlchemy URL from an .env file's DB_* variables."""
    values: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip("'\"")

    if values.get("DATABASE_URL"):
        return values["DATABASE_URL"]

    user = quote_plus(values.get("DB_USER", "root"))
    password = quote_plus(values.get("DB_PASSWORD", ""))
    host = values.get("DB_HOST", "localhost")
    port = values.get("DB_PORT", "3306")
    name = values.get("DB_NAME", "finance_track")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"


def describe(url: str) -> str:
    """Host and database only - never echo the password."""
    tail = url.split("@")[-1]
    return tail.split("?")[0]


def count_rows(engine: Engine) -> dict[str, int]:
    counts: dict[str, int] = {}
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            counts[table.name] = conn.execute(select(func.count()).select_from(table)).scalar() or 0
    return counts


def excluded_user_ids(engine: Engine, emails: Iterable[str]) -> set[str]:
    wanted = {e.strip().lower() for e in emails if e.strip()}
    if not wanted:
        return set()
    users = Base.metadata.tables["users"]
    with engine.connect() as conn:
        rows = conn.execute(select(users.c.id, users.c.email)).all()
    return {row.id for row in rows if (row.email or "").lower() in wanted}


def migrate(
    source_url: str,
    target_url: str,
    *,
    dry_run: bool = False,
    replace: bool = False,
    skip_emails: Optional[list[str]] = None,
) -> int:
    source = create_engine(source_url, connect_args=build_ssl_args(source_url), future=True)
    target = create_engine(target_url, connect_args=build_ssl_args(target_url), future=True)

    print(f"source : {describe(source_url)}")
    print(f"target : {describe(target_url)}")
    print()

    source_counts = count_rows(source)
    target_counts = count_rows(target)
    total_source = sum(source_counts.values())
    total_target = sum(target_counts.values())

    if total_source == 0:
        print("Source database is empty - nothing to migrate.")
        return 0

    skipped_ids = excluded_user_ids(source, skip_emails or [])
    if skipped_ids:
        print(f"Excluding {len(skipped_ids)} user(s) and everything they own.\n")

    if total_target and not replace and not dry_run:
        print(f"Target already holds {total_target} row(s). Refusing to merge blindly.")
        print("Re-run with --replace to wipe the target first, or clear it yourself.")
        return 1

    if replace and not dry_run:
        # Reverse FK order so children go before parents.
        with target.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(delete(table))
        print("Target tables cleared.\n")

    print(f"{'table':<28}{'source':>8}{'copied':>8}")
    print("-" * 44)

    copied_total = 0
    copied_per_table: dict[str, int] = {}
    # Primary keys actually carried over, per table. Needed because exclusions
    # must cascade: ai_messages hangs off ai_conversations rather than off a
    # user, so dropping a user's conversations has to drop its messages too, or
    # the insert fails on the foreign key.
    kept_keys: dict[str, set] = {}

    for table in Base.metadata.sorted_tables:
        with source.connect() as conn:
            rows = [dict(r) for r in conn.execute(select(table)).mappings()]

        if skipped_ids:
            if table.name == "users":
                rows = [r for r in rows if r.get("id") not in skipped_ids]
            elif "user_id" in table.c:
                rows = [r for r in rows if r.get("user_id") not in skipped_ids]

            # Then cascade: drop rows pointing at a parent we did not carry.
            for fk in table.foreign_keys:
                parent = fk.column.table.name
                if parent not in kept_keys or parent == table.name:
                    continue
                column = fk.parent.name
                allowed = kept_keys[parent]
                rows = [
                    r for r in rows if r.get(column) is None or r.get(column) in allowed
                ]

        pk_cols = [c.name for c in table.primary_key.columns]
        if pk_cols:
            kept_keys[table.name] = {r[pk_cols[0]] for r in rows}

        if rows and not dry_run:
            with target.begin() as conn:
                for start in range(0, len(rows), BATCH):
                    conn.execute(insert(table), rows[start : start + BATCH])

        copied_total += len(rows)
        copied_per_table[table.name] = len(rows)
        if source_counts[table.name] or rows:
            print(f"{table.name:<28}{source_counts[table.name]:>8}{len(rows):>8}")

    print("-" * 44)
    print(f"{'TOTAL':<28}{total_source:>8}{copied_total:>8}")
    print()

    if dry_run:
        print("Dry run - nothing was written.")
        return 0

    # Verify rather than trust: re-count the target against what we actually
    # sent, which stays correct even when users were excluded.
    final = count_rows(target)
    mismatches = []
    for table in Base.metadata.sorted_tables:
        expected = copied_per_table.get(table.name, 0)
        if final[table.name] != expected:
            mismatches.append(f"  {table.name}: expected {expected}, found {final[table.name]}")

    if mismatches:
        print("VERIFICATION FAILED - row counts do not match:")
        print("\n".join(mismatches))
        return 1

    print(f"Verified: {sum(final.values())} row(s) now in the target database.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Copy a Finance Track database to another server.")
    parser.add_argument("--source", help="Source SQLAlchemy URL")
    parser.add_argument("--target", help="Target SQLAlchemy URL")
    parser.add_argument("--source-env", help="Read DB_* from this env file for the source")
    parser.add_argument("--target-env", help="Read DB_* from this env file for the target")
    parser.add_argument("--dry-run", action="store_true", help="Report only, write nothing")
    parser.add_argument("--replace", action="store_true", help="Wipe the target before copying")
    parser.add_argument("--skip-users", default="", help="Comma-separated emails to leave behind")
    args = parser.parse_args()

    source_url = args.source or (url_from_env_file(args.source_env) if args.source_env else None)
    target_url = args.target or (url_from_env_file(args.target_env) if args.target_env else None)

    if not source_url or not target_url:
        parser.error("Provide --source/--target URLs, or --source-env/--target-env files.")

    if source_url == target_url:
        parser.error("Source and target are the same database.")

    return migrate(
        source_url,
        target_url,
        dry_run=args.dry_run,
        replace=args.replace,
        skip_emails=args.skip_users.split(","),
    )


if __name__ == "__main__":
    sys.exit(main())
