# MindLog Design System v2.1
## Dark Theme — Clinical Intelligence Platform

---

## Overview

MindLog v2.1 uses a dark theme design system with a **dark crimson / gold / dark grey** color palette. This document describes the implemented CSS architecture, tokens, and component styles.

### Design Philosophy

1. **Clinical Clarity** — High-contrast dark theme reduces eye strain during extended use
2. **Warm Precision** — Dark crimson primary with gold accents for mental health contexts
3. **Modular Architecture** — CSS custom properties with component-based styling
4. **Accessible** — WCAG 2.1 AA compliant with visible focus states

---

## Color System

### Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#9B1B30` | Primary brand, buttons, avatars |
| `--primary-light` | `#B82D42` | Hover states |
| `--primary-dark` | `#6A1220` | Pressed states, gradients |
| `--primary-bg` | `rgba(155, 27, 48, 0.15)` | Primary backgrounds |
| `--accent` | `#C9A227` | Links, highlights, active tabs |
| `--accent-light` | `#D4B340` | Accent hover |

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-base` | `#0E0E11` | Page background |
| `--surface-raised` | `#151518` | Cards, panels |
| `--surface-overlay` | `#1C1C20` | Hover states, dropdowns |
| `--sidebar-bg` | `#0B0B0E` | Sidebar background |
| `--topbar-bg` | `#151518` | Topbar background |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F0EDE8` | Primary text, headings |
| `--text-secondary` | `#C5C0B8` | Secondary text, labels |
| `--text-muted` | `#8A857D` | Muted/helper text |
| `--text-inverse` | `#0A1610` | Text on light backgrounds |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--critical` | `#E85A6B` | Errors, crisis states |
| `--critical-bg` | `rgba(232, 90, 107, 0.15)` | Critical backgrounds |
| `--warning` | `#E5A84B` | Warnings, cautions |
| `--warning-bg` | `rgba(229, 168, 75, 0.15)` | Warning backgrounds |
| `--success` | `#2DD4BF` | Success, safe states |
| `--success-bg` | `rgba(45, 212, 191, 0.15)` | Success backgrounds |
| `--info` | `#60A5FA` | Information |
| `--info-bg` | `rgba(96, 165, 250, 0.15)` | Info backgrounds |

### Risk Level Colors

| Level | Color | Token |
|-------|-------|-------|
| Crisis | `#E85A6B` | `--critical` |
| High | `#F97316` | `--risk-high` |
| Moderate | `#EAB308` | `--risk-moderate` |
| Low | `#2DD4BF` | `--success` |
| Minimal | `#8A857D` | `--text-muted` |

### Mood Colors (1-10 scale)

| Mood | Color | Token |
|------|-------|-------|
| 1-2 | `#E85A6B` | `--mood-1`, `--mood-2` |
| 3-4 | `#F97316` | `--mood-3`, `--mood-4` |
| 5-6 | `#EAB308` | `--mood-5`, `--mood-6` |
| 7-8 | `#5BB8A0` | `--mood-7`, `--mood-8` |
| 9-10 | `#2DD4BF` | `--mood-9`, `--mood-10` |

### Border Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(42, 42, 48, 0.6)` | Subtle dividers |
| `--border-default` | `#2A2A30` | Default borders |
| `--border-hover` | `#A68B1F` | Hover borders (gold) |

---

## Typography

### Font Stack

```css
--font-display: 'Crimson Pro', Georgia, serif;
--font-heading: 'Source Serif 4', Georgia, serif;
--font-body: 'Source Sans 3', 'Helvetica Neue', sans-serif;
--font-mono: 'IBM Plex Mono', Consolas, monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 11px | 400 | 1.4 | Captions, overlines |
| `--text-sm` | 13px | 400 | 1.5 | Secondary text |
| `--text-base` | 14px | 400 | 1.5 | Default body |
| `--text-lg` | 16px | 400 | 1.6 | Lead text |
| `--text-xl` | 18px | 600 | 1.4 | Subsection headers |
| `--text-2xl` | 22px | 600 | 1.35 | Card titles |
| `--text-3xl` | 28px | 600 | 1.3 | Section headers |
| `--text-4xl` | 36px | 700 | 1.2 | Page titles |

---

## Spacing System

Base unit: **4px**

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight spacing |
| `--space-2` | 8px | Related elements |
| `--space-3` | 12px | Form gaps |
| `--space-4` | 16px | Standard padding |
| `--space-5` | 20px | Card padding |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Major sections |
| `--space-10` | 40px | Page margins |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, inputs |
| `--radius-md` | 8px | Cards, dropdowns |
| `--radius-lg` | 12px | Modals, panels |
| `--radius-xl` | 16px | Large cards |
| `--radius-full` | 9999px | Pills, avatars |

---

## Panel Gradients

Panels use subtle diagonal gradient overlays for depth and elegance, layered on top of their solid background color.

### Gradient Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--gradient-panel` | `linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%)` | Primary panels, cards, tab-cards |
| `--gradient-panel-raised` | `linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)` | Elevated cards (metric, detail header) |
| `--gradient-panel-inset` | `linear-gradient(135deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 100%)` | Nested/inset cards (stat-cell, inner-card) |

