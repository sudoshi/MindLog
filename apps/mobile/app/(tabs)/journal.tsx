// =============================================================================
// MindLog Mobile — Journal tab
// =============================================================================

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { COLOR, FONTS } from '../../constants/DesignTokens';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '../../services/auth';
import { SkeletonCard } from '../../components/SkeletonCard';
import { VoiceRecorder } from '../../components/VoiceRecorder';

interface JournalEntry {
  id: string;
  entry_date: string;
  word_count: number;
  shared_with_clinician: boolean;
  created_at: string;
}

export default function JournalScreen() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVoice, setShowVoice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/journal');
      if (!res.ok) throw new Error(`Failed to load journal (${res.status})`);
      const json = (await res.json()) as { data: { items: JournalEntry[] } };
      setEntries(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // When a voice transcript arrives, navigate to the new entry screen
  // and pre-populate the body with the transcribed text.
  const handleTranscript = useCallback((text: string) => {
    setShowVoice(false);
    router.push({ pathname: '/checkin', params: { step: 'journal', prefill: encodeURIComponent(text) } });
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Journal</Text>
        <View style={styles.headerBtns}>
          {/* Voice journal shortcut */}
          <TouchableOpacity
            style={styles.micBtn}
            onPress={() => setShowVoice(true)}
            accessibilityLabel="Record a voice journal entry"
            accessibilityRole="button"
          >
            <Text style={styles.micBtnText}>🎙</Text>
          </TouchableOpacity>

          {/* Write entry */}
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/checkin?step=journal')}
            accessibilityLabel="Write a new journal entry"
            accessibilityRole="button"
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </>
        )}
        {!loading && error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !error && entries.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📓</Text>
            <Text style={styles.emptyText}>No journal entries yet.</Text>
            <Text style={styles.emptySub}>Writing helps you understand your patterns.</Text>

            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/checkin?step=journal')}>
                <Text style={styles.ctaBtnText}>✏️ Write an entry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnSecondary]} onPress={() => setShowVoice(true)}>
                <Text style={styles.ctaBtnText}>🎙 Record with voice</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!loading && !error && entries.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={styles.entryCard}
            onPress={() => router.push({ pathname: '/journal/[id]', params: { id: e.id } })}
            accessibilityLabel={`Journal entry from ${new Date(e.entry_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${e.word_count} words${e.shared_with_clinician ? ', shared with care team' : ''}`}
            accessibilityRole="button"
          >
            <Text style={styles.entryDate}>
              {new Date(e.entry_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={styles.entryMeta}>
              {e.word_count} words
              {e.shared_with_clinician ? '  ·  Shared with care team' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Voice recorder modal */}
      <Modal
        visible={showVoice}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoice(false)}
        accessibilityViewIsModal
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Voice Journal</Text>
            <Text style={styles.modalSub}>Record your thoughts — we'll transcribe and pre-fill your entry.</Text>
            <VoiceRecorder
              onTranscript={handleTranscript}
              onCancel={() => setShowVoice(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const BG   = COLOR.BG;
const CARD = COLOR.SURFACE_2;
const BORDER = COLOR.SURFACE_3;
const TEXT = COLOR.INK;
const SUB  = COLOR.INK_SOFT;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 8,
  },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:      { color: TEXT, fontFamily: FONTS.SERIF, fontSize: 22, fontWeight: '400' },
  micBtn:     { backgroundColor: COLOR.SURFACE_3, borderRadius: 8, width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  micBtnText: { fontSize: 18 },
  newBtn:     { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD, fontSize: 13 },
  scroll:     { padding: 20, paddingTop: 8 },
  errorCard:  { backgroundColor: COLOR.DANGER_BG, borderRadius: 12, borderWidth: 1, borderColor: COLOR.DANGER_BORDER, padding: 20, alignItems: 'center' },
  errorText:  { color: COLOR.DANGER, fontFamily: FONTS.SANS, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn:   { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryText:  { color: COLOR.WHITE, fontFamily: FONTS.SANS_SEMIBOLD },
  emptyCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 32, alignItems: 'center',
  },
  emptyEmoji:   { fontSize: 48, marginBottom: 12 },
  emptyText:    { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 16, marginBottom: 4 },
  emptySub:     { color: SUB, fontFamily: FONTS.SANS, fontSize: 13, textAlign: 'center', marginBottom: 20 },
  emptyActions: { width: '100%', gap: 10 },
  ctaBtn:       { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center' },
  ctaBtnSecondary: { backgroundColor: COLOR.SURFACE_3 },
  ctaBtnText:   { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD },
  entryCard: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 10,
  },
  entryDate: { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 15, marginBottom: 4 },
  entryMeta: { color: SUB, fontFamily: FONTS.SANS, fontSize: 12 },

  // Voice modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLOR.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 18, marginBottom: 4 },
  modalSub:   { color: SUB, fontFamily: FONTS.SANS, fontSize: 13, marginBottom: 20 },
});
