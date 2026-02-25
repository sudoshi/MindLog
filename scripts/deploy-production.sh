#!/usr/bin/env bash
# MindLog Production Deploy Script
# Rebuilds all artifacts and restarts the production services.
# Dev servers on :3000/:5173 are NOT affected.
#
# Usage: ./scripts/deploy-production.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== MindLog Production Deploy ==="
echo "Repository: $REPO_ROOT"
echo ""

# Step 1: Build
echo "[1/3] Building all workspaces..."
npm run build
echo "    Build complete."
echo ""

# Step 2: Restart services
echo "[2/3] Restarting production services..."
sudo systemctl restart mindlog-api mindlog-worker
echo "    Services restarted."
echo ""

# Step 3: Verify
echo "[3/3] Verifying..."
sleep 2

API_STATUS=$(systemctl is-active mindlog-api 2>/dev/null || true)
WORKER_STATUS=$(systemctl is-active mindlog-worker 2>/dev/null || true)

echo "    mindlog-api:    $API_STATUS"
echo "    mindlog-worker: $WORKER_STATUS"

# Health check
HEALTH=$(curl -sf http://127.0.0.1:3080/health 2>/dev/null || echo '{"status":"unreachable"}')
echo "    Health check:   $HEALTH"
echo ""

if [ "$API_STATUS" = "active" ] && [ "$WORKER_STATUS" = "active" ]; then
    echo "Deploy successful! Site: https://mindlog.acumenus.net"
else
    echo "WARNING: One or more services are not active. Check: journalctl -u mindlog-api -n 50"
    exit 1
fi
