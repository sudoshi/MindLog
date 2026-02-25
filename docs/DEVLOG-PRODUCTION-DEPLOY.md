# Developer Log: Production Deployment to Apache2

**Date:** 2026-02-24
**Version:** MindLog v1.1
**Author:** Claude Code (Opus 4.6)
**Status:** Complete — live at https://mindlog.acumenus.net

---

## 1. Objective

Deploy MindLog to a production environment at `https://mindlog.acumenus.net` served through the existing Apache2 installation, with Let's Encrypt SSL, systemd-managed services, and automated near-real-time redeployment — all running **concurrently** alongside the development servers on localhost.

---

## 2. Architecture Overview

```
Internet
  │
  ▼
Apache2 (:443 SSL)  ─── mindlog.acumenus.net
  │
  ├── /                → Static files from apps/web/dist/ (Vite production build)
  ├── /api/*           → Reverse proxy → localhost:3080 (Fastify production API)
  ├── /api/v1/ws       → WebSocket proxy → ws://localhost:3080 (real-time alerts)
  └── /health          → Reverse proxy → localhost:3080 (liveness check)


Dev (unchanged, localhost only):
  API    → localhost:3000  (tsx --watch, hot reload)
  Web    → localhost:5173  (Vite HMR)
  Worker → npm run dev:worker
```

### Port Allocation

| Service       | Dev Port | Prod Port | Notes                          |
|---------------|----------|-----------|--------------------------------|
| API           | 3000     | 3080      | Separate .env files            |
| Web           | 5173     | N/A       | Apache serves static dist/     |
| Worker        | N/A      | N/A       | No port — BullMQ/Redis         |
| PostgreSQL    | 5432     | 5432      | Shared (same database)         |
| Redis         | 6379     | 6379      | Shared (same instance)         |
| Apache HTTP   | —        | 80        | Redirects to 443               |
| Apache HTTPS  | —        | 443       | Serves mindlog.acumenus.net    |

---

## 3. Implementation Steps

### 3.1 DNS Configuration

An A record for `mindlog.acumenus.net` was pointed to the server's public IP (`50.32.71.185`). Verified via `dig`:

```
mindlog.acumenus.net.   300   IN   A   50.32.71.185
```

### 3.2 Apache2 Proxy Modules

Enabled the required reverse proxy modules:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo systemctl restart apache2
```

### 3.3 Production Environment File

Created `.env.production` at the repository root. Key differences from `.env` (development):

| Variable       | Development              | Production                            |
|----------------|--------------------------|---------------------------------------|
| `NODE_ENV`     | `development`            | `production`                          |
| `API_PORT`     | `3000`                   | `3080`                                |
| `API_HOST`     | `0.0.0.0`               | `127.0.0.1`                           |
| `CORS_ORIGIN`  | `http://localhost:5173`  | `https://mindlog.acumenus.net`        |

All other variables (database, Redis, Supabase, AI, email) are shared between environments since both connect to the same backing services.

### 3.4 Build Production Artifacts

```bash
npm run build    # Turbo: packages/shared → packages/db → apps/api → apps/web
```

- **Web output:** `apps/web/dist/` — static HTML, CSS, JS bundle
- **API output:** `apps/api/dist/` — compiled Node.js JavaScript
- **Build time:** ~4.7 seconds (Turbo cached)

**Build fix required:** `packages/db/src/live-simulation.ts` had two TypeScript `noUncheckedIndexedAccess` errors on array index access. Fixed with non-null assertions (`!`) on lines 626 and 641.

### 3.5 Apache Virtual Host Configuration

Two config files were created — HTTP (redirect) and HTTPS (full config):

**`/etc/apache2/sites-available/mindlog.acumenus.net.conf`** — HTTP redirect:

```apache
<VirtualHost *:80>
    ServerName mindlog.acumenus.net
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

**`/etc/apache2/sites-available/mindlog.acumenus.net-le-ssl.conf`** — HTTPS vhost:

```apache
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName mindlog.acumenus.net

    # SSL
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/mindlog.acumenus.net/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/mindlog.acumenus.net/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf

    # Static web dashboard
    DocumentRoot /home/smudoshi/Github/MindLog/apps/web/dist
    <Directory /home/smudoshi/Github/MindLog/apps/web/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        FallbackResource /index.html      # SPA client-side routing
    </Directory>

    # WebSocket proxy (must precede /api)
    ProxyPreserveHost On
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/api/v1/ws$ ws://127.0.0.1:3080/api/v1/ws [P,L]

    # API proxy
    ProxyPass /api/ http://127.0.0.1:3080/api/
    ProxyPassReverse /api/ http://127.0.0.1:3080/api/
    ProxyPass /health http://127.0.0.1:3080/health
    ProxyPassReverse /health http://127.0.0.1:3080/health

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/mindlog-error.log
    CustomLog ${APACHE_LOG_DIR}/mindlog-access.log combined
