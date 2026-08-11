# WMT Staging — wmt-dev.bfcgroup.ph

Staging runs on the internal VM **10.10.0.101** (`ubuntu2204c`), as its own
Docker Compose stack (`docker-compose.staging.yml`), reached over the host's
**shared Cloudflare Tunnel**. It sits alongside the other apps already on that
box (purchasing-system, snipe-it) and does not touch them.

```
browser ──https──> Cloudflare edge ──tunnel──> cloudflared (systemd, on the VM)
                                                     └─http─> 127.0.0.1:9081 (WMT nginx)
                                                                    └─> php-fpm ─> mysql / redis / soketi
```

Nothing is published on the LAN. nginx binds `127.0.0.1:9081` only; cloudflared
reaches it on the loopback. Ports 8000 (snipe) and 9080 (purchasing) were
already taken, so WMT uses **9081**.

## Stack

| Service   | Image                    | Role                                  |
|-----------|--------------------------|---------------------------------------|
| app       | `wmt/php:staging` (built)| php-fpm 8.4; code + assets baked in   |
| nginx     | nginx:1.27-alpine        | web front, `127.0.0.1:9081`           |
| assets    | (same built image)       | copies `public/` into the shared vol  |
| mysql     | mysql:8.0                | database (named volume `mysqldata`)   |
| redis     | redis:7-alpine           | cache / session / queue               |
| queue     | (same built image)       | `queue:work`                          |
| scheduler | (same built image)       | `schedule:work`                       |
| soketi    | soketi (Pusher protocol) | websockets, proxied at `/app/`        |

## First-time setup on the VM

```bash
cd ~/wmt                       # the staging checkout (git clone of dev-v3)
cp .env.staging.example .env   # then fill in every REPLACE_ME
./deploy-staging.sh            # builds, migrates, seeds, brings it up
```

`deploy-staging.sh` generates `APP_KEY` if blank, refuses to run while any
`REPLACE_ME` remains, and runs migrations exactly once (never in the container
entrypoint, which several services share).

The seeders create roles, the org structure and settings but **no login user**.
After the first deploy, create a staging admin (the deploy script prints this):

```bash
docker compose -f docker-compose.staging.yml exec -T -e HOME=/tmp app \
  php artisan tinker --execute='$p=Hash::make("CHANGE-ME"); $u=App\Models\User::firstOrCreate(["email"=>"admin@wmt-dev.bfcgroup.ph"],["name"=>"Staging Admin","is_active"=>true,"password"=>$p]); $u->syncRoles(["admin"]);'
```

`HOME=/tmp` is required for any `tinker`/`artisan` command that boots psysh —
the `www-data` user has no home directory to write psysh's config into.

## The one manual step — the tunnel route (needs sudo + Cloudflare)

1. **Cloudflared ingress** — edit `/etc/cloudflared/config.yml` and add this
   above the final `- service: http_status:404`:

   ```yaml
     - hostname: wmt-dev.bfcgroup.ph
       service: http://127.0.0.1:9081
   ```

   then `sudo systemctl restart cloudflared`.

2. **Cloudflare DNS** — in the Cloudflare dashboard for `bfcgroup.ph`, add a
   CNAME `wmt-dev` → `<tunnel-id>.cfargotunnel.com` (proxied), matching how
   `purchasing` / `snipe` are wired.

## Everyday use

```bash
./deploy-staging.sh                                             # redeploy a change
docker compose -f docker-compose.staging.yml logs -f app       # tail logs
docker compose -f docker-compose.staging.yml exec app php artisan ...   # console
docker compose -f docker-compose.staging.yml down              # stop (keeps volumes/data)
```

## Notes

- **APP_DEBUG=false** so staging exercises the real error handling (friendly
  message + reference, per the app's error mechanism). Flip to `true` in `.env`
  and redeploy if you need stack traces while debugging.
- **Mail is `log`** — staging sends no real email; check `storage/logs`.
- **Turnstile is off** so test logins are not gated by a captcha.
- **Backups (Google Drive) are off** — that is a production concern.
- Changing `PUBLIC_HOSTNAME` or the Pusher key means a **rebuild** (they are
  compiled into the JS bundle), not just an `.env` edit.
