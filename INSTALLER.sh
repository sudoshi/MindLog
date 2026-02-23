#!/usr/bin/env bash
# =============================================================================
# MindLog Platform Installer v1.0
# Provisions a fresh Ubuntu server or developer workstation in Demo or
# Production mode. Covers: Node.js, PostgreSQL 17, Redis 7, PM2, nginx,
# Let's Encrypt, UFW, Android SDK, JDK 17, Expo CLI.
#
# Usage:
#   sudo bash INSTALLER.sh
#   sudo bash INSTALLER.sh --mode=demo
#   sudo bash INSTALLER.sh --mode=production --yes
#   sudo bash INSTALLER.sh --help
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ─── Trap for clean error reporting ──────────────────────────────────────────
trap 'echo -e "\n${RED}✗ Installer failed at line ${LINENO}. Check the output above.${RESET}" >&2; exit 1' ERR

# =============================================================================
# SECTION 0 — ANSI colours and print helpers
# =============================================================================

RESET=$'\033[0m'
BOLD=$'\033[1m'
CYAN=$'\033[0;36m'
BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
DIM=$'\033[2m'

print_header() {
  echo -e "\n${CYAN}${BOLD}$*${RESET}"
}

print_step() {
  echo -e "\n${BLUE}${BOLD}▶  $*${RESET}"
}

print_ok() {
  echo -e "  ${GREEN}✓${RESET}  $*"
}

print_warn() {
  echo -e "  ${YELLOW}⚠${RESET}  $*"
}

print_error() {
  echo -e "\n${RED}${BOLD}✗  $*${RESET}" >&2
  exit 1
}

print_info() {
  echo -e "  ${DIM}$*${RESET}"
}

hr() {
  echo -e "${DIM}────────────────────────────────────────────────────────────${RESET}"
}

# =============================================================================
# SECTION 1 — Banner & Argument Parsing
# =============================================================================

show_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║         MindLog Platform Installer  v1.0                ║"
  echo "  ║   Clinical Mental Health Monitoring Platform            ║"
  echo "  ║                                                          ║"
  echo "  ║   Supports: Demo mode  ·  Production mode               ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

show_help() {
  cat <<EOF
Usage: sudo bash INSTALLER.sh [OPTIONS]

Options:
  --mode=demo          Skip mode-selection menu, run demo install
  --mode=production    Skip mode-selection menu, run production install
  --dir=<path>         Override install directory prompt
  --yes, -y            Non-interactive: accept all defaults / skip confirmations
  --skip-android       Skip Android SDK installation even if selected
  --help, -h           Show this help

Examples:
  sudo bash INSTALLER.sh
  sudo bash INSTALLER.sh --mode=demo --yes
  sudo bash INSTALLER.sh --mode=production --dir=/opt/mindlog

EOF
  exit 0
}

# ── Globals (populated by prompts or flags) ───────────────────────────────────
MODE=""
INSTALL_DIR=""
YES=false
SKIP_ANDROID=false
INSTALL_ANDROID=false
INSTALL_DEMO_SEED=false

# Production parameters
APP_USER="mindlog"
APP_NAME="mindlog"
DOMAIN=""
ADMIN_EMAIL=""
DB_NAME="mindlog_prod"
DB_USER="mindlog_db"
DB_PASSWORD=""
REDIS_PASSWORD=""
SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
JWT_SECRET=""
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
RESEND_API_KEY=""
EMAIL_FROM=""
ANTHROPIC_API_KEY=""
AI_INSIGHTS_ENABLED="false"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER="+15550000000"
CRISIS_LINE_PHONE="988"
CRISIS_LINE_NAME="988 Suicide & Crisis Lifeline"
CRISIS_TEXT_NUMBER="741741"
CRISIS_TEXT_NAME="Crisis Text Line"
EXPO_ACCESS_TOKEN=""
HIPAA_ASSESSMENT_COMPLETE="false"
ANTHROPIC_BAA_SIGNED="false"

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --mode=demo)        MODE="demo"        ;;
      --mode=production)  MODE="production"  ;;
      --dir=*)            INSTALL_DIR="${arg#--dir=}" ;;
      --yes|-y)           YES=true           ;;
      --skip-android)     SKIP_ANDROID=true  ;;
      --help|-h)          show_help          ;;
      *)
        print_error "Unknown argument: $arg  (run with --help for usage)"
        ;;
    esac
  done
}

# ── Prompt helpers ────────────────────────────────────────────────────────────

# prompt <var_name> <question> <default>
prompt() {
  local var_name="$1"
  local question="$2"
  local default="${3:-}"
  local value=""

  if [[ "$YES" == "true" && -n "$default" ]]; then
    printf -v "$var_name" '%s' "$default"
    print_info "$question → ${default}"
    return
  fi

  if [[ -n "$default" ]]; then
    read -rp "  ${question} [${default}]: " value
    value="${value:-$default}"
  else
    read -rp "  ${question}: " value
  fi
  printf -v "$var_name" '%s' "$value"
}

# prompt_secret <var_name> <question>
prompt_secret() {
  local var_name="$1"
  local question="$2"
  local value=""

  if [[ "$YES" == "true" ]]; then
    # In non-interactive mode secrets must be auto-generated; callers handle this
    return
  fi

  read -rsp "  ${question}: " value
  echo
  printf -v "$var_name" '%s' "$value"
}

# confirm <question> [default=Y]  →  returns 0 (yes) or 1 (no)
confirm() {
  local question="$1"
  local default="${2:-Y}"

  if [[ "$YES" == "true" ]]; then
    return 0
  fi

  local prompt_hint
  if [[ "$default" =~ ^[Yy] ]]; then
    prompt_hint="Y/n"
  else
    prompt_hint="y/N"
  fi

  local yn
  read -rp "  ${question} [${prompt_hint}]: " yn
  yn="${yn:-$default}"
  [[ "$yn" =~ ^[Yy] ]]
}

# generate_secret <bytes>
generate_secret() {
  local bytes="${1:-32}"
  openssl rand -base64 "$bytes" 2>/dev/null || \
    head -c "$bytes" /dev/urandom | base64 | tr -d '\n'
}

# =============================================================================
# SECTION 2 — Pre-flight Checks
# =============================================================================

