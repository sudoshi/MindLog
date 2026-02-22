// =============================================================================
// MindLog Mobile — Today screen (daily check-in hub)
// =============================================================================

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, MOOD_COLORS, MOOD_LABELS, MOOD_EMOJIS, CRISIS_CONTACTS } from '@mindlog/shared';
import { useTodayEntry } from '../../hooks/useTodayEntry';
import { apiFetch } from '../../services/auth';

interface TodayMedSummary {
  id: string;
  medication_name: string;
  dose: number | null;
  dose_unit: string;
  taken: boolean | null;
  log_id: string | null;
}

export default function TodayScreen() {
  const { entry, loading } = useTodayEntry();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Medication reminders — fetch on every focus
  const [meds, setMeds] = useState<TodayMedSummary[]>([]);
  const [medsLoading, setMedsLoading] = useState(false);

  const loadMeds = useCallback(async () => {
    setMedsLoading(true);
    try {
      const res = await apiFetch('/medications/today');
      if (!res.ok) return; // silently ignore — non-critical widget
      const json = (await res.json()) as { success: boolean; data: TodayMedSummary[] };
      setMeds(json.data);
    } catch {
      // silently ignore — non-critical widget
    } finally {
      setMedsLoading(false);
    }
  }, []);

  useFocusEffect(loadMeds);

  const unloggedMeds = meds.filter((m) => m.log_id === null);
  const takenMeds = meds.filter((m) => m.taken === true);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandName}>MindLog</Text>
          <Text style={styles.dateText}>{today}</Text>
        </View>

        {/* Check-in card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {entry?.submitted_at ? "Today's Check-in ✓" : 'Daily Check-in'}
          </Text>
          <Text style={styles.cardSub}>
            {entry?.submitted_at
              ? 'Submitted — great work keeping your streak!'
              : 'How are you feeling today?'}
          </Text>

          {/* Mood ring — 10-pip row */}
          <View style={styles.moodRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
              const isSelected = entry?.mood === score;
              const color = (MOOD_COLORS as Record<number, string>)[score] ?? '#333';
              return (
                <TouchableOpacity
                  key={score}
                  onPress={() =>
                    router.push({ pathname: '/checkin', params: { step: 'mood', preset: score } })
                  }
                  style={[styles.moodPip, { backgroundColor: color }, isSelected && styles.moodPipSelected]}
                >
                  <Text style={styles.moodPipText}>
                    {isSelected
                      ? ((MOOD_EMOJIS as Record<number, string>)[score] ?? score.toString())
                      : score.toString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {entry?.mood != null && (
            <Text
              style={[
                styles.moodLabel,
                { color: (MOOD_COLORS as Record<number, string>)[entry.mood] ?? '#fff' },
              ]}
            >
              {(MOOD_LABELS as Record<number, string>)[entry.mood]} ({entry.mood}/10)
            </Text>
          )}

          {/* Progress bar */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${entry?.completion_pct ?? 0}%` as `${number}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{entry?.completion_pct ?? 0}% complete</Text>

          <TouchableOpacity
            style={[styles.ctaBtn, entry?.submitted_at ? styles.ctaBtnDone : null]}
            onPress={() => router.push('/checkin')}
            disabled={!!entry?.submitted_at}
          >
            <Text style={styles.ctaBtnText}>
              {entry?.submitted_at
                ? 'Submitted'
                : entry?.completion_pct
                  ? 'Continue Check-in'
                  : 'Start Check-in'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Section completion indicators */}
        <View style={styles.sections}>
          {[
            { key: 'core', label: 'Mood & Coping', done: entry?.core_complete, icon: '🌡️' },
            { key: 'wellness', label: 'Wellness', done: entry?.wellness_complete, icon: '💚' },
            { key: 'triggers', label: 'Triggers', done: entry?.triggers_complete, icon: '⚡' },
            { key: 'symptoms', label: 'Symptoms', done: entry?.symptoms_complete, icon: '🔍' },
            { key: 'journal', label: 'Journal', done: entry?.journal_complete, icon: '📓' },
          ].map((s, i, arr) => (
            <View
              key={s.key}
              style={[styles.sectionRow, i === arr.length - 1 ? styles.sectionRowLast : null]}
            >
              <Text style={styles.sectionIcon}>{s.icon}</Text>
              <Text style={styles.sectionLabel}>{s.label}</Text>
              <Text style={[styles.sectionStatus, s.done ? styles.sectionDone : styles.sectionPending]}>
                {s.done ? '✓' : '·'}
              </Text>
            </View>
          ))}
        </View>

        {/* Medication reminders */}
        {(medsLoading || meds.length > 0) && (
          <TouchableOpacity
            style={styles.medCard}
            onPress={() => router.push('/medications')}
            activeOpacity={0.8}
          >
            <View style={styles.medCardHeader}>
              <Text style={styles.medCardTitle}>💊 Medications</Text>
              <Text style={styles.medCardArrow}>›</Text>
            </View>
            {medsLoading ? (
              <ActivityIndicator size="small" color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 8 }} />
            ) : (
              <>
                {unloggedMeds.length > 0 ? (
                  <>
                    <Text style={styles.medCardSub}>
                      {unloggedMeds.length} medication{unloggedMeds.length > 1 ? 's' : ''} to log today
                    </Text>
                    {unloggedMeds.slice(0, 3).map((m) => (
                      <View key={m.id} style={styles.medRow}>
                        <View style={styles.medDot} />
                        <Text style={styles.medRowText}>
                          {m.medication_name}
                          {m.dose != null ? ` · ${m.dose} ${m.dose_unit}` : ''}
                        </Text>
                      </View>
                    ))}
                    {unloggedMeds.length > 3 && (
                      <Text style={styles.medMore}>+{unloggedMeds.length - 3} more…</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.medAllDone}>
                    ✓ All {takenMeds.length} medication{takenMeds.length > 1 ? 's' : ''} taken today
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Safety card (always visible — SAF-002) */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>Need immediate support?</Text>
          <Text style={styles.safetyLine}>📞 {CRISIS_CONTACTS.LIFELINE.name}</Text>
          <Text style={styles.safetyHighlight}>Call or text {CRISIS_CONTACTS.LIFELINE.phone}</Text>
          <Text style={styles.safetyLine}>💬 {CRISIS_CONTACTS.CRISIS_TEXT_LINE.name}</Text>
          <Text style={styles.safetyHighlight}>
            Text {CRISIS_CONTACTS.CRISIS_TEXT_LINE.keyword} to {CRISIS_CONTACTS.CRISIS_TEXT_LINE.text_to}
          </Text>
        </View>

        {/* Streak */}
        <View style={styles.streakCard}>
          <Text style={styles.streakNum}>{loading ? '—' : entry ? '🔥' : '💤'}</Text>
          <Text style={styles.streakLabel}>
            {loading
              ? 'Loading…'
              : entry?.submitted_at
                ? 'Keep it up!'
                : 'Check in to extend your streak'}
          </Text>
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
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  brandName: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 24, fontWeight: '700' },
  dateText: { color: SUB, fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: BORDER, marginBottom: 16,
  },
  cardTitle: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardSub: { color: SUB, fontSize: 13, marginBottom: 16 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodPip: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  moodPipSelected: { transform: [{ scale: 1.3 }], borderWidth: 2, borderColor: '#fff' },
  moodPipText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  moodLabel: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  progressBar: {
    height: 6, backgroundColor: BORDER, borderRadius: 3,
    marginBottom: 6, overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 3 },
  progressLabel: { color: SUB, fontSize: 11, textAlign: 'right', marginBottom: 16 },
  ctaBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  ctaBtnDone: { backgroundColor: '#2d3748' },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sections: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 16, marginBottom: 16,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sectionRowLast: { borderBottomWidth: 0 },
  sectionIcon: { fontSize: 18, width: 28 },
  sectionLabel: { color: TEXT, fontSize: 14, flex: 1 },
  sectionStatus: { fontSize: 18, fontWeight: '700' },
  sectionDone: { color: DESIGN_TOKENS.COLOR_PRIMARY },
  sectionPending: { color: BORDER },
  safetyCard: {
    backgroundColor: '#1a0a0a', borderRadius: 16,
    borderWidth: 1, borderColor: '#4a1010', padding: 16, marginBottom: 16,
  },
  safetyTitle: { color: '#fc8181', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  safetyLine: { color: SUB, fontSize: 12, marginBottom: 2 },
  safetyHighlight: { color: '#fc8181', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  streakCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 16, alignItems: 'center',
  },
  streakNum: { fontSize: 32 },
  streakLabel: { color: SUB, fontSize: 13, marginTop: 4 },

  // Medication reminder card
  medCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e3a2f', marginBottom: 16,
  },
  medCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  medCardTitle: { color: TEXT, fontSize: 16, fontWeight: '700', flex: 1 },
  medCardArrow: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 20, fontWeight: '300' },
  medCardSub: { color: SUB, fontSize: 12, marginBottom: 8 },
  medRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  medDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, marginRight: 8,
  },
  medRowText: { color: TEXT, fontSize: 13 },
  medMore: { color: SUB, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  medAllDone: { color: '#48bb78', fontSize: 13, fontWeight: '600' },
});
