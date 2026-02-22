// =============================================================================
// MindLog Web — UI store
// Lightweight cross-component state for page-level metadata.
// Follows the same minimal pub/sub pattern as auth.ts.
// =============================================================================

import { useState, useEffect } from 'react';

interface UiState {
  /** Full name of the patient currently shown in PatientDetailPage, or null. */
  patientName: string | null;
}

type Listener = () => void;

let state: UiState = {
  patientName: null,
};

const listeners = new Set<Listener>();

function setState(partial: Partial<UiState>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

function getState(): UiState {
  return state;
}

export function useUiStore<T>(selector: (s: UiState) => T): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return selector(getState());
}

export const uiActions = {
  setPatientName(name: string | null): void {
    setState({ patientName: name });
  },
};