### Top-Edge Shimmer

Primary panels (`.panel`, `.metric-card`) include a 1px horizontal shimmer pseudo-element at the top edge for a subtle highlight effect.

---

## Padding Tiers

| Tier | Value | Token | Usage |
|------|-------|-------|-------|
| Compact | 16px | `--space-4` | Nested cards, inline items, dense data |
| Standard | 20px | `--space-5` | All primary panels |
| Spacious | 24px | `--space-6` | Page-level headers, hero sections |
| Empty state | 48px | `--space-12` | Empty/placeholder panels |

### Minimum Font Size

All text must be **12px minimum**. The only exception is all-caps labels with increased `letter-spacing` (e.g., `text-transform: uppercase; letter-spacing: 0.8px`) which may use 11px.

---

## CSS Architecture

### File Structure

```
apps/web/src/styles/
├── main.css                 # Entry point
├── themes/
│   ├── tokens-base.css      # Spacing, typography, radius
│   ├── tokens-dark.css      # Dark theme colors
│   ├── compat.css           # Legacy variable aliases
│   └── index.css            # Theme loader
├── components/
│   ├── layout.css           # Sidebar, topbar, content
│   ├── navigation.css       # Nav items, tabs, badges
│   ├── badges.css           # Status badges, risk indicators
│   ├── cards.css            # Metric cards, panels
│   ├── tables.css           # Patient tables, data grids
│   ├── forms.css            # Inputs, buttons, filters
│   ├── alerts.css           # Alert cards, toasts
│   └── modals.css           # Modal dialogs, overlays
└── theme-legacy-backup.css  # Archived v1 theme
```

### Import Order

```css
/* main.css */
@import 'themes/index.css';           /* Tokens first */
@import 'components/layout.css';      /* Layout */
@import 'components/navigation.css';  /* Nav */
@import 'components/badges.css';      /* Badges */
@import 'components/cards.css';       /* Cards */
@import 'components/tables.css';      /* Tables */
@import 'components/forms.css';       /* Forms */
@import 'components/alerts.css';      /* Alerts */
@import 'components/modals.css';      /* Modals */
```

---

## Layout Components

### Application Shell

