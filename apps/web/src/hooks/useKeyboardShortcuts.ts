// =============================================================================
// MindLog Web — useKeyboardShortcuts hook
// Registers global keyboard shortcuts for the clinician dashboard.
//
// Shortcuts (only fire when not typing in an input):
//   /  or  ⌘K   → open global search
//   N           → open quick note panel
//   A           → navigate to Alerts page
//   P           → navigate to Patients page
//   ?           → open keyboard shortcuts help overlay
// =============================================================================

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onOpenSearch: () => void;
  onOpenQuickNote: () => void;
  onShowHelp: () => void;
}

export function useKeyboardShortcuts({
  onOpenSearch,
  onOpenQuickNote,
  onShowHelp,
}: ShortcutHandlers): void {
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable;

      // ⌘K / Ctrl+K — global search (fires even when typing, mimics Spotlight)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenSearch();
        return;
      }

      // Skip remaining shortcuts when user is typing
      if (isTyping) return;

      // Escape — let individual modals handle their own close via their own listener
      if (e.key === 'Escape') return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          onOpenSearch();
          break;

        case 'n':
        case 'N':
          e.preventDefault();
          onOpenQuickNote();
          break;

        case 'a':
        case 'A':
          void navigate('/alerts');
          break;

        case 'p':
        case 'P':
          void navigate('/patients');
          break;

        case '?':
          onShowHelp();
          break;

        default:
          break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onOpenSearch, onOpenQuickNote, onShowHelp]);
}
