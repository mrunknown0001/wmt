#!/usr/bin/env bash
#
# Deploy WMT to the production host (/var/www/wmt, no Docker).
#
#   sudo ./deploy-production.sh
#
# Production tracks its own branch, not a development one, so shipping is a
# deliberate merge rather than whatever happens to be on dev today. The steps
# below are the ones that were being run by hand, plus the three that were not
# and caused an outage: composer install, queue:restart, and a check for data
# migrations that ship alongside a release.
set -euo pipefail

APP_DIR="/var/www/wmt"
APP_USER="www-data"
BRANCH="${DEPLOY_BRANCH:-production}"

cd "$APP_DIR"

say() { printf '\n==> %s\n' "$1"; }

# --- refuse to deploy from an unclear state ----------------------------------
if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing to deploy: the working tree has uncommitted changes."
    git status --short
    exit 1
fi

CURRENT="$(git branch --show-current)"
if [ "$CURRENT" != "$BRANCH" ]; then
    echo "Refusing to deploy: on branch '$CURRENT', expected '$BRANCH'."
    echo "Production follows '$BRANCH' so a development branch cannot reach it by accident."
    echo "Override for a one-off with: DEPLOY_BRANCH=$CURRENT $0"
    exit 1
fi

say "Fetching $BRANCH"
git fetch origin "$BRANCH"

BEFORE="$(git rev-parse HEAD)"
AFTER="$(git rev-parse "origin/$BRANCH")"

if [ "$BEFORE" = "$AFTER" ]; then
    echo "    Already at $(git log -1 --format='%h %s'). Nothing to deploy."
    exit 0
fi

echo "    $(git rev-parse --short "$BEFORE") -> $(git rev-parse --short "$AFTER")"
git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'

# --- what is about to change, before anything is touched ---------------------
say "Pending schema migrations"
git diff --name-only "$BEFORE" "$AFTER" -- database/migrations | sed 's/^/    /' || true

# A release can carry a one-off data migration that no schema check will catch.
# Missing one is what left every attachment 404ing after the storage change.
say "One-off commands in this release (run these yourself, after the deploy)"
git diff --name-only "$BEFORE" "$AFTER" -- app/Console/Commands | sed 's/^/    new or changed: /' || true
echo "    If any of the above is a data migration, run it once the deploy finishes."

read -r -p "
Continue? [y/N] " reply
[ "$reply" = "y" ] || { echo "Aborted."; exit 1; }

say "Pulling"
git merge --ff-only "origin/$BRANCH"

# Never skipped: a release that adds a PHP dependency fails at runtime without
# it, and this was not part of the manual routine.
say "Installing PHP dependencies"
composer install --no-dev --optimize-autoloader --no-interaction

say "Building assets"
npm ci --no-fund --no-audit
npm run build

say "Migrating"
sudo -u "$APP_USER" php artisan migrate --force

say "Ensuring the storage symlink exists"
sudo -u "$APP_USER" php artisan storage:link 2>/dev/null || true

say "Rebuilding caches"
sudo -u "$APP_USER" php artisan optimize:clear
sudo -u "$APP_USER" php artisan optimize

# queue:work holds the application in memory, so a worker started before this
# deploy keeps running the old code until it is told to stop. Without this it
# only picks up the release when --max-time recycles it, up to an hour later.
say "Restarting the queue worker"
sudo -u "$APP_USER" php artisan queue:restart

say "Ownership"
chown -R "$APP_USER":"$APP_USER" storage bootstrap/cache

say "Done — now at $(git log -1 --format='%h %s')"
echo "    Scheduler:    crontab -u $APP_USER -l"
echo "    Queue worker: systemctl status wmt-queue"
