#!/usr/bin/env bash
# Applique l'émulation Supabase puis toutes les migrations dans une base locale.
# Usage : bash tests/sql/run_migrations.sh <nom_de_base>
set -euo pipefail
DB="${1:-f33test}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/tests/sql/supabase_stub.sql"
for f in "$DIR"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
