// =============================================================================
// MindLog Mobile — Design Tokens
// Single source of truth for all visual constants on the patient-facing app.
// Based on the MindLog wireframe spec (COPEApp-Prototype/mindlog-wireframes.html)
// and reconciled with the dark-themed implementation palette.
//
// Font registration names correspond to the useFonts() map in _layout.tsx:
//   'Fraunces'       → Fraunces_400Regular  (serif display)
//   'Fraunces_Italic'→ Fraunces_400Regular_Italic
//   'Figtree'        → Figtree_400Regular   (sans body)
//   'Figtree_Medium' → Figtree_500Medium
//   'Figtree_SemiBold'→ Figtree_600SemiBold
//   'Figtree_Bold'   → Figtree_700Bold
// =============================================================================

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Typography — font families
// ---------------------------------------------------------------------------

export const FONTS = {
  /** Fraunces 400 Regular — for greeting headings, display numbers */
  SERIF: 'Fraunces',
  /** Fraunces 400 Italic — for emphasis in display text */
  SERIF_ITALIC: 'Fraunces_Italic',
  /** Figtree 400 Regular — body text, labels */
  SANS: 'Figtree',
  /** Figtree 500 Medium — secondary labels, nav items */
  SANS_MEDIUM: 'Figtree_Medium',
  /** Figtree 600 SemiBold — card titles, section headers, buttons */
  SANS_SEMIBOLD: 'Figtree_SemiBold',
  /** Figtree 700 Bold — primary headings, stats, values */
  SANS_BOLD: 'Figtree_Bold',
} as const;

// ---------------------------------------------------------------------------
// Typography — sizes (matches prototype CSS: xs=11, sm=13, base=15, …)
// ---------------------------------------------------------------------------

export const FONT_SIZE = {
  XS:   11,
  SM:   13,
  BASE: 15,
  MD:   17,
  LG:   20,
  XL:   24,
  XXL:  30,
  XXXL: 38,
} as const;

// ---------------------------------------------------------------------------
// Typography — weights (React Native font weights as string literals)
// ---------------------------------------------------------------------------

export const FONT_WEIGHT = {
  REGULAR:   '400' as const,
  MEDIUM:    '500' as const,
  SEMIBOLD:  '600' as const,
  BOLD:      '700' as const,
} as const;

// ---------------------------------------------------------------------------
// Typography — line heights
// ---------------------------------------------------------------------------

export const LINE_HEIGHT = {
  TIGHT:  1.15,  // headings
  NORMAL: 1.45,  // body
  LOOSE:  1.65,  // small captions
} as const;

// ---------------------------------------------------------------------------
// Color palette — background & surfaces (dark theme)
// ---------------------------------------------------------------------------

export const COLOR = {
  // Background layers (deepest → elevated)
  BG:               '#0c0f18',
  SURFACE:          '#131825',
  SURFACE_2:        '#161a27',
  SURFACE_3:        '#1e2535',
  SURFACE_4:        '#252d40',

  // Card colors
  CARD:             '#161a27',
  CARD_ELEVATED:    '#1a2040',
  CARD_INPUT:       '#1a1f35',

  // Primary brand — teal
  PRIMARY:          '#2a9d8f',
  PRIMARY_DARK:     '#1d7a6f',
  PRIMARY_LIGHT:    '#3bbfb0',
  PRIMARY_MUTED:    'rgba(42,157,143,0.15)',

  // Text
  INK:              '#e2e8f0',
  INK_MID:          '#a0aec0',
  INK_SOFT:         '#8b9cb0',
  INK_GHOST:        '#4a5568',

  // Semantic — danger / safety / warning
  DANGER:           '#fc8181',
  DANGER_DARK:      '#d62828',
  DANGER_BG:        '#1a0a0a',
  DANGER_BORDER:    '#4a1010',

  SUCCESS:          '#22c55e',
  SUCCESS_DARK:     '#16a34a',
  SUCCESS_BG:       '#0a1a0a',
  SUCCESS_BORDER:   '#1e3a2f',

  WARNING:          '#faa307',
  WARNING_DARK:     '#c17c04',
  WARNING_BG:       '#1c1508',

  // Assessment / insight banners — blue tinted
  INSIGHT:          '#93c5fd',
  INSIGHT_BG:       '#1a1f35',
  INSIGHT_BORDER:   '#2a3a6a',
  INSIGHT_MUTED:    '#4a6a9a',

  // Offline indicator
  OFFLINE:          '#fc8181',
  ONLINE:           '#22c55e',

  // Dividers & borders
  BORDER:           'rgba(255,255,255,0.08)',
  BORDER_STRONG:    'rgba(255,255,255,0.14)',

  // Pure
  WHITE:            '#ffffff',
  BLACK:            '#000000',
  TRANSPARENT:      'transparent',
} as const;

