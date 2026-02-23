#!/bin/bash
#
# MindLog Live Simulation - Cron Setup Script
#
# This script adds the live data simulation to your crontab,
# running every 8 hours (6am, 2pm, 10pm) to maintain realistic demo data.
#
# Usage: ./setup-simulation-cron.sh [OPTIONS]
#
# Options:
#   --remove    Remove the simulation cron job instead of adding it
#   --status    Check if simulation cron job is installed
#   --dry-run   Show what would be done without making changes
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/mindlog-simulation.log}"
CRON_MARKER="# MindLog Live Simulation"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    # Check if DATABASE_URL is set or .env exists
    if [[ -z "$DATABASE_URL" ]]; then
        if [[ -f "$PROJECT_ROOT/.env" ]]; then
            print_info "DATABASE_URL not set, will source from .env file"
        elif [[ -f "$PROJECT_ROOT/packages/db/.env" ]]; then
            print_info "DATABASE_URL not set, will source from packages/db/.env file"
        else
            print_error "DATABASE_URL environment variable not set and no .env file found"
            echo ""
            echo "Please set DATABASE_URL or create a .env file with:"
            echo "  DATABASE_URL=postgresql://user:password@host:port/database"
            exit 1
        fi
    fi

    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed or not in PATH"
        exit 1
    fi

    # Check if the simulation script exists
    if [[ ! -f "$PROJECT_ROOT/packages/db/src/live-simulation.ts" ]]; then
        print_error "Simulation script not found at packages/db/src/live-simulation.ts"
        exit 1
    fi

    print_success "Prerequisites check passed"
}

# Generate the cron command
generate_cron_command() {
    local env_source=""

    if [[ -n "$DATABASE_URL" ]]; then
        env_source="DATABASE_URL=\"$DATABASE_URL\""
    elif [[ -f "$PROJECT_ROOT/.env" ]]; then
        env_source="set -a && source $PROJECT_ROOT/.env && set +a"
    elif [[ -f "$PROJECT_ROOT/packages/db/.env" ]]; then
        env_source="set -a && source $PROJECT_ROOT/packages/db/.env && set +a"
    fi

    echo "0 6,14,22 * * * cd $PROJECT_ROOT && $env_source && npm run db:simulate >> $LOG_FILE 2>&1 $CRON_MARKER"
}

# Check current status
check_status() {
    if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        print_success "MindLog simulation cron job is INSTALLED"
        echo ""
        echo "Current cron entry:"
        crontab -l | grep "$CRON_MARKER"
        echo ""
        echo "Schedule: 6:00 AM, 2:00 PM, 10:00 PM daily"
        echo "Log file: $LOG_FILE"
        return 0
    else
        print_warning "MindLog simulation cron job is NOT installed"
        return 1
    fi
}

# Add cron job
add_cron_job() {
    local dry_run=$1
    local cron_command=$(generate_cron_command)

    # Check if already installed
    if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        print_warning "Cron job already exists. Updating..."
        remove_cron_job "$dry_run" quiet
    fi

    if [[ "$dry_run" == "true" ]]; then
        print_info "[DRY RUN] Would add cron job:"
        echo ""
        echo "  $cron_command"
        echo ""
        return 0
    fi

    # Add to crontab
    (crontab -l 2>/dev/null || true; echo "$cron_command") | crontab -

    print_success "Cron job added successfully!"
    echo ""
    echo "Schedule: Every day at 6:00 AM, 2:00 PM, and 10:00 PM"
    echo "Log file: $LOG_FILE"
    echo ""
    echo "To view logs:  tail -f $LOG_FILE"
    echo "To remove:     $0 --remove"
    echo "To check:      $0 --status"
}

# Remove cron job
remove_cron_job() {
    local dry_run=$1
    local quiet=$2

    if ! crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        [[ "$quiet" != "quiet" ]] && print_warning "No MindLog simulation cron job found"
        return 0
    fi

    if [[ "$dry_run" == "true" ]]; then
        print_info "[DRY RUN] Would remove cron job"
        return 0
    fi

    crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | crontab -

    [[ "$quiet" != "quiet" ]] && print_success "Cron job removed successfully"
}

# Run simulation once (for testing)
run_once() {
    print_info "Running simulation once..."
    cd "$PROJECT_ROOT"
    npm run db:simulate -- --verbose
}

# Main
main() {
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  MindLog Live Simulation - Cron Setup"
    echo "════════════════════════════════════════════════════════"
    echo ""

    local action="add"
    local dry_run="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --remove)
                action="remove"
                shift
                ;;
            --status)
                action="status"
                shift
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            --run-once)
                action="run-once"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --remove    Remove the simulation cron job"
                echo "  --status    Check if cron job is installed"
                echo "  --dry-run   Preview changes without applying them"
                echo "  --run-once  Run the simulation once (for testing)"
                echo "  --help      Show this help message"
                echo ""
                echo "Environment:"
                echo "  DATABASE_URL   PostgreSQL connection string (required)"
                echo "  LOG_FILE       Log file path (default: /tmp/mindlog-simulation.log)"
                echo ""
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    case $action in
        add)
            check_prerequisites
            add_cron_job "$dry_run"
            ;;
        remove)
            remove_cron_job "$dry_run"
            ;;
        status)
            check_status
            ;;
        run-once)
            check_prerequisites
            run_once
            ;;
    esac

    echo ""
}

main "$@"