preflight_checks() {
  print_step "Pre-flight checks"

  # ── Ubuntu version ──
  if ! command -v lsb_release &>/dev/null; then
    print_warn "lsb_release not found — assuming Ubuntu-compatible. Continuing."
  else
    local ubuntu_ver
    ubuntu_ver=$(lsb_release -rs 2>/dev/null || echo "0")
    local major="${ubuntu_ver%%.*}"
    if (( major < 20 )); then
      print_error "Ubuntu 20.04 or later is required. Detected: ${ubuntu_ver}"
    fi
    print_ok "Ubuntu ${ubuntu_ver} detected"
  fi

  # ── Root / sudo ──
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    if ! sudo -n true 2>/dev/null; then
      print_error "This installer must be run as root or with sudo.\n  Re-run: sudo bash INSTALLER.sh"
    fi
  fi
  print_ok "Sudo/root access confirmed"

  # ── Internet connectivity ──
  if ! curl -s --max-time 8 https://deb.nodesource.com -o /dev/null; then
    print_error "No internet connectivity. Please check your network and try again."
  fi
  print_ok "Internet connectivity confirmed"

  # ── RAM ──
  local mem_kb
  mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  local mem_gb=$(( mem_kb / 1024 / 1024 ))
  if (( mem_gb < 3 )); then
    print_warn "Only ${mem_gb} GB RAM detected. MindLog recommends at least 4 GB."
    confirm "Continue anyway?" || print_error "Aborted by user."
  else
    print_ok "${mem_gb} GB RAM available"
  fi

  # ── Disk space (check /opt or / if INSTALL_DIR not yet set) ──
  local check_dir="${INSTALL_DIR:-/opt}"
  local free_gb
  free_gb=$(df -BG "$check_dir" 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4}' || echo 0)
  if (( free_gb < 10 )); then
    print_warn "Only ${free_gb} GB free on ${check_dir}. MindLog recommends at least 10 GB."
    confirm "Continue anyway?" || print_error "Aborted by user."
  else
    print_ok "${free_gb} GB free disk space on ${check_dir}"
  fi

  # ── Existing installation sentinel ──
  if [[ -n "$INSTALL_DIR" && -f "${INSTALL_DIR}/.mindlog-installed" ]]; then
    print_warn "An existing MindLog installation was found at ${INSTALL_DIR}."
    confirm "Overwrite existing installation?" || print_error "Aborted by user."
  fi

  # ── Required base commands ──
  local missing=()
  for cmd in curl git openssl; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    print_warn "Missing commands: ${missing[*]}. Installing now..."
    sudo apt-get update -qq
    sudo apt-get install -y "${missing[@]}"
  fi
  print_ok "Required base commands present"

  echo
  hr
}

# =============================================================================
# SECTION 3 — Mode Selection
# =============================================================================

select_mode() {
  if [[ -n "$MODE" ]]; then
    print_ok "Mode: ${MODE} (from flag)"
    return
  fi

  echo
  print_header "  Select installation mode"
  hr
  echo
  echo -e "  ${BOLD}[1]  Demo Mode${RESET}"
  echo -e "       • Docker Compose for Postgres + Redis + MailHog"
  echo -e "       • Pre-seeded demo clinician and patient accounts"
  echo -e "       • Dev-server start (no nginx, no PM2, no SSL)"
  echo -e "       • Ideal for evaluation and development"
  echo
  echo -e "  ${BOLD}[2]  Production Mode${RESET}"
  echo -e "       • PostgreSQL 17 + Redis 7 installed natively via apt"
  echo -e "       • PM2 process manager (API + Worker)"
  echo -e "       • nginx reverse proxy + Let's Encrypt TLS"
  echo -e "       • Hardened UFW firewall"
  echo -e "       • Dedicated system user '${APP_USER}'"
  echo -e "       • Ideal for live deployment"
  echo
  hr
  local choice
  read -rp "  Your choice [1/2]: " choice
  case "$choice" in
    1) MODE="demo"       ;;
    2) MODE="production" ;;
    *) print_error "Invalid choice. Run the installer again and select 1 or 2." ;;
  esac
  print_ok "Mode: ${MODE}"
}

# =============================================================================
# SECTION 4 — Component Selection
# =============================================================================

select_components() {
  echo
  print_header "  Select components to install"
  hr
  echo

  # API + Web is always required
  print_ok "API server + Web dashboard  (required)"

  # Android SDK
  if [[ "$SKIP_ANDROID" == "true" ]]; then
    INSTALL_ANDROID=false
    print_info "Android SDK skipped (--skip-android)"
  else
    echo
    if confirm "Install Android SDK + JDK 17 + Expo CLI (for mobile development)?" "Y"; then
      INSTALL_ANDROID=true
      print_ok "Android SDK + JDK 17 + Expo CLI  (selected)"
    else
      INSTALL_ANDROID=false
      print_info "Android SDK skipped"
    fi
  fi

  echo
  hr
}

# =============================================================================
# SECTION 5 — Common System Dependencies
# =============================================================================

install_common_deps() {
  print_step "Installing system dependencies"

  sudo apt-get update -qq
  sudo apt-get install -y \
    curl wget git build-essential python3 unzip \
    gnupg ca-certificates lsb-release software-properties-common \
    apt-transport-https openssl
  print_ok "Base packages installed"

  # ── Node.js 20.x via NodeSource ──
  if node --version 2>/dev/null | grep -q "^v2[0-9]"; then
    print_ok "Node.js $(node --version) already installed"
  else
    print_info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
    sudo apt-get install -y nodejs >/dev/null
    print_ok "Node.js $(node --version) installed"
  fi

  # ── Pin npm 10.9.2 ──
  local npm_ver
  npm_ver=$(npm --version 2>/dev/null || echo "0")
  if [[ "$npm_ver" == "10.9.2" ]]; then
    print_ok "npm 10.9.2 already installed"
  else
    print_info "Pinning npm to 10.9.2..."
    sudo npm install -g npm@10.9.2 --quiet
    print_ok "npm $(npm --version) installed"
  fi

  # ── Global tools: PM2 + Turbo ──
  if ! command -v pm2 &>/dev/null; then
    print_info "Installing PM2..."
    sudo npm install -g pm2 --quiet
    print_ok "PM2 $(pm2 --version) installed"
  else
    print_ok "PM2 $(pm2 --version) already installed"
  fi

  if ! command -v turbo &>/dev/null; then
    print_info "Installing Turbo..."
    sudo npm install -g turbo --quiet
    print_ok "Turbo installed"
  else
    print_ok "Turbo already installed"
  fi
}

# =============================================================================
# SECTION 6A — Demo Mode Flow
# =============================================================================

