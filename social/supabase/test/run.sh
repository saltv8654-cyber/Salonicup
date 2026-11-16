#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL, applies the migration twice (idempotency) and runs the RLS tests.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
OWNER="$(id -un)"
if [ "$OWNER" = "root" ]; then RUN="su postgres -s /bin/bash -c"; chown -R postgres "$DIR"; else RUN="bash -c"; fi
$RUN "'$PGBIN/initdb' -D '$DIR/data' -U postgres >/dev/null"
$RUN "'$PGBIN/pg_ctl' -D '$DIR/data' -o '-k $DIR -p 54329 -c listen_addresses=' -l '$DIR/log' start >/dev/null"
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -h $DIR -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f test/setup_local.sql
$PSQL -f test/grants_local.sql
$PSQL -f migrations/0001_core.sql
$PSQL -f migrations/0001_core.sql   # must be re-runnable
$PSQL -o /dev/null -f test/rls_test.sql