</VirtualHost>
</IfModule>
```

**Key design decisions:**

- **`FallbackResource /index.html`** — enables React Router client-side navigation without 404s on deep links
- **WebSocket `RewriteRule` before `ProxyPass`** — Apache processes rewrite rules first; if the WebSocket rule is placed after ProxyPass for `/api/`, the HTTP proxy catches the request before the upgrade can happen
- **`ProxyPreserveHost On`** — forwards the original `Host` header to Fastify so CORS checks work correctly
- **`API_HOST=127.0.0.1`** — production API binds only to loopback; all external traffic goes through Apache

### 3.6 SSL Certificate

Certbot was used to obtain a Let's Encrypt certificate:

```bash
sudo certbot --apache -d mindlog.acumenus.net --non-interactive --agree-tos
```

**Issue encountered:** The existing `demo.acumenus.net` config had `ServerAlias *`, acting as a catch-all for all hostnames. Certbot deployed the mindlog cert into the demo SSL config instead of creating a new one. This was resolved by:

1. Removing `ServerAlias *` from both demo vhost configs
2. Creating a dedicated `mindlog.acumenus.net-le-ssl.conf` with the full proxy/static config
3. Restoring `demo.acumenus.net-le-ssl.conf` to reference only its own cert

Certificate auto-renews via certbot's systemd timer. Expires 2026-05-26.

### 3.7 Systemd Service Units

Three systemd services manage the production deployment:

**`mindlog-api.service`** — Fastify API server:

```ini
[Service]
User=smudoshi
WorkingDirectory=/home/smudoshi/Github/MindLog/apps/api
EnvironmentFile=/home/smudoshi/Github/MindLog/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/smudoshi/Github/MindLog
```

**`mindlog-worker.service`** — BullMQ background worker:

```ini
[Service]
# Same as API but runs worker.js
ExecStart=/usr/bin/node dist/worker.js
After=mindlog-api.service    # Starts after API
```

**`mindlog-auto-deploy.service`** — Automated rebuild daemon:

```ini
[Service]
User=root                    # Needs root for systemctl restart
ExecStart=/home/smudoshi/Github/MindLog/scripts/auto-deploy.sh
Environment=HOME=/home/smudoshi
```

All three are enabled for auto-start on boot:

```bash
sudo systemctl enable mindlog-api mindlog-worker mindlog-auto-deploy
```

**Security hardening applied:**

- `NoNewPrivileges=true` — prevents privilege escalation from the Node.js process
- `ProtectSystem=strict` — mounts the filesystem read-only except for explicitly allowed paths
- `ReadWritePaths=/home/smudoshi/Github/MindLog` — only the repo directory is writable
- API binds to `127.0.0.1` only — not directly accessible from the network

### 3.8 Directory Permissions Fix

Apache runs as the `www-data` user and needed filesystem traversal permission to reach `apps/web/dist/`. The home directory `/home/smudoshi` had mode `drwxr-x---` (no world-execute), causing a 403 Forbidden. Fixed with:

```bash
sudo chmod o+x /home/smudoshi
```

This grants only traversal (execute) permission — file listing and reading of the home directory itself remain restricted.

---

## 4. Auto-Deploy Daemon

### Problem

After each code change, a manual `npm run build` + service restart was required to update the production site. This creates friction during active development.

### Solution

A lightweight polling daemon (`scripts/auto-deploy.sh`) that checks for source file changes every 60 seconds and automatically rebuilds + restarts when modifications are detected.

### How It Works

```
┌─────────────────────────────────────────────────────┐
│  auto-deploy.sh (runs as root via systemd)          │
│                                                     │
│  1. Every 60s, run `find` on source directories     │
│     looking for files newer than the last deploy     │
│                                                     │
│  2. If changes found:                               │
│     a. Acquire lock file (prevent concurrent runs)  │
│     b. `sudo -u smudoshi npm run build`             │
│     c. If build succeeds:                           │
│        - `systemctl restart mindlog-api worker`     │
│        - Touch timestamp marker                     │
│     d. If build fails:                              │
│        - Log error, do NOT restart services         │
│     e. Release lock file                            │
│                                                     │
│  3. If no changes: sleep, check again               │
└─────────────────────────────────────────────────────┘
```

### Watched Paths

| Directory              | Contents                        |
|------------------------|---------------------------------|
| `apps/api/src/`        | Fastify routes, services, middleware |
| `apps/web/src/`        | React components, pages, styles |
| `packages/shared/src/` | Zod schemas, types, constants   |
| `packages/db/src/`     | Database client, queries        |

### File Types

`.ts`, `.tsx`, `.css`, `.html`

### Safety Mechanisms

- **Change detection:** Uses `find -newer` against a timestamp file — only triggers when files are actually modified, not on every 60s tick
- **Lock file:** `/tmp/.mindlog-deploy.lock` prevents overlapping builds if one takes longer than 60 seconds
- **Build-gated restarts:** Services are only restarted after a successful build; failed builds leave production running on the last good version
- **User separation:** Build runs as `smudoshi` (via `sudo -u smudoshi`) to avoid root-owned files in the repo; only `systemctl restart` runs as root

### Monitoring

```bash
# Follow auto-deploy logs in real time
journalctl -u mindlog-auto-deploy -f

