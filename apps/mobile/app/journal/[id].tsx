// =============================================================================
// MindLog Mobile — Journal entry detail screen
// =============================================================================

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

interface JournalEntry {
  id: string;
  entry_date: string;
  body: string;
  word_count: number;
  shared_with_clinician: boolean;
  created_at: string;
}

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/journal/${id}`);
        if (res.ok) {
          const json = (await res.json()) as { data: JournalEntry };
          setEntry(json.data);
        }
      } finally {
        setLoading(false);
      }
    };
    if (id) void load();
  }, [id]);

  const toggleShare = async (value: boolean) => {
    if (!entry) return;
    setSharing(true);
    try {
      const res = await apiFetch(`/journal/${id}/share`, {
        method: 'PATCH',
        body: JSON.stringify({ shared: value }),
      });
      if (res.ok) {
        setEntry((e) => e ? { ...e, shared_with_clinician: value } : e);
      }
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Entry not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {new Date(entry.entry_date).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          })}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>{entry.body}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaText}>{entry.word_count} words</Text>
        </View>

        <View style={styles.shareRow}>
          <View style={styles.shareInfo}>
            <Text style={styles.shareLabel}>Share with care team</Text>
            <Text style={styles.shareSub}>
              {entry.shared_with_clinician
                ? 'Visible to your care team'
                : 'Private — only you can see this'}
            </Text>
          </View>
          <Switch
            value={entry.shared_with_clinician}
            onValueChange={(v) => void toggleShare(v)}
            disabled={sharing}
            trackColor={{ false: '#2d3748', true: DESIGN_TOKENS.COLOR_PRIMARY }}
            thumbColor="#fff"
          />
        </View>
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
  loading: { color: SUB, textAlign: 'center', padding: 40 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  back: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 16, width: 50 },
  dateText: { color: TEXT, fontSize: 15, fontWeight: '600' },
  scroll: { padding: 24, paddingBottom: 48 },
  body: { color: TEXT, fontSize: 16, lineHeight: 26 },
  meta: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  metaText: { color: SUB, fontSize: 12 },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginTop: 24,
  },
  shareInfo: { flex: 1, marginRight: 16 },
  shareLabel: { color: TEXT, fontSize: 15, fontWeight: '600' },
  shareSub: { color: SUB, fontSize: 12, marginTop: 2 },
});
