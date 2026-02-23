#!/usr/bin/env bash
# =============================================================================
# MindLog Docs Agent
# Reads source files and uses the Anthropic API (Claude) to regenerate
# specific sections of README.md: Version, Project Status, Tech Stack.
#
# Runs non-interactively — suitable for cron / systemd timer.
#
# Requirements:
#   ANTHROPIC_API_KEY  — set in .env or exported in the environment
#   curl, python3, git
#
# Usage:
#   bash scripts/docs-agent.sh
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
LOG_FILE="${LOG_DIR}/docs-agent.log"
STAMP="[$(date -u '+%Y-%m-%d %H:%M:%S UTC')]"

mkdir -p "$LOG_DIR"

# Redirect all output to log file (also to stdout if running interactively)
if [[ -t 1 ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
else
  exec >> "$LOG_FILE" 2>&1
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "${STAMP}  docs-agent: starting"
echo "══════════════════════════════════════════════════════════"

# ── 1. Load ANTHROPIC_API_KEY from .env if not already in environment ─────────
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  ENV_FILE="${REPO_ROOT}/.env"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' "$ENV_FILE" | grep 'ANTHROPIC_API_KEY' | xargs) 2>/dev/null || true
  fi
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "${STAMP}  ERROR: ANTHROPIC_API_KEY not set. Set it in .env or export it."
  echo "${STAMP}  docs-agent: aborted"
  exit 1
fi

# ── 2. Check dependencies ─────────────────────────────────────────────────────
for dep in curl python3 git; do
  if ! command -v "$dep" &>/dev/null; then
    echo "${STAMP}  ERROR: required command not found: ${dep}"
    exit 1
  fi
done

# ── 3. Collect context from the codebase ─────────────────────────────────────
echo "${STAMP}  Collecting codebase context..."

# Current README
CURRENT_README="$(cat "${REPO_ROOT}/README.md" 2>/dev/null || echo '')"

# Recent git log (last 30 commits, compact)
GIT_LOG="$(git -C "$REPO_ROOT" log --oneline -30 2>/dev/null || echo 'no git history')"

# Current date
CURRENT_DATE="$(date '+%B %Y')"

# Package versions from key package.json files
root_version="$(python3 -c "
import json, sys
try:
  d = json.load(open('${REPO_ROOT}/package.json'))
  print(d.get('version', 'unknown'))
except Exception as e:
  print('unknown')
")"

api_node_ver="$(node --version 2>/dev/null | sed 's/v//' || echo 'unknown')"

mobile_sdk_ver="$(python3 -c "
import json, sys
try:
  d = json.load(open('${REPO_ROOT}/apps/mobile/package.json'))
  deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
  print(deps.get('expo', 'unknown').lstrip('^~'))
except Exception:
  print('unknown')
")"

react_ver="$(python3 -c "
import json, sys
try:
  d = json.load(open('${REPO_ROOT}/apps/web/package.json'))
  deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
  print(deps.get('react', 'unknown').lstrip('^~'))
except Exception:
  print('unknown')
")"

fastify_ver="$(python3 -c "
import json, sys
try:
  d = json.load(open('${REPO_ROOT}/apps/api/package.json'))
  deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
  print(deps.get('fastify', 'unknown').lstrip('^~'))
except Exception:
  print('unknown')
")"

# API route modules
ROUTE_MODULES="$(find "${REPO_ROOT}/apps/api/src/routes" -name 'index.ts' 2>/dev/null \
  | sed "s|${REPO_ROOT}/apps/api/src/routes/||" \
  | sed 's|/index.ts||' \
  | sort | tr '\n' ', ' | sed 's/, $//')"

# DB migrations
MIGRATIONS="$(find "${REPO_ROOT}/packages/db/migrations" -name '*.sql' 2>/dev/null \
  | sort | xargs -I{} basename {} | tr '\n' '  ' || echo 'none found')"
MIGRATION_COUNT="$(find "${REPO_ROOT}/packages/db/migrations" -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')"

# Mobile app version from app.json
APP_VERSION="$(python3 -c "
import json, sys
try:
  d = json.load(open('${REPO_ROOT}/apps/mobile/app.json'))
  print(d.get('expo', {}).get('version', 'unknown'))
except Exception:
  print('unknown')
")"

echo "${STAMP}  Context collected:"
echo "  repo version=${root_version}  app=${APP_VERSION}  expo=${mobile_sdk_ver}  react=${react_ver}  fastify=${fastify_ver}"
echo "  route modules: ${ROUTE_MODULES}"
echo "  migrations: ${MIGRATION_COUNT} files"

# ── 4. Build the API prompt ───────────────────────────────────────────────────
# Use Python to safely build JSON (avoids shell quoting nightmares with nested quotes)
PAYLOAD="$(python3 - <<PYEOF
import json, sys

current_readme = ${CURRENT_README@Q}
current_date   = ${CURRENT_DATE@Q}
root_version   = ${root_version@Q}
app_version    = ${APP_VERSION@Q}
mobile_sdk_ver = ${mobile_sdk_ver@Q}
react_ver      = ${react_ver@Q}
fastify_ver    = ${fastify_ver@Q}
api_node_ver   = ${api_node_ver@Q}
route_modules  = ${ROUTE_MODULES@Q}
migrations     = ${MIGRATIONS@Q}
migration_count= ${MIGRATION_COUNT@Q}
git_log        = ${GIT_LOG@Q}

system_prompt = (
    "You are a technical documentation agent for the MindLog clinical mental health platform. "
    "You update specific sections of README.md based on current source code data. "
    "You MUST return ONLY the complete updated README.md content — no commentary, "
    "no markdown fences, no explanation. Just the raw file content."
)

user_prompt = f"""Update the following README.md for the MindLog project.

CURRENT DATE: {current_date}
REPO VERSION (package.json): {root_version}
MOBILE APP VERSION (app.json): {app_version}

CURRENT PACKAGE VERSIONS (from package.json files):
  Expo SDK:  {mobile_sdk_ver}
  React:     {react_ver}
  Fastify:   {fastify_ver}
  Node.js:   {api_node_ver}

API ROUTE MODULES (each is a Fastify plugin):
  {route_modules}

DATABASE MIGRATIONS ({migration_count} total):
  {migrations}

RECENT GIT LOG (last 30 commits):
{git_log}

INSTRUCTIONS — update ONLY these sections, leave everything else unchanged:
1. The version line near the top (e.g. "**Version:** x.y (Month Year)") — update to the
   app version from app.json and the current month/year.
2. The "### Project Status" or "## Project Status" section — update the phase checklist
   to accurately reflect completed work based on the git log and route module list.
   Add ✅ for things clearly implemented, keep 🔄 or ⏳ for in-progress/planned items.
3. The "| Tech Stack |" table — update version numbers to match the package data above.
4. The "### Backend API" feature list or API section — update to mention the correct number
   of route modules and list their names.
5. The monorepo migration count — if a number like "8 migrations" appears, update it to {migration_count}.

Do NOT change: Quick Start commands, architecture diagram, Demo Credentials, Design Wireframes
section, Compliance section, Documentation links, or the License section.

CURRENT README.md:
---
{current_readme}
---

Return the complete updated README.md now:"""

payload = {{
    "model": "claude-sonnet-4-6",
    "max_tokens": 8192,
    "system": system_prompt,
    "messages": [
        {{"role": "user", "content": user_prompt}}
    ]
}}

print(json.dumps(payload))
PYEOF
)"

# ── 5. Call the Anthropic API ─────────────────────────────────────────────────
echo "${STAMP}  Calling Anthropic API (claude-sonnet-4-6)..."

HTTP_RESPONSE="$(curl -s -w "\n__HTTP_STATUS__%{http_code}" \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  --data-binary "$PAYLOAD" \
  --max-time 120)"

HTTP_BODY="${HTTP_RESPONSE%$'\n__HTTP_STATUS__'*}"
HTTP_STATUS="${HTTP_RESPONSE##*__HTTP_STATUS__}"

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "${STAMP}  ERROR: Anthropic API returned HTTP ${HTTP_STATUS}"
  echo "$HTTP_BODY" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print('  API error:', d.get('error',{}).get('message', d))
except Exception:
  print(sys.stdin.read())
" 2>/dev/null || true
  echo "${STAMP}  docs-agent: failed"
  exit 1
fi

# ── 6. Extract the updated README content ─────────────────────────────────────
NEW_README="$(echo "$HTTP_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
text = data['content'][0]['text']
# Strip accidental markdown code fences if the model added them
lines = text.split('\n')
if lines and lines[0].startswith('\`\`\`'):
    lines = lines[1:]
if lines and lines[-1].strip() == '\`\`\`':
    lines = lines[:-1]
print('\n'.join(lines))
")"

if [[ -z "$NEW_README" ]]; then
  echo "${STAMP}  ERROR: received empty response from API"
  echo "${STAMP}  docs-agent: failed"
  exit 1
fi

# ── 7. Atomic write (temp file → mv) ─────────────────────────────────────────
TMP_FILE="$(mktemp "${REPO_ROOT}/README.md.XXXXXX")"
echo "$NEW_README" > "$TMP_FILE"
mv "$TMP_FILE" "${REPO_ROOT}/README.md"

echo "${STAMP}  README.md updated successfully ($(wc -l < "${REPO_ROOT}/README.md") lines)"

# ── 8. Optionally commit the change ───────────────────────────────────────────
if git -C "$REPO_ROOT" diff --quiet HEAD -- README.md 2>/dev/null; then
  echo "${STAMP}  No changes to commit (README.md unchanged)"
else
  git -C "$REPO_ROOT" add README.md
  git -C "$REPO_ROOT" commit -m "docs: auto-update README from docs-agent [skip ci]" \
    --author="MindLog Docs Agent <docs-agent@mindlog.local>" \
    --no-verify 2>/dev/null || true
  echo "${STAMP}  Committed README.md update to git"
fi

echo "${STAMP}  docs-agent: complete"