```
┌─────────────────────────────────────────────────────────┐
│  Topbar (56px) — Title, Actions, WebSocket Status       │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │              Main Content                    │
│ (240px)  │                                              │
│          │  ┌────────────────────────────────────────┐  │
│ • Brand  │  │  Page Header (optional)                │  │
│ • User   │  ├────────────────────────────────────────┤  │
│ • Nav    │  │                                        │  │
│ • Footer │  │  Content Area (.view, .view-pad)       │  │
│          │  │                                        │  │
│          │  │  (Cards, Tables, Grids)                │  │
│          │  │                                        │  │
│          │  └────────────────────────────────────────┘  │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### Key Layout Classes

| Class | Description |
|-------|-------------|
| `.app` | Root container, flex row |
| `.sidebar` | Fixed left sidebar (240px) |
| `.sidebar-brand` | Logo/brand area |
| `.clinician-badge` | User info badge |
| `.nav-section` | Nav group with label |
| `.nav-item` | Navigation link |
| `.sidebar-footer` | Logout button area |
| `.topbar` | Top navigation bar |
| `.topbar-title-group` | Title and subtitle |
| `.topbar-btn` | Topbar action button |
| `.ws-indicator` | WebSocket status |
| `.content` | Main content area |
| `.view`, `.view-pad` | Page container |

### Multi-Column Layouts

```css
.two-col   /* 2 equal columns */
.three-col /* 3 equal columns */
```

### Animations

```css
.anim      /* Fade-in animation */
.anim-d1   /* Delay 100ms */
.anim-d2   /* Delay 200ms */
.anim-d3   /* Delay 300ms */
.anim-d4   /* Delay 400ms */
```

---

## Component Classes

### Navigation

| Class | Description |
|-------|-------------|
| `.nav-item` | Base nav link |
| `.nav-item.active` | Active state (gold text) |
| `.nav-item:hover` | Hover state |
| `.nav-badge` | Badge on nav item |
| `.nav-badge.critical` | Critical count badge |

### Badges

| Class | Description |
|-------|-------------|
| `.badge` | Base badge |
| `.badge-crisis` | Crisis state (red) |
| `.badge-high` | High risk (orange) |
| `.badge-moderate` | Moderate risk (yellow) |
| `.badge-low` | Low risk (teal) |
| `.badge-stable` | Stable/active (teal) |
| `.badge-inactive` | Inactive (muted) |
| `.badge-role-admin` | Admin role badge |
| `.badge-role-clinician` | Clinician role badge |

### Cards & Panels

| Class | Description |
|-------|-------------|
| `.panel` | Card container |
| `.panel-header` | Card header with title |
| `.panel-title` | Card title text |
| `.panel-sub` | Subtitle text |
| `.panel-action` | Header action button |
| `.panel-body` | Card body content |
| `.metric-card` | KPI metric card |
| `.metric-value` | Large metric number |
| `.metric-label` | Metric description |
| `.metric-trend` | Trend indicator |

### Patient Detail

| Class | Description |
|-------|-------------|
| `.patient-detail-header` | Header container |
| `.detail-avatar` | Large avatar |
| `.detail-meta` | Meta info area |
| `.detail-name` | Patient name |
| `.detail-badges` | Badge container |
| `.detail-chips` | Chip container |
| `.detail-chip` | Info chip |
| `.detail-actions` | Action buttons |
| `.detail-tab-bar` | Tab navigation |
| `.detail-tab` | Individual tab |
| `.detail-tab.active` | Active tab (gold) |

### Tab Content

| Class | Description |
|-------|-------------|
| `.tab-card` | Tab content card |
| `.tab-section-title` | Section heading |
| `.tab-stat-grid` | Stats grid |
| `.tab-stat-cell` | Stat cell |
| `.tab-stat-value` | Stat number |
| `.tab-stat-label` | Stat description |
| `.tab-inner-card` | Nested card |
| `.tab-loading` | Loading state |
| `.tab-empty` | Empty state |

### Tables

| Class | Description |
|-------|-------------|
| `.data-table` | Base table |
| `.data-table th` | Header cell |
| `.data-table td` | Data cell |
| `.data-table tr:hover` | Row hover |
| `.data-table tr.crisis` | Crisis row highlight |
| `.mood-display` | Mood cell container |
| `.mood-dot` | Individual mood dot |
| `.streak` | Streak indicator |

### Forms

| Class | Description |
|-------|-------------|
| `.form-input` | Text input |
| `.form-select` | Select dropdown |
| `.form-label` | Input label |
| `.filter-bar` | Filter container |
| `.filter-chip` | Filter chip button |
| `.filter-chip.active` | Active filter |
| `.search-input` | Search input |
| `.btn` | Base button |
| `.btn-primary` | Primary button (burgundy) |
| `.btn-secondary` | Secondary button |
| `.btn-ghost` | Ghost button |
| `.btn-submit` | Form submit button |
| `.btn:disabled` | Disabled state |
| `.btn.loading` | Loading state |

### Alerts

| Class | Description |
|-------|-------------|
| `.alert-card` | Alert container |
| `.alert-card.critical` | Critical alert |
| `.alert-card.warning` | Warning alert |
| `.alert-card.info` | Info alert |
| `.alert-strip` | Inline alert banner |
| `.alert-item` | Alert list item |
| `.alert-item-icon` | Item icon |
| `.alert-item-content` | Item content |
| `.alert-item-title` | Item title |
| `.alert-item-body` | Item description |
| `.alert-item-footer` | Item actions |
| `.severity-badge` | Severity indicator |

### Modals

| Class | Description |
|-------|-------------|
| `.modal-overlay` | Backdrop |
| `.modal-container` | Modal box |
| `.modal-header` | Header with title |
| `.modal-title` | Modal title |
| `.modal-close` | Close button |
| `.modal-body` | Content area |
| `.modal-footer` | Actions area |

---

## Interactive States

### Focus Ring

```css
--focus-ring: 0 0 0 3px rgba(201, 162, 39, 0.4);
```

Gold focus ring for accessibility on all interactive elements.

### Hover States

- Buttons: Background lightens, subtle lift
- Cards: Background changes to `--surface-overlay`
- Table rows: Background highlight
- Nav items: Background highlight, text brightens

### Disabled States

```css
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### Loading States