// ---------------------------------------------------------------------------
// Mood color scale 1–10 (matches prototype & shared MOOD_COLORS)
// ---------------------------------------------------------------------------

export const MOOD_COLOR: Record<number, string> = {
  1:  '#d62c2c',
  2:  '#d62c2c',
  3:  '#e07a1a',
  4:  '#e07a1a',
  5:  '#c9972a',
  6:  '#c9972a',
  7:  '#5a8a6a',
  8:  '#5a8a6a',
  9:  '#2a6db5',
  10: '#2a6db5',
};

// ---------------------------------------------------------------------------
// Radius scale (exact prototype values: xs=6, sm=10, md=16, lg=22, xl=28)
// ---------------------------------------------------------------------------

export const RADIUS = {
  XS:   6,
  SM:   10,
  MD:   16,   // standard card
  LG:   22,   // large card / modal
  XL:   28,   // hero card
  FULL: 999,  // pill / badge
} as const;

// ---------------------------------------------------------------------------
// Spacing scale (4-point grid)
// ---------------------------------------------------------------------------

export const SPACE = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ---------------------------------------------------------------------------
// Shadows (platform-aware)
// ---------------------------------------------------------------------------

export const SHADOW = {
  SM: Platform.select({
    ios: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius:  6,
    },
    android: { elevation: 4 },
    default: {},
  }),
  MD: Platform.select({
    ios: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius:  12,
    },
    android: { elevation: 8 },
    default: {},
  }),
  LG: Platform.select({
    ios: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius:  20,
    },
    android: { elevation: 14 },
    default: {},
  }),
} as const;

// ---------------------------------------------------------------------------
// Gradients — [start, end] pairs for LinearGradient
// ---------------------------------------------------------------------------

export const GRADIENT = {
  /** Today screen header — dark teal */
  TODAY_HEADER:     ['#1a1f35', '#161a27'] as [string, string],
  /** Check-in header */
  CHECKIN_HEADER:   ['#1a3a30', '#0f2420'] as [string, string],
  /** Journal header */
  JOURNAL_HEADER:   ['#1e2a3a', '#131825'] as [string, string],
  /** Insights header */
  INSIGHTS_HEADER:  ['#1a1535', '#0f1025'] as [string, string],
  /** Quick-mood CTA button */
  CTA:              ['#2a9d8f', '#1d7a6f'] as [string, string],
  /** Mood high (mania/elevated) */
  MOOD_HIGH:        ['#22C55E', '#16A34A'] as [string, string],
  /** Mood low (depressed) */
  MOOD_LOW:         ['#EF4444', '#DC2626'] as [string, string],
  /** Medications card header */
  MEDS_HEADER:      ['#1a3a30', '#122216'] as [string, string],
  /** Insights teal-to-blue */
  INSIGHT_CARD:     ['#1a1f35', '#0f2535'] as [string, string],
} as const;

// ---------------------------------------------------------------------------
// Z-index scale
// ---------------------------------------------------------------------------

export const Z_INDEX = {
  BASE:    0,
  CARD:    10,
  OVERLAY: 50,
  MODAL:   100,
  TOAST:   200,
} as const;

// ---------------------------------------------------------------------------
// Animation durations (ms)
// ---------------------------------------------------------------------------

export const DURATION = {
  FAST:   150,
  NORMAL: 250,
  SLOW:   400,
  SPRING: 600,
} as const;
