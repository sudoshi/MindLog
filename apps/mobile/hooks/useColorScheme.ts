// =============================================================================
// MindLog Mobile — useColorScheme hook
// Wraps React Native's useColorScheme and respects:
//  1. User override stored in SecureStore (system / light / dark)
//  2. OS system preference as fallback
//
// Returns { isDark, scheme, preference, setOverride }
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const OVERRIDE_KEY = 'ml_colour_scheme';

export type SchemePref = 'system' | 'light' | 'dark';

export interface UseColorSchemeResult {
  isDark:      boolean;
  scheme:      'light' | 'dark';
  preference:  SchemePref;
  setOverride: (pref: SchemePref) => Promise<void>;
}

export function useColorScheme(): UseColorSchemeResult {
  const systemScheme = useRNColorScheme() ?? 'dark'; // default dark (matches app palette)
  const [preference, setPreference] = useState<SchemePref>('system');

  // Load stored preference on mount
  useEffect(() => {
    void SecureStore.getItemAsync(OVERRIDE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreference(stored);
      }
    });
  }, []);

  const setOverride = useCallback(async (pref: SchemePref) => {
    setPreference(pref);
    await SecureStore.setItemAsync(OVERRIDE_KEY, pref);
  }, []);

  const scheme: 'light' | 'dark' =
    preference === 'system' ? systemScheme : preference;

  return {
    isDark:      scheme === 'dark',
    scheme,
    preference,
    setOverride,
  };
}
