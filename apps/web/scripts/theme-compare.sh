#!/bin/bash

# =============================================================================
# Theme Screenshot Comparison Script
#
# Captures screenshots with both legacy and new themes for visual comparison.
# Results are saved to e2e/theme/__screenshots__/
#
# Usage:
#   ./scripts/theme-compare.sh baseline  # Capture baseline (legacy theme)
#   ./scripts/theme-compare.sh compare   # Capture new theme and compare
#   ./scripts/theme-compare.sh report    # Open comparison report
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCREENSHOTS_DIR="$PROJECT_DIR/e2e/theme/__screenshots__"

cd "$PROJECT_DIR"

case "$1" in
  baseline)
    echo "📸 Capturing baseline screenshots (legacy theme - dark-v1)..."
    echo ""

    # Ensure legacy theme is set
    if [ -f .env.local ]; then
      sed -i 's/VITE_USE_NEW_THEME=true/VITE_USE_NEW_THEME=false/' .env.local 2>/dev/null || true
    else
      echo "VITE_USE_NEW_THEME=false" > .env.local
    fi

    # Run screenshot tests with snapshot update
    VITE_USE_NEW_THEME=false npx playwright test e2e/theme/screenshots.spec.ts --update-snapshots

    echo ""
    echo "✅ Baseline screenshots captured to: $SCREENSHOTS_DIR"
    echo "   Run './scripts/theme-compare.sh compare' to compare with new theme"
    ;;

  compare)
    echo "📸 Capturing new theme screenshots (dark-v2) and comparing..."
    echo ""

    # Enable new theme
    if [ -f .env.local ]; then
      sed -i 's/VITE_USE_NEW_THEME=false/VITE_USE_NEW_THEME=true/' .env.local 2>/dev/null || true
    else
      echo "VITE_USE_NEW_THEME=true" > .env.local
    fi

    # Run screenshot tests (will fail if differences detected)
    VITE_USE_NEW_THEME=true npx playwright test e2e/theme/screenshots.spec.ts || true

    echo ""
    echo "📊 Comparison complete. Run './scripts/theme-compare.sh report' to view"

    # Restore legacy theme as default
    sed -i 's/VITE_USE_NEW_THEME=true/VITE_USE_NEW_THEME=false/' .env.local 2>/dev/null || true
    ;;

  report)
    echo "📊 Opening Playwright HTML report..."
    npx playwright show-report
    ;;

  *)
    echo "Theme Screenshot Comparison Tool"
    echo ""
    echo "Usage:"
    echo "  $0 baseline   Capture baseline screenshots (legacy theme)"
    echo "  $0 compare    Capture new theme screenshots and compare"
    echo "  $0 report     Open Playwright HTML report"
    echo ""
    echo "Workflow:"
    echo "  1. Run '$0 baseline' to capture reference screenshots"
    echo "  2. Run '$0 compare' to see differences with new theme"
    echo "  3. Run '$0 report' to view detailed comparison report"
    exit 1
    ;;
esac
