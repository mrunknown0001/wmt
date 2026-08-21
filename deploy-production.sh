#!/usr/bin/env bash
#
# Deploy WMT to the production host (/var/www/wmt, no Docker).
#
#   sudo ./deploy-production.sh            # deploy whatever is on origin/production
#   sudo ./deploy-production.sh --yes      # skip the confirmation prompt
#   sudo ./deploy-production.sh --force    # rebuild even if that commit is already deployed
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

# What the last *successful* run of this script actually built, which is not the
# same question as which commit is checked out. Kept outside git, under storage,
# so it survives deploys and is never itself a tracked change.
STATE_FILE="$APP_DIR/storage/app/.deployed-commit"

ASSUME_YES=0
FORCE=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y)   ASSUME_YES=1 ;;
        --force|-f) FORCE=1 ;;
        *) echo "Unknown option: $arg"; exit 2 ;;
    esac
done

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

HEAD_NOW="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "origin/$BRANCH")"

# The commit whose build is actually live.
#
# This used to be assumed equal to HEAD, and the two come apart the moment
# anyone moves the checkout by hand: a plain `git pull` before running this
# leaves HEAD at the target with none of the build having happened, and the
# old equality check read that as "nothing to deploy" and exited 0. The
# release then sat on disk with a stale autoloader, stale caches and workers
# still holding the previous code in memory. Recording what we built, rather
# than inferring it, is what makes that state visible.
DEPLOYED=""
if [ -f "$STATE_FILE" ]; then
    DEPLOYED="$(tr -dc '0-9a-f' < "$STATE_FILE")"
    # A rewritten history or a hand-edited marker must not be trusted.
    if [ -n "$DEPLOYED" ] && ! git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
        echo "    Recorded commit $DEPLOYED is not in this repository — treating as undeployed."
        DEPLOYED=""
    fi
fi

if [ -z "$DEPLOYED" ]; then
    say "No recorded deploy"
    echo "    Nothing says which commit was last built here, so the build steps will run"
    echo "    in full. This is also what you get the first time after adding this check."
fi

if [ "$DEPLOYED" = "$TARGET" ] && [ "$HEAD_NOW" = "$TARGET" ] && [ "$FORCE" -eq 0 ]; then
    echo "    Already deployed $(git log -1 --format='%h %s' "$TARGET"). Nothing to do."
    echo "    Rebuild it anyway with: $0 --force"
    exit 0
fi

if [ "$HEAD_NOW" = "$TARGET" ] && [ "$DEPLOYED" != "$TARGET" ]; then
    say "Checkout is ahead of the last build"
    echo "    HEAD is already at $(git rev-parse --short "$TARGET") but that commit was never"
    echo "    built by this script. Continuing so the build steps run."
fi

# Report against what is live, not against HEAD — if the checkout was moved by
# hand, HEAD..TARGET is empty and would hide the very changes being shipped.
BEFORE="${DEPLOYED:-$HEAD_NOW}"

if [ "$BEFORE" != "$TARGET" ]; then
    echo "    $(git rev-parse --short "$BEFORE") -> $(git rev-parse --short "$TARGET")"
    git --no-pager log --oneline "$BEFORE..$TARGET" | sed 's/^/    /'
fi

# --- what is about to change, before anything is touched ---------------------
say "Pending schema migrations"
git diff --name-only "$BEFORE" "$TARGET" -- database/migrations | sed 's/^/    /' || true

# A release can carry a one-off data migration that no schema check will catch.
# Missing one is what left every attachment 404ing after the storage change.
say "One-off commands in this release (run these yourself, after the deploy)"
git diff --name-only "$BEFORE" "$TARGET" -- app/Console/Commands | sed 's/^/    new or changed: /' || true
echo "    If any of the above is a data migration, run it once the deploy finishes."

if [ "$ASSUME_YES" -eq 0 ]; then
    read -r -p "
Continue? [y/N] " reply
    [ "$reply" = "y" ] || { echo "Aborted."; exit 1; }
fi

# From here on the deploy is partially applied until the marker is written at
# the end, so say so plainly if any step fails rather than leaving someone to
# infer it from a stack trace.
trap 'echo "
DEPLOY FAILED partway through. The site may be running new code with old caches.
Fix the error and re-run: $0 --force" >&2' ERR

say "Pulling"
git merge --ff-only "origin/$BRANCH"

# Never skipped: a release that adds a PHP dependency fails at runtime without
# it, and this was not part of the manual routine. It also rebuilds the
# optimized classmap — a release that adds a class in a new directory is only
# saved from a fatal by the PSR-4 fallback without this.
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

# Prove the application still boots with the caches that were just written. A
# broken autoloader or a bad cached config fails here, next to the deploy that
# caused it, instead of on the first request from a real user.
say "Smoke check"
sudo -u "$APP_USER" HOME=/tmp php artisan about --only=environment > /dev/null
echo "    application boots."

# Written last, and only on success, so a failed run leaves the previous commit
# recorded and the next run rebuilds rather than believing itself finished.
printf '%s\n' "$TARGET" > "$STATE_FILE"
chown "$APP_USER":"$APP_USER" "$STATE_FILE"
trap - ERR

say "Done — now at $(git log -1 --format='%h %s')"
echo "    Scheduler:    crontab -u $APP_USER -l"
echo "    Queue worker: systemctl status wmt-queue"
