#!/usr/bin/env bash
# =============================================================================
# MindLog Docs Agent — Systemd Timer Installer
#
# Installs a systemd USER timer that runs docs-agent.sh every hour on the hour.
# No root / sudo required — uses ~/.config/systemd/user/.
#
# Usage:
#   bash scripts/install-docs-timer.sh [--uninstall]
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SCRIPT="${REPO_ROOT}/scripts/docs-agent.sh"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SERVICE_NAME="mindlog-docs-agent"

# ── Uninstall path ────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Stopping and removing ${SERVICE_NAME} timer..."
  systemctl --user stop  "${SERVICE_NAME}.timer"  2>/dev/null || true
  systemctl --user disable "${SERVICE_NAME}.timer" 2>/dev/null || true
  rm -f "${SYSTEMD_USER_DIR}/${SERVICE_NAME}.service"
  rm -f "${SYSTEMD_USER_DIR}/${SERVICE_NAME}.timer"
  systemctl --user daemon-reload
  echo "Done. Timer removed."
  exit 0
fi

# ── Checks ─────────────────────────────────────────────────────────────────────
if [[ ! -f "$AGENT_SCRIPT" ]]; then
  echo "ERROR: docs-agent.sh not found at ${AGENT_SCRIPT}"
  exit 1
fi
chmod +x "$AGENT_SCRIPT"

# Check ANTHROPIC_API_KEY is configured
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if ! grep -q 'ANTHROPIC_API_KEY=.' "${REPO_ROOT}/.env" 2>/dev/null; then
    echo "WARNING: ANTHROPIC_API_KEY not found in .env"
    echo "  Set it before the timer fires:  echo 'ANTHROPIC_API_KEY=sk-ant-...' >> ${REPO_ROOT}/.env"
  fi
fi

# ── Write systemd unit files ───────────────────────────────────────────────────
mkdir -p "$SYSTEMD_USER_DIR"

cat > "${SYSTEMD_USER_DIR}/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=MindLog Docs Agent — regenerate README.md from source
After=network-online.target

[Service]
Type=oneshot
ExecStart=${AGENT_SCRIPT}
WorkingDirectory=${REPO_ROOT}
StandardOutput=append:${REPO_ROOT}/logs/docs-agent.log
StandardError=append:${REPO_ROOT}/logs/docs-agent.log

# Restart on failure, up to 3 times with 60s delay
Restart=on-failure
RestartSec=60
StartLimitIntervalSec=300
StartLimitBurst=3
SERVICE

cat > "${SYSTEMD_USER_DIR}/${SERVICE_NAME}.timer" <<TIMER
[Unit]
Description=MindLog Docs Agent — run every hour on the hour

[Timer]
# Fire at the start of every hour (:00)
OnCalendar=hourly
# If the system was off at the scheduled time, run immediately on next boot
Persistent=true
# Randomise by up to 60 s to avoid thundering-herd if many timers are at :00
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
TIMER

# ── Enable and start ───────────────────────────────────────────────────────────
systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}.timer"

echo ""
echo "✓  Timer installed and active."
echo ""
systemctl --user list-timers "${SERVICE_NAME}.timer" --no-pager
echo ""
echo "Useful commands:"
echo "  Check timer status:  systemctl --user status ${SERVICE_NAME}.timer"
echo "  Run agent now:       systemctl --user start ${SERVICE_NAME}.service"
echo "  Watch live log:      tail -f ${REPO_ROOT}/logs/docs-agent.log"
echo "  Remove timer:        bash scripts/install-docs-timer.sh --uninstall"