```css
.btn.loading {
  position: relative;
  color: transparent !important;
  pointer-events: none;
}
/* Spinner overlay */
```

---

## Accessibility

### Color Contrast

All text combinations meet WCAG 2.1 AA standards:
- Primary text on surface: 12.5:1
- Secondary text on surface: 8.2:1
- Muted text on surface: 5.1:1

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Keyboard Navigation

- All interactive elements are focusable
- Focus order follows visual layout
- Modal traps focus within dialog
- Escape closes modals

### Semantic HTML

- Proper heading hierarchy
- ARIA labels on icon-only buttons
- Role attributes on custom widgets
- Live regions for dynamic content

---

## Theme Switching

### Runtime Theme Loading

```typescript
// src/styles/index.ts
const USE_LEGACY_THEME = import.meta.env.VITE_USE_LEGACY_THEME === 'true';

if (USE_LEGACY_THEME) {
  import('./theme-legacy-backup.css');
} else {
  import('./main.css');
}

export const themeConfig = {
  isNewTheme: !USE_LEGACY_THEME,
  name: USE_LEGACY_THEME ? 'dark-v1-legacy' : 'dark-v2',
} as const;
```

### Rollback to Legacy Theme

```bash
# In .env.local:
VITE_USE_LEGACY_THEME=true
```

This loads `theme-legacy-backup.css` instead of the new modular system.

---

## Legacy Compatibility

The `compat.css` file provides aliases for legacy variable names:

| Legacy Token | New Token |
|--------------|-----------|
| `--glass-02` | `rgba(...)` |
| `--glass-hi` | `rgba(...)` |
| `--r-xs` | `--radius-sm` |
| `--r-sm` | `--radius-sm` |
| `--r-md` | `--radius-md` |
| `--r-lg` | `--radius-lg` |
| `--r-full` | `--radius-full` |
| `--border3` | `--border-default` |
| `--bg` | `--surface-base` |
| `--panel` | `--surface-raised` |
| `--m1` - `--m10` | `--mood-1` - `--mood-10` |

---

## Testing

### Visual Regression

```bash
# Run screenshot tests
npx playwright test e2e/theme/screenshots.spec.ts

# Update baselines
npx playwright test e2e/theme/screenshots.spec.ts --update-snapshots
```

### Component Verification

```bash
npx playwright test e2e/theme/components.spec.ts
```

### Accessibility Tests

```bash
npx playwright test e2e/theme/accessibility.spec.ts
```

### All Theme Tests

```bash
npx playwright test e2e/theme/
```

---

## Resources

- **Migration Plan**: `apps/web/design/THEME_MIGRATION_PLAN.md`
- **Token Definitions**: `apps/web/src/styles/themes/tokens-*.css`
- **Component Styles**: `apps/web/src/styles/components/*.css`
- **Legacy Backup**: `apps/web/src/styles/theme-legacy-backup.css`
- **E2E Tests**: `apps/web/e2e/theme/*.spec.ts`

---

## Changelog

### v2.2 — Panel Elegance & Legibility Pass (February 2026)
- Added `--gradient-panel`, `--gradient-panel-raised`, `--gradient-panel-inset` tokens
- All panels now use subtle 135deg diagonal gradient overlays for depth
- Top-edge shimmer highlight on `.panel` and `.metric-card` via `::before`
- Inner cards (`.tab-inner-card`, `.care-member`) gained border + inset gradient
- Standardised padding tiers: Compact (16px), Standard (20px), Spacious (24px), Empty (48px)
- Minimum font size enforced at 12px (except uppercase labels with letter-spacing)
- Updated wireframe HTMLs and design tokens to match

### v2.1 (February 2026)
- Color palette update: dark crimson + gold + dark grey
- Replaced forest green backgrounds with neutral dark greys; migrated success/safe greens to warm teal
- Primary shifted from muted burgundy (#6B1E2E) to richer crimson (#9B1B30)
- All surface/border tokens updated to grey-neutral

### v2.0 (February 2026)
- New dark theme with burgundy/forest/gold palette
- Modular CSS architecture with tokens
- Feature flag-based theme switching
- Automated visual regression tests
- Accessibility improvements (focus rings, reduced motion)
- Legacy theme archived for rollback

### v1.0 (Original)
- Light theme with crimson/gold palette
- Single CSS file architecture
- Archived as `theme-legacy-backup.css`

---

*Last Updated: February 2026*
