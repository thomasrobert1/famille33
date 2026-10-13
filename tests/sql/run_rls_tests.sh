#!/usr/bin/env bash
# Crée une base jetable, applique les migrations et exécute les tests RLS.
# Prérequis : PostgreSQL ≥ 15 local, utilisateur avec droits superutilisateur.
set -euo pipefail
DB="f33_rls_$$"
DIR="$(cd "$(dirname "$0")" && pwd)"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
bash "$DIR/run_migrations.sh" "$DB" > /dev/null
psql -q -d "$DB" -f "$DIR/rls_test.sql" | tee /tmp/f33_rls_result.txt
! grep -q '^ÉCHEC' /tmp/f33_rls_result.txt
