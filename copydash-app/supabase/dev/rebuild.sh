#!/bin/zsh
# DEV ONLY — rebuilds the copydash-dev Supabase project from the migrations,
# seeds test users/data, and runs the permission tests.
# Needs DEV_DATABASE_URL / DEV_SUPABASE_* in copydash-app/.env.local.
# Every script refuses to run if the URL points at the production project.
set -e
cd "$(dirname "$0")"
ENV="../../.env.local"
MIG="../migrations"
node --env-file="$ENV" q.cjs reset.sql >/dev/null
for f in "$MIG"/000[1-6]*.sql; do node --env-file="$ENV" q.cjs "$f" >/dev/null; done
node --env-file="$ENV" seed.cjs > ids.json
for f in "$MIG"/000[7-9]*.sql "$MIG"/001*.sql(N); do echo "apply $(basename "$f")"; node --env-file="$ENV" q.cjs "$f" >/dev/null; done
node --env-file="$ENV" rls-test.cjs
node --env-file="$ENV" review-test.cjs
