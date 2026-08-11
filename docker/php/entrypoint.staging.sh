#!/bin/sh
#
# Caches are built at container start, not at image build, because they bake in
# configuration that only exists once .env is mounted.
#
# Migrations are deliberately NOT run here: app, queue, scheduler and any other
# container share this image and would race on every start. The deploy script
# runs them once, explicitly.
set -e

php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

exec "$@"