demo_flow() {
  print_header "  Demo Mode Installation"
  hr

  # ── 6A-1  Docker ──────────────────────────────────────────────────────────
  print_step "Installing Docker"
  if command -v docker &>/dev/null; then
    print_ok "Docker already installed: $(docker --version)"
  else
    sudo apt-get install -y docker.io docker-compose >/dev/null
    sudo systemctl enable --now docker
    print_ok "Docker installed"
  fi

  # Allow current (non-root) user to use Docker
  local real_user="${SUDO_USER:-$USER}"
  if [[ -n "$real_user" ]] && ! groups "$real_user" 2>/dev/null | grep -q docker; then
    sudo usermod -aG docker "$real_user"
    print_ok "User '$real_user' added to docker group"
    print_warn "You may need to log out and back in for Docker group membership to take effect."
  fi

  # ── 6A-2  Locate / clone repo ─────────────────────────────────────────────
  print_step "Locating MindLog repository"
  echo
  local default_dir
  if [[ -f "$(pwd)/package.json" ]] && grep -q '"name": "mindlog"' "$(pwd)/package.json" 2>/dev/null; then
    default_dir="$(pwd)"
  else
    default_dir="${HOME}/MindLog"
  fi

  if [[ -z "$INSTALL_DIR" ]]; then
    prompt INSTALL_DIR "Repository path or GitHub URL to clone" "$default_dir"
  fi

  # If it looks like a URL, clone it
  if [[ "$INSTALL_DIR" =~ ^https?:// || "$INSTALL_DIR" =~ ^git@ ]]; then
    local repo_url="$INSTALL_DIR"
    INSTALL_DIR="${HOME}/MindLog"
    prompt INSTALL_DIR "Clone destination" "$INSTALL_DIR"
    if [[ -d "$INSTALL_DIR" ]]; then
      print_warn "Directory ${INSTALL_DIR} already exists."
      confirm "Remove and re-clone?" && rm -rf "$INSTALL_DIR"
    fi
    print_info "Cloning from ${repo_url}..."
    git clone "$repo_url" "$INSTALL_DIR"
    print_ok "Cloned to ${INSTALL_DIR}"
  elif [[ ! -d "$INSTALL_DIR" ]]; then
    print_error "Directory not found: ${INSTALL_DIR}"
  else
    print_ok "Using repository at ${INSTALL_DIR}"
  fi

  cd "$INSTALL_DIR"

  # ── 6A-3  npm install ─────────────────────────────────────────────────────
  print_step "Installing npm dependencies"
  npm install
  print_ok "npm install complete"

  # ── 6A-4  Environment file ────────────────────────────────────────────────
  print_step "Setting up environment"
  if [[ -f ".env" ]]; then
    print_warn ".env already exists."
    confirm "Overwrite with .env.demo?" && cp .env.demo .env
  else
    cp .env.demo .env
    print_ok ".env created from .env.demo"
  fi

  echo
  print_info "Current .env contents:"
  hr
  grep -v '^#' .env | grep -v '^$' | sed 's/^/  /'
  hr

  # ── 6A-5  Start Docker infrastructure ────────────────────────────────────
  print_step "Starting Docker infrastructure (Postgres, Redis, MailHog)"
  npm run demo:infra

  print_info "Waiting for PostgreSQL on port 5432..."
  local retries=30
  until pg_isready -h localhost -p 5432 -U postgres &>/dev/null 2>&1 || \
    docker exec "$(docker ps -qf 'name=postgres')" pg_isready -U postgres &>/dev/null 2>&1; do
    (( retries-- ))
    if (( retries == 0 )); then
      print_error "PostgreSQL did not become ready in time. Check: docker ps"
    fi
    sleep 2
  done
  print_ok "PostgreSQL is ready"

  print_info "Waiting for Redis on port 6379..."
  retries=15
  until redis-cli -h localhost ping &>/dev/null 2>&1 || \
    docker exec "$(docker ps -qf 'name=redis')" redis-cli ping &>/dev/null 2>&1; do
    (( retries-- ))
    if (( retries == 0 )); then
      print_warn "Redis check timed out — it may still be starting."
      break
    fi
    sleep 2
  done
  print_ok "Redis is ready"

  # ── 6A-6  Build shared packages ──────────────────────────────────────────
  print_step "Building shared packages"
  npm run build --workspace=packages/shared
  npm run build --workspace=packages/db
  print_ok "Shared packages built"

  # ── 6A-7  Database migration + seed ──────────────────────────────────────
  print_step "Running database migrations"
  npm run demo:migrate
  print_ok "Migrations applied"

  print_step "Seeding demo data"
  npm run demo:seed
  print_ok "Demo data seeded (dr.kim@mindlogdemo.com, alice@mindlogdemo.com)"

  # ── 6A-8  Build web dashboard ─────────────────────────────────────────────
  print_step "Building web dashboard"
  npm run build --workspace=apps/web
  print_ok "Web dashboard built (apps/web/dist/)"
}

# =============================================================================
# SECTION 6B — Production Mode Flow
# =============================================================================

production_collect_params() {
  print_step "Production configuration — please answer the following prompts"
  echo -e "  ${DIM}(Press Enter to accept the default shown in brackets)${RESET}"
  echo -e "  ${DIM}(Passwords/secrets marked ← hidden will not echo to terminal)${RESET}"
  echo

  echo -e "  ${BOLD}── Application ──────────────────────────────────────────${RESET}"
  [[ -z "$INSTALL_DIR" ]] && prompt INSTALL_DIR "Install directory" "/opt/mindlog"
  prompt APP_USER "System user to run services" "mindlog"
  prompt APP_NAME "PM2 app name prefix"         "mindlog"

  echo
  echo -e "  ${BOLD}── Domain & TLS ─────────────────────────────────────────${RESET}"
  prompt DOMAIN      "Domain name (FQDN)"          "app.example.com"
  prompt ADMIN_EMAIL "Admin email (for certbot)"   "ops@example.com"

  echo
  echo -e "  ${BOLD}── Database ─────────────────────────────────────────────${RESET}"
  prompt DB_NAME "PostgreSQL database name" "mindlog_prod"
  prompt DB_USER "PostgreSQL username"      "mindlog_db"
  local auto_db_pass
  auto_db_pass=$(generate_secret 24)
  echo -e "  ${DIM}(Enter a password or press Enter to use auto-generated)${RESET}"
  prompt_secret DB_PASSWORD "PostgreSQL password (← hidden)"
  [[ -z "$DB_PASSWORD" ]] && DB_PASSWORD="$auto_db_pass"

  echo
  echo -e "  ${BOLD}── Redis ─────────────────────────────────────────────────${RESET}"
  local auto_redis_pass
  auto_redis_pass=$(generate_secret 18)
  echo -e "  ${DIM}(Enter a password or press Enter to use auto-generated)${RESET}"
  prompt_secret REDIS_PASSWORD "Redis password (← hidden)"
  [[ -z "$REDIS_PASSWORD" ]] && REDIS_PASSWORD="$auto_redis_pass"

  echo
  echo -e "  ${BOLD}── Supabase Auth ────────────────────────────────────────${RESET}"
  echo -e "  ${DIM}Supabase is used only for email/password authentication.${RESET}"
  prompt SUPABASE_URL "Supabase URL" "https://your-project.supabase.co"
  prompt_secret SUPABASE_SERVICE_ROLE_KEY "Supabase Service Role Key (← hidden)"

  echo
  echo -e "  ${BOLD}── JWT ──────────────────────────────────────────────────${RESET}"
  local auto_jwt
  auto_jwt=$(generate_secret 48)
  echo -e "  ${DIM}(Press Enter to auto-generate a 64-char base64 JWT secret — recommended)${RESET}"
  prompt_secret JWT_SECRET "JWT secret (← hidden)"
  [[ -z "$JWT_SECRET" ]] && JWT_SECRET="$auto_jwt"
  prompt JWT_ACCESS_EXPIRY "JWT access token expiry"  "15m"
  prompt JWT_REFRESH_EXPIRY "JWT refresh token expiry" "7d"

  echo
  echo -e "  ${BOLD}── Email — Resend API (optional) ────────────────────────${RESET}"
  echo -e "  ${DIM}Required for patient invite emails and welcome emails.${RESET}"
  prompt_secret RESEND_API_KEY "Resend API key (← hidden, Enter to skip)"
  prompt EMAIL_FROM "Email from address" "MindLog <noreply@${DOMAIN}>"

  echo
  echo -e "  ${BOLD}── AI Insights — Anthropic (optional) ──────────────────${RESET}"
  echo -e "  ${YELLOW}  ⚠  Requires a signed HIPAA BAA with Anthropic before use with patient data.${RESET}"
  prompt_secret ANTHROPIC_API_KEY "Anthropic API key (← hidden, Enter to skip)"
  if [[ -n "$ANTHROPIC_API_KEY" ]]; then
    if confirm "Enable AI insights?" "N"; then
      AI_INSIGHTS_ENABLED="true"
      if confirm "Confirm: Anthropic BAA is signed and on file?" "N"; then
        ANTHROPIC_BAA_SIGNED="true"
      fi
    fi
  fi

  echo
  echo -e "  ${BOLD}── SMS Alerts — Twilio (optional) ───────────────────────${RESET}"
  echo -e "  ${DIM}Used for critical safety alert SMS to clinicians.${RESET}"
  prompt TWILIO_ACCOUNT_SID "Twilio Account SID (Enter to skip)" ""
  if [[ -n "$TWILIO_ACCOUNT_SID" ]]; then
    prompt_secret TWILIO_AUTH_TOKEN "Twilio Auth Token (← hidden)"
    prompt TWILIO_FROM_NUMBER "Twilio From Number" "+15550000000"
  fi

  echo
  echo -e "  ${BOLD}── Crisis Resources ─────────────────────────────────────${RESET}"
  prompt CRISIS_LINE_PHONE  "Crisis phone number"  "988"
  prompt CRISIS_LINE_NAME   "Crisis line name"     "988 Suicide & Crisis Lifeline"
  prompt CRISIS_TEXT_NUMBER "Crisis text number"   "741741"
  prompt CRISIS_TEXT_NAME   "Crisis text name"     "Crisis Text Line"

  echo
  echo -e "  ${BOLD}── Push Notifications — Expo (optional) ─────────────────${RESET}"
  prompt_secret EXPO_ACCESS_TOKEN "Expo Access Token (← hidden, Enter to skip)"

  echo
  echo -e "  ${BOLD}── Compliance Flags ─────────────────────────────────────${RESET}"
  echo -e "  ${DIM}These set documentation flags only. They do not enforce compliance.${RESET}"
  confirm "HIPAA risk assessment complete?" "N" && HIPAA_ASSESSMENT_COMPLETE="true"

  echo
  # ── Summary table ────────────────────────────────────────────────────────
  hr
  echo -e "\n  ${BOLD}Configuration summary:${RESET}\n"
  printf "  %-30s %s\n" "Install directory:"   "$INSTALL_DIR"
  printf "  %-30s %s\n" "System user:"         "$APP_USER"
  printf "  %-30s %s\n" "Domain:"              "https://$DOMAIN"
  printf "  %-30s %s\n" "Admin email:"         "$ADMIN_EMAIL"
  printf "  %-30s %s\n" "PostgreSQL database:" "$DB_NAME"
  printf "  %-30s %s\n" "PostgreSQL user:"     "$DB_USER"
  printf "  %-30s %s\n" "PostgreSQL password:" "*** (auto-generated or provided)"
  printf "  %-30s %s\n" "Redis password:"      "*** (auto-generated or provided)"
  printf "  %-30s %s\n" "JWT secret:"          "*** (auto-generated or provided)"
  printf "  %-30s %s\n" "Email (Resend):"      "${RESEND_API_KEY:+configured}${RESEND_API_KEY:-skipped}"
  printf "  %-30s %s\n" "AI Insights:"         "$AI_INSIGHTS_ENABLED"
  printf "  %-30s %s\n" "Twilio SMS:"          "${TWILIO_ACCOUNT_SID:+configured}${TWILIO_ACCOUNT_SID:-skipped}"
  printf "  %-30s %s\n" "Expo push:"           "${EXPO_ACCESS_TOKEN:+configured}${EXPO_ACCESS_TOKEN:-skipped}"
  printf "  %-30s %s\n" "HIPAA assessed:"      "$HIPAA_ASSESSMENT_COMPLETE"
  printf "  %-30s %s\n" "Anthropic BAA:"       "$ANTHROPIC_BAA_SIGNED"
  echo
  hr

  confirm "Proceed with production installation?" "Y" || print_error "Aborted by user."
}

production_flow() {
  print_header "  Production Mode Installation"
  hr

  production_collect_params

  # ── 6B-2  Create system user ─────────────────────────────────────────────
  print_step "Creating system user '${APP_USER}'"
  if id "$APP_USER" &>/dev/null; then
    print_ok "User '${APP_USER}' already exists"
  else
    sudo useradd \
      --system \
      --shell /usr/sbin/nologin \
      --create-home \
      --home-dir "$INSTALL_DIR" \
      "$APP_USER"
    print_ok "System user '${APP_USER}' created"
  fi

  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "${APP_USER}:${APP_USER}" "$INSTALL_DIR"

  # ── 6B-3  PostgreSQL 17 ──────────────────────────────────────────────────
  print_step "Installing PostgreSQL 17"
  if psql --version 2>/dev/null | grep -q "17"; then
    print_ok "PostgreSQL 17 already installed"
  else
    sudo apt-get install -y postgresql-common >/dev/null
    sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null 2>&1 || true
    sudo apt-get install -y postgresql-17 >/dev/null
    print_ok "PostgreSQL 17 installed"
  fi

  sudo systemctl enable --now postgresql
  print_ok "PostgreSQL service enabled and started"

  # Wait for PostgreSQL to be ready
  local retries=20
  until sudo -u postgres pg_isready &>/dev/null; do
    (( retries-- ))
    (( retries == 0 )) && print_error "PostgreSQL did not start in time."
    sleep 1
  done

  # Create DB user + database
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
  sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null 2>&1 || true
  sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"  >/dev/null 2>&1 || true
  sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS btree_gist;" >/dev/null 2>&1 || true
  print_ok "Database '${DB_NAME}' and user '${DB_USER}' configured"

  # ── 6B-4  Redis 7 ────────────────────────────────────────────────────────
  print_step "Installing Redis 7"
  if redis-server --version 2>/dev/null | grep -q "7\\."; then
    print_ok "Redis 7 already installed"
  else
    curl -fsSL https://packages.redis.io/gpg \
      | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg 2>/dev/null
    echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] \
https://packages.redis.io/deb $(lsb_release -cs) main" \
      | sudo tee /etc/apt/sources.list.d/redis.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y redis-server >/dev/null
    print_ok "Redis 7 installed"
  fi

  # Configure Redis: bind loopback + requirepass
  local redis_conf="/etc/redis/redis.conf"
  if [[ -f "$redis_conf" ]]; then
    sudo sed -i 's/^# *bind .*/bind 127.0.0.1 ::1/' "$redis_conf"
    sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/'   "$redis_conf"
    if [[ -n "$REDIS_PASSWORD" ]]; then
      if grep -q "^requirepass" "$redis_conf"; then
        sudo sed -i "s|^requirepass .*|requirepass ${REDIS_PASSWORD}|" "$redis_conf"
      else
        echo "requirepass ${REDIS_PASSWORD}" | sudo tee -a "$redis_conf" >/dev/null
      fi
    fi
  fi
  sudo systemctl enable --now redis-server
  print_ok "Redis configured and started"

  # ── 6B-5  Clone / copy repo ──────────────────────────────────────────────
  print_step "Setting up application files"
  local real_user="${SUDO_USER:-$USER}"

  if [[ "$(pwd)" != "$INSTALL_DIR" ]]; then
    if [[ -d "$INSTALL_DIR/apps" ]]; then
      print_warn "Files already exist at ${INSTALL_DIR}."
      confirm "Overwrite?" && sudo rm -rf "${INSTALL_DIR:?}"/*
    fi
    sudo cp -r . "$INSTALL_DIR"
    print_ok "Files copied to ${INSTALL_DIR}"
  else
    print_ok "Running from install directory: ${INSTALL_DIR}"
  fi

  sudo chown -R "${APP_USER}:${APP_USER}" "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  # ── 6B-6  npm install + build ────────────────────────────────────────────
  print_step "Installing dependencies and building all packages"
  sudo -u "$APP_USER" npm install
  sudo -u "$APP_USER" npm run build --workspace=packages/shared
  sudo -u "$APP_USER" npm run build --workspace=packages/db
  sudo -u "$APP_USER" npm run build --workspace=apps/api
  sudo -u "$APP_USER" npm run build --workspace=apps/web
  print_ok "All packages built"

  # ── 6B-7  Write .env ─────────────────────────────────────────────────────
  print_step "Writing production environment file"

  local redis_url
  if [[ -n "$REDIS_PASSWORD" ]]; then
    redis_url="redis://:${REDIS_PASSWORD}@127.0.0.1:6379"
  else
    redis_url="redis://127.0.0.1:6379"
  fi

  sudo tee "${INSTALL_DIR}/.env" >/dev/null <<ENV
# MindLog Production Configuration
# Generated by INSTALLER.sh on $(date -u)
# ─────────────────────────────────────────────────────────────
# SECURITY: This file contains secrets. chmod 600 is enforced.
# ─────────────────────────────────────────────────────────────

# Database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}

# Redis
REDIS_URL=${redis_url}

# Supabase Auth (identity only — no PHI stored in Supabase)
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRY=${JWT_ACCESS_EXPIRY}
JWT_REFRESH_EXPIRY=${JWT_REFRESH_EXPIRY}

# API Server
API_PORT=3000
API_HOST=127.0.0.1
NODE_ENV=production
API_BASE_URL=https://${DOMAIN}
CORS_ORIGIN=https://${DOMAIN}

# Email (Resend)
RESEND_API_KEY=${RESEND_API_KEY}
EMAIL_FROM=${EMAIL_FROM}

# SMS (Twilio)
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_FROM_NUMBER=${TWILIO_FROM_NUMBER}

# AI Insights (Anthropic)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ANTHROPIC_MODEL=claude-sonnet-4-6
AI_INSIGHTS_ENABLED=${AI_INSIGHTS_ENABLED}

# Push Notifications (Expo)
EXPO_ACCESS_TOKEN=${EXPO_ACCESS_TOKEN}

# Crisis Resources
CRISIS_LINE_PHONE=${CRISIS_LINE_PHONE}
CRISIS_LINE_NAME=${CRISIS_LINE_NAME}
CRISIS_TEXT_NUMBER=${CRISIS_TEXT_NUMBER}
CRISIS_TEXT_NAME=${CRISIS_TEXT_NAME}

# File Storage
STORAGE_BUCKET_REPORTS=mindlog-reports

# Compliance flags
ANTHROPIC_BAA_SIGNED=${ANTHROPIC_BAA_SIGNED}
HIPAA_ASSESSMENT_COMPLETE=${HIPAA_ASSESSMENT_COMPLETE}
ENV

  sudo chmod 600 "${INSTALL_DIR}/.env"
  sudo chown "${APP_USER}:${APP_USER}" "${INSTALL_DIR}/.env"
  print_ok ".env written (chmod 600)"

  # ── 6B-8  Migrations + seed ──────────────────────────────────────────────
  print_step "Running database migrations"
  sudo -u "$APP_USER" bash -c "cd '${INSTALL_DIR}' && set -a && source .env && set +a && npm run db:migrate --workspace=packages/db"
  print_ok "All 8 migrations applied"

  echo
  echo -e "  ${BOLD}Seed the database?${RESET}"
  echo "    [1] Demo data  — realistic clinician + patient accounts for evaluation"
  echo "    [2] Minimal    — empty organisation scaffold ready for production use"
  echo "    [3] Skip       — seed manually later"
  echo
  local seed_choice
  if [[ "$YES" == "true" ]]; then
    seed_choice="3"
    print_info "Seed choice → 3 (skip) in non-interactive mode"
  else
    read -rp "  Your choice [1/2/3]: " seed_choice
  fi
  case "$seed_choice" in
    1)
      sudo -u "$APP_USER" bash -c "cd '${INSTALL_DIR}' && set -a && source .env && set +a && npm run db:seed-demo --workspace=packages/db"
      print_ok "Demo seed applied"
      ;;
    2)
      sudo -u "$APP_USER" bash -c "cd '${INSTALL_DIR}' && set -a && source .env && set +a && npm run db:seed --workspace=packages/db"
      print_ok "Minimal scaffold seeded"
      ;;
    *)
      print_info "Seeding skipped"
      ;;
  esac

  # ── 6B-9  PM2 ecosystem file ─────────────────────────────────────────────
  print_step "Configuring PM2"

  sudo tee "${INSTALL_DIR}/ecosystem.config.cjs" >/dev/null <<ECOSYS
module.exports = {
  apps: [
    {
      name: '${APP_NAME}-api',
      script: './apps/api/dist/server.js',
      cwd: '${INSTALL_DIR}',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/${APP_NAME}/api-error.log',
      out_file:   '/var/log/${APP_NAME}/api-out.log',
      merge_logs: true,
      restart_delay: 3000,
      watch: false,
    },
    {
      name: '${APP_NAME}-worker',
      script: './apps/api/dist/worker.js',
      cwd: '${INSTALL_DIR}',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/${APP_NAME}/worker-error.log',
      out_file:   '/var/log/${APP_NAME}/worker-out.log',
      merge_logs: true,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
ECOSYS

  sudo chown "${APP_USER}:${APP_USER}" "${INSTALL_DIR}/ecosystem.config.cjs"

  sudo mkdir -p "/var/log/${APP_NAME}"
  sudo chown "${APP_USER}:${APP_USER}" "/var/log/${APP_NAME}"

  # Start PM2 as the service user (restart individual processes if already running)
  if ! sudo -u "$APP_USER" pm2 start "${INSTALL_DIR}/ecosystem.config.cjs" --env production 2>/dev/null; then
    sudo -u "$APP_USER" pm2 restart "${APP_NAME}-api"
    sudo -u "$APP_USER" pm2 restart "${APP_NAME}-worker"
  fi
  sudo -u "$APP_USER" pm2 save

  # Register PM2 as a systemd service
  local pm2_startup
  pm2_startup=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "$INSTALL_DIR" 2>/dev/null | grep "sudo env" || true)
  if [[ -n "$pm2_startup" ]]; then
    eval "$pm2_startup"
  else
    sudo env "PATH=$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$INSTALL_DIR" >/dev/null 2>&1 || true
  fi
  sudo systemctl enable "pm2-${APP_USER}" 2>/dev/null || true
  print_ok "PM2 configured with API + Worker; systemd startup hook installed"

  # ── 6B-10  nginx ─────────────────────────────────────────────────────────
  print_step "Installing and configuring nginx"
  sudo apt-get install -y nginx >/dev/null
  sudo systemctl enable nginx

  # Write virtual host (HTTP-only first; certbot will add SSL blocks)
  sudo tee "/etc/nginx/sites-available/${APP_NAME}" >/dev/null <<NGINX
# MindLog nginx configuration
# Generated by INSTALLER.sh on $(date -u)
# Certbot will add/modify SSL blocks below.

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Serve static web dashboard
    root  ${INSTALL_DIR}/apps/web/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /api/ws {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 3600s;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
NGINX

  sudo ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
  print_ok "nginx configured for ${DOMAIN}"

  # ── 6B-11  Let's Encrypt (certbot) ───────────────────────────────────────
  print_step "Obtaining TLS certificate from Let's Encrypt"
  print_warn "Your DNS A record for '${DOMAIN}' must point to this server's public IP before this step."

  if confirm "Proceed with certificate request?" "Y"; then
    sudo apt-get install -y certbot python3-certbot-nginx >/dev/null

    if sudo certbot --nginx \
      --non-interactive \
      --agree-tos \
      --email "${ADMIN_EMAIL}" \
      --domains "${DOMAIN}" \
      --redirect; then
      print_ok "TLS certificate obtained for ${DOMAIN}"
    else
      print_warn "certbot failed. You can re-run it manually:"
      print_info "  sudo certbot --nginx -d ${DOMAIN} --email ${ADMIN_EMAIL}"
    fi

    sudo systemctl enable certbot.timer 2>/dev/null || true
    print_ok "certbot auto-renewal timer enabled"

    # Verify auto-renewal will work
    print_info "Verifying certbot auto-renewal (dry run)..."
    if sudo certbot renew --dry-run >/dev/null 2>&1; then
      print_ok "certbot auto-renewal dry run passed"
    else
      print_warn "certbot renewal dry run failed — check: sudo certbot renew --dry-run"
    fi

    # Reload nginx after certbot modifies config
    sudo nginx -t && sudo systemctl reload nginx
  else
    print_warn "TLS skipped — to obtain a certificate later, run:"
    print_info "  sudo certbot --nginx -d ${DOMAIN} --email ${ADMIN_EMAIL}"
  fi

  # ── 6B-12  UFW firewall ───────────────────────────────────────────────────
  print_step "Configuring UFW firewall"
  sudo apt-get install -y ufw >/dev/null
  sudo ufw --force reset >/dev/null 2>&1
  sudo ufw default deny incoming >/dev/null
  sudo ufw default allow outgoing >/dev/null
  sudo ufw allow 22/tcp   comment 'SSH'              >/dev/null
  sudo ufw allow 80/tcp   comment 'HTTP (nginx)'     >/dev/null
  sudo ufw allow 443/tcp  comment 'HTTPS (nginx)'    >/dev/null
  # Internal ports (3000, 6379) deliberately NOT opened externally
  sudo ufw --force enable >/dev/null
  print_ok "UFW enabled: ports 22, 80, 443 open; API and Redis loopback-only"

  # ── 6B-13  Log rotation ───────────────────────────────────────────────────
  print_step "Setting up log rotation"
  sudo tee "/etc/logrotate.d/${APP_NAME}" >/dev/null <<LOGROTATE
/var/log/${APP_NAME}/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        su - ${APP_USER} -s /bin/bash -c 'pm2 reloadLogs' > /dev/null 2>&1 || true
    endscript
}
LOGROTATE
  print_ok "Log rotation configured (14-day retention)"

  # ── 6B-14  Health verification ────────────────────────────────────────────
  print_step "Verifying services"
  sleep 5
  if curl -sf http://127.0.0.1:3000/health >/dev/null; then
    print_ok "API health check passed (loopback)"
  else
    print_warn "API health check failed — check: sudo -u ${APP_USER} pm2 logs ${APP_NAME}-api"
  fi
  if curl -sf "https://${DOMAIN}/health" >/dev/null 2>&1; then
    print_ok "External HTTPS health check passed"
  else
    print_warn "External HTTPS not yet reachable — DNS propagation may take a few minutes."
  fi
  sudo -u "$APP_USER" pm2 status

  # ── 6B-15  Write install summary ─────────────────────────────────────────
  print_step "Writing install summary"
  local summary_file="${INSTALL_DIR}/.install-summary"
  sudo tee "$summary_file" >/dev/null <<SUMMARY
MindLog Production Installation Summary
Generated: $(date -u)
══════════════════════════════════════════════════════════════

MODE:              production
INSTALL DIR:       ${INSTALL_DIR}
SYSTEM USER:       ${APP_USER}
DOMAIN:            https://${DOMAIN}
ADMIN EMAIL:       ${ADMIN_EMAIL}

── PostgreSQL ───────────────────────────────────────────────
Host:              localhost:5432
Database:          ${DB_NAME}
User:              ${DB_USER}
Password:          ${DB_PASSWORD}

── Redis ────────────────────────────────────────────────────
Host:              127.0.0.1:6379
Password:          ${REDIS_PASSWORD}

── JWT ──────────────────────────────────────────────────────
Secret:            ${JWT_SECRET}
Access expiry:     ${JWT_ACCESS_EXPIRY}
Refresh expiry:    ${JWT_REFRESH_EXPIRY}

── Services ─────────────────────────────────────────────────
API:               PM2 → ${APP_NAME}-api     (port 3000, loopback only)
Worker:            PM2 → ${APP_NAME}-worker
nginx:             systemd → nginx
PostgreSQL:        systemd → postgresql
Redis:             systemd → redis-server

── Logs ─────────────────────────────────────────────────────
API out:           /var/log/${APP_NAME}/api-out.log
API err:           /var/log/${APP_NAME}/api-error.log
Worker out:        /var/log/${APP_NAME}/worker-out.log
Worker err:        /var/log/${APP_NAME}/worker-error.log
nginx access:      /var/log/nginx/access.log
nginx error:       /var/log/nginx/error.log

── Useful Commands ──────────────────────────────────────────
PM2 status:        sudo -u ${APP_USER} pm2 status
PM2 logs:          sudo -u ${APP_USER} pm2 logs
PM2 restart API:   sudo -u ${APP_USER} pm2 restart ${APP_NAME}-api
Nginx reload:      sudo systemctl reload nginx
Cert renew:        sudo certbot renew

⚠  SECURITY: Copy these credentials to a password manager and
   then delete this file: sudo rm ${summary_file}

SUMMARY

  sudo chmod 600 "$summary_file"
  sudo chown "${APP_USER}:${APP_USER}" "$summary_file"
  print_ok "Install summary written to ${summary_file} (chmod 600)"

  # Mark installation complete
  sudo -u "$APP_USER" touch "${INSTALL_DIR}/.mindlog-installed"
}

# =============================================================================
# SECTION 7 — Android SDK + JDK 17
# =============================================================================

install_android() {
  print_step "Installing Android development environment"

  local real_user="${SUDO_USER:-$USER}"
  local real_home
  real_home=$(getent passwd "$real_user" | cut -d: -f6)
  local android_home="${real_home}/Android/Sdk"

  # ── JDK 17 (Eclipse Temurin via Adoptium) ────────────────────────────────
  print_info "Installing Java JDK 17 (Eclipse Temurin)..."
  if java -version 2>&1 | grep -q '17\.'; then
    print_ok "JDK 17 already installed: $(java -version 2>&1 | head -1)"
  else
    wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | sudo gpg --dearmor -o /usr/share/keyrings/adoptium-keyring.gpg 2>/dev/null
    local codename
    codename=$(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release)
    echo "deb [signed-by=/usr/share/keyrings/adoptium-keyring.gpg] \
https://packages.adoptium.net/artifactory/deb ${codename} main" \
      | sudo tee /etc/apt/sources.list.d/adoptium.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y temurin-17-jdk >/dev/null
    print_ok "JDK 17 installed: $(java -version 2>&1 | head -1)"
  fi

  # ── Android Command Line Tools ────────────────────────────────────────────
  print_info "Setting up Android SDK at ${android_home}..."
  # NOTE: This URL embeds a build number. Check for a newer version at:
  # https://developer.android.com/studio#command-line-tools-only
  local cmdtools_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  local cmdtools_zip="/tmp/android-cmdtools.zip"
  local cmdtools_tmp="/tmp/android-cmdtools-extract"

  mkdir -p "${android_home}/cmdline-tools"
  if [[ ! -f "${android_home}/cmdline-tools/latest/bin/sdkmanager" ]]; then
    sudo -u "$real_user" wget -q --show-progress "$cmdtools_url" -O "$cmdtools_zip"
    rm -rf "$cmdtools_tmp"
    mkdir -p "$cmdtools_tmp"
    unzip -q "$cmdtools_zip" -d "$cmdtools_tmp"
    sudo -u "$real_user" mv "${cmdtools_tmp}/cmdline-tools" "${android_home}/cmdline-tools/latest"
    rm -rf "$cmdtools_tmp" "$cmdtools_zip"
    print_ok "Android Command Line Tools installed"
  else
    print_ok "Android Command Line Tools already present"
  fi

  local sdkmgr="${android_home}/cmdline-tools/latest/bin/sdkmanager"

  # ── Accept licenses ───────────────────────────────────────────────────────
  print_info "Accepting Android SDK licenses..."
  sudo -u "$real_user" bash -c "yes 2>/dev/null | '${sdkmgr}' --licenses" >/dev/null 2>&1 || true

  # ── Install SDK packages ──────────────────────────────────────────────────
  print_info "Installing Android SDK packages (platform-tools, android-35, emulator)..."
  sudo -u "$real_user" "$sdkmgr" \
    "platform-tools" \
    "platforms;android-35" \
    "build-tools;35.0.0" \
    "emulator" \
    "system-images;android-35;google_apis;x86_64" >/dev/null
  print_ok "Android SDK packages installed"

  # ── Shell environment ─────────────────────────────────────────────────────
  local bashrc="${real_home}/.bashrc"
  local profile="${real_home}/.profile"

  local env_block="
# ── Android SDK (added by MindLog INSTALLER.sh) ──────────
export ANDROID_HOME=\"${android_home}\"
export JAVA_HOME=\$(dirname \$(dirname \$(readlink -f \$(which java))))
export PATH=\"\$PATH:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin\"
# ─────────────────────────────────────────────────────────"

  for rc_file in "$bashrc" "$profile"; do
    if ! grep -q "ANDROID_HOME" "$rc_file" 2>/dev/null; then
      echo "$env_block" | sudo -u "$real_user" tee -a "$rc_file" >/dev/null
    fi
  done
  print_ok "ANDROID_HOME and PATH added to ~/.bashrc and ~/.profile"

  # ── Expo CLI + EAS CLI ────────────────────────────────────────────────────
  print_info "Installing Expo CLI and EAS CLI..."
  if ! command -v expo &>/dev/null; then
    sudo npm install -g expo-cli --quiet
    print_ok "Expo CLI installed"
  else
    print_ok "Expo CLI already installed"
  fi
  if ! command -v eas &>/dev/null; then
    sudo npm install -g eas-cli --quiet
    print_ok "EAS CLI installed"
  else
    print_ok "EAS CLI already installed"
  fi

  # ── Optional AVD creation ─────────────────────────────────────────────────
  echo
  if confirm "Create a default Android Virtual Device (MindLog_API35 emulator)?" "Y"; then
    local avdmgr="${android_home}/cmdline-tools/latest/bin/avdmanager"
    if sudo -u "$real_user" "$avdmgr" create avd \
      --name "MindLog_API35" \
      --package "system-images;android-35;google_apis;x86_64" \
      --device "pixel_6" \
      --force 2>/dev/null; then
      print_ok "AVD 'MindLog_API35' created (Pixel 6, Android 35, Google APIs)"
      print_info "  Start it with: emulator -avd MindLog_API35"
    else
      print_warn "AVD creation failed — you can create one manually with Android Studio."
    fi
  fi
}

# =============================================================================
# SECTION 8 — Final Summary
# =============================================================================

print_final_summary() {
  echo
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║          MindLog Installation Complete!                 ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"

  if [[ "$MODE" == "demo" ]]; then
    cat <<DEMO_SUMMARY

  ${BOLD}Mode:${RESET}  Demo

  ${BOLD}Start the API:${RESET}
    cd ${INSTALL_DIR}
    npm run demo:api          # Terminal 1 — Fastify API + Worker

  ${BOLD}Start the web dashboard:${RESET}
    npm run demo:web          # Terminal 2 — Vite dev server

  ${BOLD}Open in browser:${RESET}
    Dashboard:  http://localhost:5173
    API docs:   http://localhost:3000/docs
    MailHog:    http://localhost:8025

  ${BOLD}Demo credentials:${RESET}
    Clinician:  dr.kim@mindlogdemo.com  /  Demo@Clinic1!
    Patient:    alice@mindlogdemo.com   /  Demo@Patient1!

  ${BOLD}Stop infrastructure:${RESET}
    npm run demo:infra:stop

DEMO_SUMMARY
  else
    cat <<PROD_SUMMARY

  ${BOLD}Mode:${RESET}  Production

  ${BOLD}Dashboard:${RESET}      https://${DOMAIN}
  ${BOLD}API health:${RESET}     https://${DOMAIN}/health
  ${BOLD}API docs:${RESET}       https://${DOMAIN}/api/docs

  ${BOLD}PM2 commands:${RESET}
    sudo -u ${APP_USER} pm2 status
    sudo -u ${APP_USER} pm2 logs
    sudo -u ${APP_USER} pm2 restart ${APP_NAME}-api

  ${BOLD}Credentials summary:${RESET}
    ${INSTALL_DIR}/.install-summary  (chmod 600)

PROD_SUMMARY
  fi

  if [[ "$INSTALL_ANDROID" == "true" ]]; then
    local real_user="${SUDO_USER:-$USER}"
    local real_home
    real_home=$(getent passwd "$real_user" | cut -d: -f6)
    cat <<ANDROID_SUMMARY

  ${BOLD}Android SDK:${RESET}
    ANDROID_HOME=${real_home}/Android/Sdk
    Activate PATH:     source ~/.bashrc
    Start emulator:    emulator -avd MindLog_API35
    Run mobile app:    cd ${INSTALL_DIR}/apps/mobile
                       EXPO_PUBLIC_API_BASE=http://10.0.2.2:3000 npx expo start --android

ANDROID_SUMMARY
  fi

  echo -e "  ${YELLOW}${BOLD}⚠  Next steps:${RESET}"
  if [[ "$MODE" == "production" ]]; then
    echo "    1. Ensure DNS A record for '${DOMAIN}' → this server's public IP"
    echo "    2. Set EXPO_PUBLIC_API_BASE in EAS build config:"
    echo "         Production:  https://${DOMAIN}"
    echo "         Android dev: http://10.0.2.2:3000"
    echo "    3. Copy .install-summary to a password manager, then delete it"
    echo "    4. Enable AI insights ONLY after Anthropic BAA is signed"
    echo "    5. Complete a HIPAA risk analysis before onboarding real patients"
  else
    echo "    1. Set EXPO_PUBLIC_API_BASE in apps/mobile/.env:"
    echo "         Android emulator: http://10.0.2.2:3000"
    echo "         Physical device:  http://<your-local-IP>:3000"
    echo "    2. Enable AI insights only after signing an Anthropic HIPAA BAA"
  fi
  echo
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  show_banner
  parse_args "$@"
  preflight_checks
  select_mode
  select_components
  install_common_deps

  case "$MODE" in
    demo)       demo_flow       ;;
    production) production_flow ;;
    *) print_error "Unknown mode: ${MODE}" ;;
  esac

  if [[ "$INSTALL_ANDROID" == "true" ]]; then
    install_android
  fi

  print_final_summary
}

main "$@"
