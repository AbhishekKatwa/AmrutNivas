#!/usr/bin/env bash
# AMRUT NIVAAS — local database harness.
#
# Runs a throwaway Postgres cluster on a non-default port so the tenant schema can
# be EXECUTED and ATTACKED before it is ever claimed to work. Nothing here touches
# a hosted project; the cluster lives under /tmp and is deleted by `down`.
#
#   ./local-pg.sh up        create + start the cluster (idempotent)
#   ./local-pg.sh apply     stub Supabase roles, then migrations in order
#   ./local-pg.sh verify    run db/verify/tenant_isolation.sql
#   ./local-pg.sh rebuild   down, up, apply, verify
#   ./local-pg.sh psql      open a psql shell against the harness database
#   ./local-pg.sh down      stop and delete the cluster
set -euo pipefail

PGROOT="${PGROOT:-/tmp/nivas-pg}"
DATADIR="$PGROOT/data"
PORT="${PORT:-54329}"
DB="nivas"
USER="postgres"
BIN="$(brew --prefix postgresql@18 2>/dev/null || echo /opt/homebrew/opt/postgresql@18)/bin"
export PATH="$BIN:$PATH"   # psql/createdb live in the keg on this machine
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="$PGROOT/sock" PGPORT="$PORT" PGUSER="$USER" PGDATABASE="$DB"
# macOS + Homebrew's postgresql@18 aborts startup with "postmaster became multithreaded
# during startup" when the shell hands it an unusable locale environment.
export LC_ALL="${LC_ALL:-C}"
# One-time host repair this script deliberately does NOT perform for you: if the keg's
# compiled paths are missing, initdb/postgres fail to find their data. Create them once:
# fix: ln -s ../opt/postgresql@18/share/postgresql /opt/homebrew/share/postgresql@18
# fix: ln -s timezone /opt/homebrew/share/postgresql@18/timezones
# fix: ln -s ../opt/postgresql@18/lib/postgresql  /opt/homebrew/lib/postgresql@18
# PG18's postmaster refuses to start multithreaded when the locale env is unset, which
# is exactly how a non-interactive shell looks on this machine.
export LC_ALL="${LC_ALL:-C}" LANG="${LANG:-C}"

q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

case "${1:-}" in
  up)
    [ -d "$DATADIR" ] && { echo "cluster already up on $PORT"; exit 0; }
    mkdir -p "$PGROOT" "$PGROOT/sock"
    "$BIN/initdb" -D "$DATADIR" -U "$USER" --auth=trust -E UTF8 --locale=C >/dev/null
    # A harness cluster must never be reachable from the network, and its socket must
    # live inside the repo-external tree so psql needs no sudo.
    {
      echo "port = $PORT"
      echo "unix_socket_directories = '$PGROOT/sock'"
      echo "listen_addresses = ''"
    } >> "$DATADIR/postgresql.conf"
    "$BIN/pg_ctl" -D "$DATADIR" -l "$PGROOT/pg.log" -w start >/dev/null
    createdb "$DB"
    echo "cluster up: $DATADIR (port $PORT, db $DB)"
    ;;

  apply)
    q -f "$REPO/harness/stub-supabase.sql"
    q <<'SQL'
create schema if not exists app;
create table if not exists app.schema_migrations (
  name text primary key, applied_at timestamptz not null default now()
);
SQL
    for f in "$REPO"/supabase/0*.sql; do
      n="$(basename "$f")"
      if q -tAc "select 1 from app.schema_migrations where name = '$n'" | grep -q 1; then
        echo "skip   $n (already applied)"
        continue
      fi
      q -f "$f"
      q -c "insert into app.schema_migrations (name) values ('$n')"
      echo "apply  $n"
    done
    ;;

  verify)
    q -f "$REPO/verify/tenant_isolation.sql"
    ;;

  rebuild)
    "$0" down; "$0" up; "$0" apply; "$0" verify
    ;;

  psql)
    q
    ;;

  down)
    [ -d "$DATADIR" ] && "$BIN/pg_ctl" -D "$DATADIR" -m immediate -w stop >/dev/null 2>&1 || true
    rm -rf "$PGROOT"
    echo "cluster removed"
    ;;

  *)
    grep '^#   ' "$0" | sed 's/^#   //'
    exit 1
    ;;
esac
