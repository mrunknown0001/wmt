#!/usr/bin/env bash
#
# Build and (re)deploy the WMT staging stack on the VM. Idempotent: safe to run
# again for every change. Run it from the checkout root on 10.10.0.101.
#
#   ./deploy-staging.sh
#
# It never touches the other stacks on the box, and never edits the shared
# cloudflared config — that one-time ingress rule is a manual, sudo step
# documented in STAGING.md.
set -euo pipefail

COMPOSE="docker compose -f docker-compose.staging.yml"

cd "$(dirname "$0")"

# --- .env must exist and carry an app key ------------------------------------
if [ ! -f .env ]; then
    echo "No .env found. Copying the staging template — fill in the REPLACE_ME values, then re-run."
    cp .env.staging.example .env
    echo "  edit: $(pwd)/.env"
    exit 1
fi

if ! grep -qE '^APP_KEY=base64:' .env; then
    echo "APP_KEY is blank. Generating one into .env…"
    KEY=$(docker run --rm -v "$(pwd)/artisan:/artisan:ro" php:8.4-cli php -r "echo 'base64:'.base64_encode(random_bytes(32));")
    # Portable in-place edit (BSD/GNU sed differ).
    tmp=$(mktemp); sed "s|^APP_KEY=.*|APP_KEY=${KEY}|" .env > "$tmp" && mv "$tmp" .env
    echo "  set APP_KEY."
fi

if grep -q 'REPLACE_ME' .env; then
    echo "Refusing to deploy: .env still has REPLACE_ME placeholders. Fill them in first:"
    grep -n 'REPLACE_ME' .env
    exit 1
fi

# The container user must own the mounted .env, or it cannot read it.
export HOST_UID="$(id -u)"
export HOST_GID="$(id -g)"

echo "==> Building images (this bakes code + assets in)…"
$COMPOSE build

echo "==> Starting data services…"
$COMPOSE up -d mysql redis soketi

echo "==> Waiting for MySQL to be healthy…"
until [ "$($COMPOSE ps -q mysql | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
    sleep 2; printf '.'
done
echo " ready."

echo "==> Starting app, workers, web…"
$COMPOSE up -d app queue scheduler nginx

echo "==> Publishing built assets for nginx…"
$COMPOSE run --rm assets

echo "==> Migrating (once, from here — never in the entrypoint)…"
$COMPOSE exec -T app php artisan migrate --force

# Seeders only when the DB has no roles yet, so re-deploys don't re-run them.
# HOME=/tmp because tinker (psysh) writes a config file and www-data has no home
# — without it the command errors, the count comes back empty, and seeding is
# silently skipped.
ROLES=$($COMPOSE exec -T -e HOME=/tmp app php artisan tinker --execute='echo \Spatie\Permission\Models\Role::count();' 2>/dev/null | tr -dc 0-9)
if [ "${ROLES:-0}" = "0" ]; then
    echo "==> Fresh database — seeding roles / org / settings…"
    $COMPOSE exec -T -e HOME=/tmp app php artisan db:seed --force
    echo
    echo "    No login user is seeded. Create a staging admin (change the password):"
    echo "    $COMPOSE exec -T -e HOME=/tmp app php artisan tinker --execute='\$p=Hash::make(\"CHANGE-ME\"); \$u=App\\Models\\User::firstOrCreate([\"email\"=>\"admin@wmt-dev.bfcgroup.ph\"],[\"name\"=>\"Staging Admin\",\"is_active\"=>true,\"password\"=>\$p]); \$u->syncRoles([\"admin\"]);'"
else
    echo "==> Database already seeded ($ROLES roles) — skipping seeders."
fi

$COMPOSE exec -T app php artisan storage:link 2>/dev/null || true

echo
echo "Done. WMT staging is up on http://127.0.0.1:${HTTP_PORT:-9081} (loopback)."
echo "If wmt-dev.bfcgroup.ph is already in the tunnel, it is live at https://wmt-dev.bfcgroup.ph"
echo "Otherwise add the ingress rule in STAGING.md (needs sudo)."