# Check last few deploys
journalctl -u mindlog-auto-deploy --since "1 hour ago"

# Temporarily stop auto-deploy
sudo systemctl stop mindlog-auto-deploy

# Permanently disable
sudo systemctl disable mindlog-auto-deploy
```

---

## 5. Manual Deploy Script

For immediate deployments (bypassing the 60-second poll), use:

```bash
./scripts/deploy-production.sh
```

This script:
1. Runs `npm run build` (all workspaces via Turbo)
2. Restarts `mindlog-api` and `mindlog-worker` via systemd
3. Waits 2 seconds, then verifies service status + health check
4. Reports success or failure with diagnostic hints

---

## 6. Files Created / Modified

### New Files

| File | Purpose |
|------|---------|
| `.env.production` | Production environment variables (port 3080, CORS, NODE_ENV) |
| `scripts/deploy-production.sh` | Manual rebuild + restart script |
| `scripts/auto-deploy.sh` | Automated change-detection + rebuild daemon |
| `/etc/apache2/sites-available/mindlog.acumenus.net.conf` | HTTP → HTTPS redirect |
| `/etc/apache2/sites-available/mindlog.acumenus.net-le-ssl.conf` | Full HTTPS vhost with proxy + static serving |
| `/etc/systemd/system/mindlog-api.service` | Production API systemd unit |
| `/etc/systemd/system/mindlog-worker.service` | Production worker systemd unit |
| `/etc/systemd/system/mindlog-auto-deploy.service` | Auto-deploy daemon systemd unit |

### Modified Files

| File | Change |
|------|--------|
| `packages/db/src/live-simulation.ts` | Added `!` non-null assertions on lines 626, 641 (TS build fix) |
| `/etc/apache2/sites-available/demo.acumenus.net.conf` | Removed `ServerAlias *` wildcard |
| `/etc/apache2/sites-available/demo.acumenus.net-le-ssl.conf` | Removed `ServerAlias *`, restored original cert paths |
| `/home/smudoshi` (directory) | Added `o+x` permission for Apache traversal |

---

## 7. Verification Results

All checks passed on 2026-02-24 at 21:52 EST:

| Test | Result |
|------|--------|
| `curl https://mindlog.acumenus.net/health` | `{"status":"ok","db":"connected"}` |
| `curl https://mindlog.acumenus.net/` | 200 — HTML loads |
| `systemctl is-active mindlog-api` | `active` |
| `systemctl is-active mindlog-worker` | `active` |
| `systemctl is-active mindlog-auto-deploy` | `active` |
| `curl https://demo.acumenus.net/` | 200 — existing site unaffected |

---

## 8. Troubleshooting Reference

### Service logs

```bash
journalctl -u mindlog-api -n 50           # API logs
journalctl -u mindlog-worker -n 50        # Worker logs
journalctl -u mindlog-auto-deploy -n 50   # Auto-deploy logs
```

### Apache logs

```bash
sudo tail -50 /var/log/apache2/mindlog-error.log
sudo tail -50 /var/log/apache2/mindlog-access.log
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 403 Forbidden on web | Home directory permissions | `sudo chmod o+x /home/smudoshi` |
| 502 Bad Gateway on `/api/` | API not running on port 3080 | `sudo systemctl restart mindlog-api` |
| SSL errors | Cert not found or expired | `sudo certbot renew` |
| Auto-deploy not triggering | Timestamp file newer than changes | `rm /tmp/.mindlog-last-deploy-hash` |
| Build stuck / lock held | Stale lock from killed build | `rm /tmp/.mindlog-deploy.lock` |
| WebSocket not connecting | Proxy module missing | `sudo a2enmod proxy_wstunnel && sudo systemctl restart apache2` |

---

## 9. Future Considerations

- **Separate database:** Production currently shares `mindlogdemo` with dev. For a true production environment, a dedicated database with its own credentials should be provisioned.
- **Log rotation:** Apache logs are managed by `logrotate`; systemd journal is managed by `journald`. Both have sensible defaults but may need tuning under high traffic.
- **Health check monitoring:** Consider adding an external uptime monitor (e.g., UptimeRobot) for `https://mindlog.acumenus.net/health`.
- **Zero-downtime deploys:** The current approach has a brief restart window (~2 seconds). For zero-downtime, a rolling restart with multiple API instances behind a load balancer would be needed.
- **Git-based triggers:** The auto-deploy currently watches file modification times. An alternative would be a post-receive Git hook or GitHub webhook that triggers builds only on commits.
