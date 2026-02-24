/**
 * MindLog Theme Loader
 *
 * Loads the modular dark theme system (burgundy/forest/gold).
 * The new theme is now the default.
 *
 * Usage in main.tsx:
 *   import './styles';
 *
 * To rollback to legacy theme (for debugging):
 *   Set VITE_USE_LEGACY_THEME=true in .env.local
 *   (Legacy theme archived in theme-legacy-backup.css)
 */

const USE_LEGACY_THEME = import.meta.env.VITE_USE_LEGACY_THEME === 'true';

if (USE_LEGACY_THEME) {
  // Legacy glassmorphism theme (for rollback/debugging only)
  console.warn('[MindLog] Loading legacy theme - for debugging only');
  import('./theme-legacy-backup.css');
} else {
  // New modular dark theme system (default)
  import('./main.css');
}

// Export theme state for components that need to know
export const themeConfig = {
  isNewTheme: !USE_LEGACY_THEME,
  name: USE_LEGACY_THEME ? 'dark-v1-legacy' : 'dark-v2',
} as const;
