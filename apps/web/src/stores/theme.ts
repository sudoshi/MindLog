// =============================================================================
// MindLog Web — Theme store
// Persists palette selection to localStorage and applies CSS overrides.
// Follows the same minimal pub/sub pattern as auth.ts and ui.ts.
// =============================================================================

import { useState, useEffect } from 'react';
import { applyPalette } from '../styles/palettes.js';

const STORAGE_KEY = 'ml_palette';
const DEFAULT_PALETTE = 'crimson-gold';

interface ThemeState {
  paletteId: string;
}

type Listener = () => void;

let state: ThemeState = {
  paletteId: DEFAULT_PALETTE,
};

const listeners = new Set<Listener>();

function setState(partial: Partial<ThemeState>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

function getState(): ThemeState {
  return state;
}

export function useThemeStore<T>(selector: (s: ThemeState) => T): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return selector(getState());
}

export const themeActions = {
  /** Read stored palette from localStorage and apply it before first render. */
  initFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const id = stored ?? DEFAULT_PALETTE;
      applyPalette(id);
      setState({ paletteId: id });
    } catch {
      // localStorage unavailable — keep default
    }
  },

  /** Switch palette, apply CSS overrides, and persist. */
  setPalette(id: string): void {
    applyPalette(id);
    setState({ paletteId: id });
    try {
      if (id === DEFAULT_PALETTE) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, id);
      }
    } catch {
      // localStorage unavailable — still applied in-memory
    }
  },
};
