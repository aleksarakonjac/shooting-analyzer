#!/usr/bin/env bash
# Runs supabase/tests/*.sql (pgTAP) against a throwaway local Postgres cluster.
# Needs postgresql@18 and pgtap installed locally. Nothing is left running or committed.
set -euo pipefail
export LC_ALL=en_US.UTF-8
shopt -s nullglob
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
PORT="${PGPORT_TEST:-54329}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="$(mktemp -d)"
SOCK="$(mktemp -d /tmp/pgs.XXXXXX)"
cleanup() { [ -n "${DEBUG_LOG:-}" ] && cat "$DATA/log" 2>/dev/null; "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
PSQL=("$PGBIN/psql" -h "$SOCK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -c "create database app" >/dev/null
PSQL+=(-d app)
"${PSQL[@]}" -f "$ROOT/scripts/db/stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
out="$("$PGBIN/pg_prove" --version >/dev/null 2>&1 && echo prove || echo psql)"
fail=0
"${PSQL[@]}" -f "$ROOT/scripts/db/helpers.sql"
for t in "$ROOT"/supabase/tests/*.sql; do
  res="$("${PSQL[@]}" -t -A -f "$t" 2>&1)" || fail=1
  echo "$res"
  if grep -qE '^(not ok|# Looks like)' <<<"$res"; then fail=1; fi
done
exit $fail
