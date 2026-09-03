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

# --- reclaim disposable docker storage --------------------------------------
# Every deploy leaves layers and build cache behind and nothing removed them,
# so the disk filled up until a build died half-way through with "no space left
# on device". Staging kept serving the old build, but the deploy was stuck.
#
# Old cache only: the last few days are what makes an incremental build quick,
# and throwing that away would turn every deploy into a from-scratch compile of
# the PHP extensions. Dangling images are the untagged leftovers of previous
# builds and are always safe to drop.
#
# Deliberately not `image prune -a`: other stacks live on this box and that
# would delete images they still need.
echo "==> Reclaiming old docker build cache…"
docker builder prune -f --filter until=72h >/dev/null || true
docker image prune -f >/dev/null || true

# Still tight? Then the rest of the cache goes too. A slow build beats one that
# runs out of room three minutes in.
AVAIL_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
if [ "${AVAIL_GB:-0}" -lt 20 ]; then
    echo "    only ${AVAIL_GB}G free — clearing the whole build cache."
    docker builder prune -a -f >/dev/null || true
fi
echo "    $(df -h / | awk 'NR==2 {print $4" free of "$2}')."

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

# The application lives in the image, not in a mount, so what is running is only
# the code that was just rsynced if the build genuinely picked it up. A cached
# layer, an interrupted build or a container that was never recreated all leave
# the stack serving the previous release while every line above still prints
# success. Compare the two rather than trust it.
echo "==> Checking the running container has the code that was just deployed…"
fingerprint() {
    # Sorted names and sorted contents, so a changed, added, removed or renamed
    # file all move the hash. LC_ALL=C keeps the ordering identical either side.
    find app routes config database/migrations -type f -name '*.php' 2>/dev/null | LC_ALL=C sort
    find app routes config database/migrations -type f -name '*.php' -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0 cat
}

HOST_FP=$(cd "$(dirname "$0")" && fingerprint | sha256sum | cut -c1-16)
# </dev/null so the exec cannot swallow this script's own stdin.
CONTAINER_FP=$($COMPOSE exec -T app sh -c "cd /var/www/html && $(declare -f fingerprint); fingerprint | sha256sum" </dev/null 2>/dev/null | cut -c1-16)

if [ -z "$CONTAINER_FP" ]; then
    echo "Refusing to continue: could not read the application code out of the app container."
    echo "The container may not be running. Check: $COMPOSE ps"
    exit 1
fi

if [ "$HOST_FP" != "$CONTAINER_FP" ]; then
    echo "Refusing to continue: the running container is not serving the deployed code."
    echo "    host:      $HOST_FP"
    echo "    container: $CONTAINER_FP"
    echo
    echo "The image is stale. Rebuild without the layer cache and recreate:"
    echo "    $COMPOSE build --no-cache app"
    echo "    $COMPOSE up -d --force-recreate app queue scheduler nginx"
    exit 1
fi
echo "    match ($HOST_FP)."

echo "==> Publishing built assets for nginx…"
$COMPOSE run --rm assets

echo "==> Migrating (once, from here — never in the entrypoint)…"
$COMPOSE exec -T app php artisan migrate --force

# Seeders only when the DB has no roles yet, so re-deploys don't re-run them.
# HOME=/tmp because tinker (psysh) writes a config file and www-data has no home,
# and without it the command errors out instead of answering.
set +e
ROLES_OUT=$($COMPOSE exec -T -e HOME=/tmp app php artisan tinker --execute='echo \Spatie\Permission\Models\Role::count();' 2>&1)
ROLES_RC=$?
set -e
ROLES=$(printf '%s' "$ROLES_OUT" | tr -d '[:space:]')

# Three outcomes, not two. Discarding stderr and defaulting an empty result to 0
# turned "I could not tell" into "the database is empty", which does not skip the
# seeders — it runs them over populated staging data. Only a clean exit whose
# output is nothing but digits is an answer.
if [ "$ROLES_RC" -ne 0 ] || ! printf '%s' "$ROLES" | grep -qE '^[0-9]+$'; then
    echo "Refusing to continue: could not read the role count, so it is not known whether"
    echo "this database is fresh. Seeding on a guess would re-run seeders over real data."
    printf '%s\n' "$ROLES_OUT" | sed 's/^/    /'
    exit 1
fi

if [ "$ROLES" = "0" ]; then
    echo "==> Fresh database — seeding roles / org / settings…"
    $COMPOSE exec -T -e HOME=/tmp app php artisan db:seed --force
    echo
    echo "    No login user is seeded. Create a staging admin (change the password):"
    echo "    $COMPOSE exec -T -e HOME=/tmp app php artisan tinker --execute='\$p=Hash::make(\"CHANGE-ME\"); \$u=App\\Models\\User::firstOrCreate([\"email\"=>\"admin@wmt-dev.bfcgroup.ph\"],[\"name\"=>\"Staging Admin\",\"is_active\"=>true,\"password\"=>\$p]); \$u->syncRoles([\"admin\"]);'"
else
    echo "==> Database already seeded ($ROLES roles) — skipping seeders."
fi

# Swallow only the one benign outcome. `|| true` over a discarded stderr hid a
# genuinely missing symlink just as readily as an already-correct one.
set +e
LINK_OUT=$($COMPOSE exec -T app php artisan storage:link 2>&1)
LINK_RC=$?
set -e
if [ "$LINK_RC" -ne 0 ] && ! printf '%s' "$LINK_OUT" | grep -q "already exists"; then
    echo "Refusing to continue: storage:link failed."
    printf '%s\n' "$LINK_OUT" | sed 's/^/    /'
    exit 1
fi

# Prove the stack actually boots before calling the deploy done, so a bad cached
# config or a broken autoloader surfaces here rather than on the first request.
echo "==> Smoke check…"
$COMPOSE exec -T -e HOME=/tmp app php artisan about --only=environment > /dev/null
echo "    application boots."

echo
echo "Done. WMT staging is up on http://127.0.0.1:${HTTP_PORT:-9081} (loopback)."
echo "If wmt-dev.bfcgroup.ph is already in the tunnel, it is live at https://wmt-dev.bfcgroup.ph"
echo "Otherwise add the ingress rule in STAGING.md (needs sudo)."
