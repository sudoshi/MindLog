// =============================================================================
// MindLog Web — Color Palette Definitions
// Curated dark-mode palettes applied via CSS custom property overrides.
// Semantic colors (critical, warning, success, info) are NEVER overridden
// to preserve clinical safety meaning across all palettes.
// =============================================================================

export interface PaletteDefinition {
  id: string;
  name: string;
  description: string;
  /** Three preview hex colors: [primary, accent, surface] */
  preview: [string, string, string];
  /** CSS custom property overrides — empty for the default palette */
  variables: Record<string, string>;
}

export const PALETTES: PaletteDefinition[] = [
  // ── Default: Crimson & Gold (empty variables → CSS file values) ──────────
  {
    id: 'crimson-gold',
    name: 'Crimson & Gold',
    description: 'Default clinical theme — dark crimson with warm gold accents',
    preview: ['#9B1B30', '#C9A227', '#151518'],
    variables: {},
  },

  // ── Ocean ────────────────────────────────────────────────────────────────
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep sapphire blue with coral highlights',
    preview: ['#1B5E9B', '#E07850', '#0E1118'],
    variables: {
      '--primary': '#1B5E9B',
      '--primary-dark': '#124070',
      '--primary-light': '#2D78B8',
      '--primary-lighter': '#4090D0',
      '--primary-glow': 'rgba(27, 94, 155, 0.4)',
      '--primary-bg': 'rgba(27, 94, 155, 0.15)',
      '--primary-border': 'rgba(45, 120, 184, 0.4)',
      '--accent': '#E07850',
      '--accent-dark': '#C06040',
      '--accent-light': '#E89070',
      '--accent-lighter': '#F0A888',
      '--accent-muted': '#C06040',
      '--accent-pale': 'rgba(224, 120, 80, 0.15)',
      '--accent-bg': 'rgba(224, 120, 80, 0.1)',
      '--accent-glow': 'rgba(224, 120, 80, 0.3)',
      '--surface-darkest': '#06080C',
      '--surface-base': '#0C0E14',
      '--surface-raised': '#12151C',
      '--surface-overlay': '#1A1D25',
      '--surface-elevated': '#21252E',
      '--surface-accent': '#282D38',
      '--surface-highlight': '#303640',
      '--sidebar-bg': '#080A10',
      '--sidebar-bg-light': '#101318',
      '--text-primary': '#E8ECF0',
      '--text-secondary': '#B8BCC5',
      '--text-muted': '#7D828D',
      '--text-ghost': '#525760',
      '--text-disabled': '#404550',
      '--border-default': '#282D38',
      '--border-subtle': 'rgba(40, 45, 56, 0.6)',
      '--border-hover': '#C06040',
      '--border-focus': '#E07850',
      '--border-active': '#1B5E9B',
      '--gradient-panel': 'linear-gradient(135deg, rgba(27, 94, 155, 0.06) 0%, rgba(255,255,255,0.015) 100%)',
      '--gradient-panel-raised': 'linear-gradient(135deg, rgba(27, 94, 155, 0.08) 0%, rgba(255,255,255,0.02) 100%)',
      '--gradient-panel-inset': 'linear-gradient(135deg, rgba(0,0,0,0.25) 0%, rgba(27, 94, 155, 0.04) 100%)',
    },
  },

  // ── Forest ───────────────────────────────────────────────────────────────
  {
    id: 'forest',
    name: 'Forest',
    description: 'Emerald green with warm amber accents',
    preview: ['#1B7A4E', '#D4A028', '#0E1210'],
    variables: {
      '--primary': '#1B7A4E',
      '--primary-dark': '#125535',
      '--primary-light': '#2A9462',
      '--primary-lighter': '#38B078',
      '--primary-glow': 'rgba(27, 122, 78, 0.4)',
      '--primary-bg': 'rgba(27, 122, 78, 0.15)',
      '--primary-border': 'rgba(42, 148, 98, 0.4)',
      '--accent': '#D4A028',
      '--accent-dark': '#B08820',
      '--accent-light': '#E0B440',
      '--accent-lighter': '#ECC858',
      '--accent-muted': '#B08820',
      '--accent-pale': 'rgba(212, 160, 40, 0.15)',
      '--accent-bg': 'rgba(212, 160, 40, 0.1)',
      '--accent-glow': 'rgba(212, 160, 40, 0.3)',
      '--surface-darkest': '#070A08',
      '--surface-base': '#0C100E',
      '--surface-raised': '#131815',
      '--surface-overlay': '#1A201C',
      '--surface-elevated': '#222824',
      '--surface-accent': '#2A302C',
      '--surface-highlight': '#323834',
      '--sidebar-bg': '#0A0D0B',
      '--sidebar-bg-light': '#111614',
      '--text-primary': '#EAF0EC',
      '--text-secondary': '#BAC5BD',
      '--text-muted': '#7E8A80',
      '--text-ghost': '#545E56',
      '--text-disabled': '#424A44',
      '--border-default': '#2A302C',
      '--border-subtle': 'rgba(42, 48, 44, 0.6)',
      '--border-hover': '#B08820',
      '--border-focus': '#D4A028',
      '--border-active': '#1B7A4E',
      '--gradient-panel': 'linear-gradient(135deg, rgba(27, 122, 78, 0.06) 0%, rgba(255,255,255,0.015) 100%)',
      '--gradient-panel-raised': 'linear-gradient(135deg, rgba(27, 122, 78, 0.08) 0%, rgba(255,255,255,0.02) 100%)',
      '--gradient-panel-inset': 'linear-gradient(135deg, rgba(0,0,0,0.25) 0%, rgba(27, 122, 78, 0.04) 100%)',
    },
  },

  // ── Amethyst ─────────────────────────────────────────────────────────────
  {
    id: 'amethyst',
    name: 'Amethyst',
    description: 'Rich purple with soft rose accents',
    preview: ['#6B2FA0', '#E0607A', '#100E16'],
    variables: {
      '--primary': '#6B2FA0',
      '--primary-dark': '#4A2070',
      '--primary-light': '#8040B8',
      '--primary-lighter': '#9855D0',
      '--primary-glow': 'rgba(107, 47, 160, 0.4)',
      '--primary-bg': 'rgba(107, 47, 160, 0.15)',
      '--primary-border': 'rgba(128, 64, 184, 0.4)',
      '--accent': '#E0607A',
      '--accent-dark': '#C04860',
      '--accent-light': '#E87890',
      '--accent-lighter': '#F090A8',
      '--accent-muted': '#C04860',
      '--accent-pale': 'rgba(224, 96, 122, 0.15)',
      '--accent-bg': 'rgba(224, 96, 122, 0.1)',
      '--accent-glow': 'rgba(224, 96, 122, 0.3)',
      '--surface-darkest': '#08060C',
      '--surface-base': '#0E0C14',
      '--surface-raised': '#16131C',
      '--surface-overlay': '#1E1A26',
      '--surface-elevated': '#26222E',
      '--surface-accent': '#2E2A38',
      '--surface-highlight': '#363240',
      '--sidebar-bg': '#0A0812',
      '--sidebar-bg-light': '#121018',
      '--text-primary': '#EDE8F2',
      '--text-secondary': '#C0B8CA',
      '--text-muted': '#857D92',
      '--text-ghost': '#5A5268',
      '--text-disabled': '#454050',
      '--border-default': '#2E2A38',
      '--border-subtle': 'rgba(46, 42, 56, 0.6)',
      '--border-hover': '#C04860',
      '--border-focus': '#E0607A',
      '--border-active': '#6B2FA0',
      '--gradient-panel': 'linear-gradient(135deg, rgba(107, 47, 160, 0.06) 0%, rgba(255,255,255,0.015) 100%)',
      '--gradient-panel-raised': 'linear-gradient(135deg, rgba(107, 47, 160, 0.08) 0%, rgba(255,255,255,0.02) 100%)',
      '--gradient-panel-inset': 'linear-gradient(135deg, rgba(0,0,0,0.25) 0%, rgba(107, 47, 160, 0.04) 100%)',
    },
  },

  // ── Midnight ─────────────────────────────────────────────────────────────
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep teal with warm orange highlights',
    preview: ['#0D7377', '#E08A40', '#0C1012'],
    variables: {
      '--primary': '#0D7377',
      '--primary-dark': '#095052',
      '--primary-light': '#158D92',
      '--primary-lighter': '#20A8AE',
      '--primary-glow': 'rgba(13, 115, 119, 0.4)',
      '--primary-bg': 'rgba(13, 115, 119, 0.15)',
      '--primary-border': 'rgba(21, 141, 146, 0.4)',
      '--accent': '#E08A40',
      '--accent-dark': '#C07030',
      '--accent-light': '#E8A060',
      '--accent-lighter': '#F0B878',
      '--accent-muted': '#C07030',
      '--accent-pale': 'rgba(224, 138, 64, 0.15)',
      '--accent-bg': 'rgba(224, 138, 64, 0.1)',
      '--accent-glow': 'rgba(224, 138, 64, 0.3)',
      '--surface-darkest': '#060A0A',
      '--surface-base': '#0A0F10',
      '--surface-raised': '#111818',
      '--surface-overlay': '#182020',
      '--surface-elevated': '#202828',
      '--surface-accent': '#283032',
      '--surface-highlight': '#30383A',
      '--sidebar-bg': '#080C0D',
      '--sidebar-bg-light': '#0F1415',
      '--text-primary': '#E8F0F0',
      '--text-secondary': '#B8C5C5',
      '--text-muted': '#7D8A8A',
      '--text-ghost': '#525D5D',
      '--text-disabled': '#404848',
      '--border-default': '#283032',
      '--border-subtle': 'rgba(40, 48, 50, 0.6)',
      '--border-hover': '#C07030',
      '--border-focus': '#E08A40',
      '--border-active': '#0D7377',
      '--gradient-panel': 'linear-gradient(135deg, rgba(13, 115, 119, 0.06) 0%, rgba(255,255,255,0.015) 100%)',
      '--gradient-panel-raised': 'linear-gradient(135deg, rgba(13, 115, 119, 0.08) 0%, rgba(255,255,255,0.02) 100%)',
      '--gradient-panel-inset': 'linear-gradient(135deg, rgba(0,0,0,0.25) 0%, rgba(13, 115, 119, 0.04) 100%)',
    },
  },

  // ── Slate ────────────────────────────────────────────────────────────────
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool steel blue with fresh mint accents',
    preview: ['#4A6FA5', '#50C8A0', '#0E1014'],
    variables: {
      '--primary': '#4A6FA5',
      '--primary-dark': '#354E78',
      '--primary-light': '#5C84BA',
      '--primary-lighter': '#709AD0',
      '--primary-glow': 'rgba(74, 111, 165, 0.4)',
      '--primary-bg': 'rgba(74, 111, 165, 0.15)',
      '--primary-border': 'rgba(92, 132, 186, 0.4)',
      '--accent': '#50C8A0',
      '--accent-dark': '#3AA880',
      '--accent-light': '#68D8B4',
      '--accent-lighter': '#80E8C8',
      '--accent-muted': '#3AA880',
      '--accent-pale': 'rgba(80, 200, 160, 0.15)',
      '--accent-bg': 'rgba(80, 200, 160, 0.1)',
      '--accent-glow': 'rgba(80, 200, 160, 0.3)',
      '--surface-darkest': '#080910',
      '--surface-base': '#0C0E14',
      '--surface-raised': '#13161E',
      '--surface-overlay': '#1A1E26',
      '--surface-elevated': '#22262E',
      '--surface-accent': '#2A2E38',
      '--surface-highlight': '#323640',
      '--sidebar-bg': '#0A0B10',
      '--sidebar-bg-light': '#101318',
      '--text-primary': '#E8EAF0',
      '--text-secondary': '#B5BAC5',
      '--text-muted': '#7C828D',
      '--text-ghost': '#525760',
      '--text-disabled': '#404550',
      '--border-default': '#2A2E38',
      '--border-subtle': 'rgba(42, 46, 56, 0.6)',
      '--border-hover': '#3AA880',
      '--border-focus': '#50C8A0',
      '--border-active': '#4A6FA5',
      '--gradient-panel': 'linear-gradient(135deg, rgba(74, 111, 165, 0.06) 0%, rgba(255,255,255,0.015) 100%)',
      '--gradient-panel-raised': 'linear-gradient(135deg, rgba(74, 111, 165, 0.08) 0%, rgba(255,255,255,0.02) 100%)',
      '--gradient-panel-inset': 'linear-gradient(135deg, rgba(0,0,0,0.25) 0%, rgba(74, 111, 165, 0.04) 100%)',
    },
  },
];

