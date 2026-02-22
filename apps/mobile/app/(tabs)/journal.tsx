// =============================================================================
// MindLog Mobile — Journal tab
// =============================================================================

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '../../services/auth';
import { SkeletonCard } from '../../components/SkeletonCard';

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Journal</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/checkin?step=journal')}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
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
            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/checkin?step=journal')}>
              <Text style={styles.ctaBtnText}>Write your first entry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !error && entries.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={styles.entryCard}
            onPress={() => router.push({ pathname: '/journal/[id]', params: { id: e.id } })}
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
    </SafeAreaView>
  );
}

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 8,
  },
  title: { color: TEXT, fontSize: 22, fontWeight: '700' },
  newBtn: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scroll: { padding: 20, paddingTop: 8 },
  errorCard: { backgroundColor: '#1a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#4a1010', padding: 20, alignItems: 'center' },
  errorText: { color: '#fc8181', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 32, alignItems: 'center',
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: TEXT, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySub: { color: SUB, fontSize: 13, textAlign: 'center', marginBottom: 20 },
  ctaBtn: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  ctaBtnText: { color: '#fff', fontWeight: '700' },
  entryCard: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 10,
  },
  entryDate: { color: TEXT, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  entryMeta: { color: SUB, fontSize: 12 },
});
