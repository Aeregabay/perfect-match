#!/usr/bin/env bash
# End-to-end test: real schema and access rules (Postgres + PostgREST), local stand-in for auth/storage, built app, Chromium.
# Needs: a running Postgres (PGHOST/PGPORT/PGUSER/PGPASSWORD), POSTGREST_BIN, node, playwright with chromium.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${PMDB:-pme2e}; export PMDB=$DB
SECRET=local-test-secret-local-test-secret-1234
P="psql -v ON_ERROR_STOP=1 -q"

$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/supabase_shim.sql supabase/migrations/*.sql; do $P -d "$DB" -f "$f" 2>&1 | grep -v -e NOTICE -e wal_level -e HINT || true; done
$P -d "$DB" -c "alter role authenticator with login password 'e2e-only'"

cat > /tmp/pm-e2e-pgrst.conf <<EOF
db-uri = "postgres://authenticator:e2e-only@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
EOF
case "${PGHOST:-localhost}" in /*) sed -i "s#@${PGHOST}:${PGPORT:-5432}/$DB#@/$DB?host=${PGHOST}\&port=${PGPORT:-5432}#" /tmp/pm-e2e-pgrst.conf;; esac

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
"${POSTGREST_BIN:-postgrest}" /tmp/pm-e2e-pgrst.conf > /tmp/pm-e2e-pgrst.log 2>&1 & pids+=($!)
JWT_SECRET=$SECRET node tests/e2e/gateway.mjs > /tmp/pm-e2e-gw.log 2>&1 & pids+=($!)

VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=e2e VITE_PUBLIC_SITE_URL=https://example.invalid npx vite build --outDir /tmp/pm-e2e-dist --emptyOutDir > /dev/null
npx vite preview --outDir /tmp/pm-e2e-dist --port 4173 --strictPort > /tmp/pm-e2e-preview.log 2>&1 & pids+=($!)
for i in $(seq 1 30); do curl -sf localhost:4173 > /dev/null && curl -s localhost:3001 > /dev/null && break; sleep 1; done

node tests/e2e/app.e2e.cjs