/** All CSS variable names managed by the palette system. */
const MANAGED_VARIABLES = [
  '--primary', '--primary-dark', '--primary-light', '--primary-lighter',
  '--primary-glow', '--primary-bg', '--primary-border',
  '--accent', '--accent-dark', '--accent-light', '--accent-lighter',
  '--accent-muted', '--accent-pale', '--accent-bg', '--accent-glow',
  '--surface-darkest', '--surface-base', '--surface-raised', '--surface-overlay',
  '--surface-elevated', '--surface-accent', '--surface-highlight',
  '--sidebar-bg', '--sidebar-bg-light',
  '--text-primary', '--text-secondary', '--text-muted', '--text-ghost', '--text-disabled',
  '--border-default', '--border-subtle', '--border-hover', '--border-focus', '--border-active',
  '--gradient-panel', '--gradient-panel-raised', '--gradient-panel-inset',
];

/**
 * Applies a palette by setting/removing CSS custom properties on :root.
 * The default palette clears all overrides so CSS file values take over.
 */
export function applyPalette(id: string): void {
  const palette = PALETTES.find((p) => p.id === id);
  if (!palette) return;

  const style = document.documentElement.style;

  // Clear all managed variables first (restores CSS file defaults)
  for (const varName of MANAGED_VARIABLES) {
    style.removeProperty(varName);
  }

  // Apply the new palette's overrides (empty for default)
  for (const [varName, value] of Object.entries(palette.variables)) {
    style.setProperty(varName, value);
  }
}
