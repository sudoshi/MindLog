// =============================================================================
// MindLog Mobile — Insights tab (real mood data + trends)
// Fetches last 30 days of daily entries and renders:
//   • 7-day mood bar chart (most recent 7 entries)
//   • 30-day mood sparkline summary
//   • Key stats: avg mood, avg sleep, avg exercise, check-in streak
//   • Correlation placeholders (requires ≥14 days of data)
//   • AI gate notice
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { DESIGN_TOKENS, MOOD_COLORS } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

interface DailyEntryRow {
  id: string;
  entry_date: string;
  mood_score: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  submitted_at: string | null;
}

interface InsightsData {
  entries: DailyEntryRow[];
  avgMood: number | null;
  avgSleep: number | null;
  avgExercise: number | null;
  checkInDays: number;
  last7: DailyEntryRow[];
}

function computeInsights(entries: DailyEntryRow[]): InsightsData {
  const submitted = entries.filter((e) => e.mood_score != null);
  const moodVals = submitted.map((e) => e.mood_score!).filter((v) => v != null);
  const sleepVals = submitted.map((e) => e.sleep_hours).filter((v): v is number => v != null);
  const exVals = submitted.map((e) => e.exercise_minutes).filter((v): v is number => v != null);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Last 7 calendar entries sorted by date ascending for the bar chart
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const last7 = sorted.slice(-7);

  return {
    entries,
    avgMood: avg(moodVals),
    avgSleep: avg(sleepVals),
    avgExercise: avg(exVals),
    checkInDays: submitted.length,
    last7,
  };
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function InsightsScreen() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch('/daily-entries?limit=30&page=1');
      if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);

      const json = (await res.json()) as {
        data: { items: DailyEntryRow[]; total: number };
      };

      setData(computeInsights(json.data.items));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever the tab gains focus
  useEffect(() => { void fetchData(); }, [fetchData]);
  useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Insights</Text>
          {!loading && (
            <TouchableOpacity onPress={() => { setLoading(true); void fetchData(); }}>
              <Text style={styles.refreshBtn}>↻ Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.sub}>Your last 30 days</Text>

        {loading && <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 40 }} />}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {!loading && !error && data && (
          <>
            {/* ---- 7-Day Bar Chart ---------------------------------------- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mood — last 7 days</Text>
              {data.last7.length === 0 ? (
                <Text style={styles.placeholder}>No entries yet. Complete your first check-in to see your mood trend.</Text>
              ) : (
                <>
                  <View style={styles.barChart}>
                    {data.last7.map((entry, i) => {
                      const mood = entry.mood_score;
                      const barPct = mood != null ? mood * 10 : 0;
                      const color = mood != null
                        ? (MOOD_COLORS as Record<number, string>)[mood] ?? '#333'
                        : BORDER;
                      return (
                        <View key={entry.id ?? i} style={styles.barCol}>
                          <View style={styles.barWrapper}>
                            {mood != null ? (
                              <View style={[styles.bar, { height: `${barPct}%` as `${number}%`, backgroundColor: color }]} />
                            ) : (
                              <View style={[styles.barMissed, { height: '100%' }]} />
                            )}
                          </View>
                          <Text style={styles.barLabel}>{dayLabel(entry.entry_date)}</Text>
                          <Text style={[styles.barValue, { color: mood != null ? color : SUB }]}>
                            {mood ?? '–'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  {data.avgMood != null && (
                    <Text style={styles.avg}>30-day average: {data.avgMood.toFixed(1)}</Text>
                  )}
                </>
              )}
            </View>

            {/* ---- Stats summary ------------------------------------------ */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Check-ins"
                value={data.checkInDays.toString()}
                unit="/ 30 days"
                color={DESIGN_TOKENS.COLOR_PRIMARY}
              />
              <StatCard
                label="Avg mood"
                value={data.avgMood != null ? data.avgMood.toFixed(1) : '—'}
                unit="/ 10"
                color={data.avgMood != null ? ((MOOD_COLORS as Record<number, string>)[Math.round(data.avgMood)] ?? SUB) : SUB}
              />
              <StatCard
                label="Avg sleep"
                value={data.avgSleep != null ? data.avgSleep.toFixed(1) : '—'}
                unit="hours"
                color="#7ec8e3"
              />
              <StatCard
                label="Avg exercise"
                value={data.avgExercise != null ? Math.round(data.avgExercise).toString() : '—'}
                unit="min / day"
                color="#82c991"
              />
            </View>

            {/* ---- Correlation insights ----------------------------------- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What moves your mood</Text>
              {data.checkInDays < 14 ? (
                <Text style={styles.placeholder}>
                  Correlation insights available after{' '}
                  <Text style={{ color: DESIGN_TOKENS.COLOR_PRIMARY }}>
                    {14 - data.checkInDays} more check-in{14 - data.checkInDays === 1 ? '' : 's'}
                  </Text>
                  .{'\n\n'}Keep tracking to unlock: sleep impact, trigger patterns, and which strategies help most.
                </Text>
              ) : (
                <Text style={styles.placeholder}>
                  Correlation analysis coming in a future update. You have {data.checkInDays} days of data ready.
                </Text>
              )}
            </View>

            {/* ---- AI gate notice ----------------------------------------- */}
            <View style={styles.gateCard}>
              <Text style={styles.gateTitle}>AI-Powered Insights</Text>
              <Text style={styles.gateSub}>
                Personalised insights powered by Claude AI are available once your care team enables this feature (requires BAA).
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { color: TEXT, fontSize: 22, fontWeight: '700' },
  refreshBtn: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 14 },
  sub: { color: SUB, fontSize: 13, marginBottom: 20 },
  errorText: { color: '#fc8181', fontSize: 14, textAlign: 'center', marginTop: 20 },

  card: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 16 },
  cardTitle: { color: TEXT, fontSize: 16, fontWeight: '700', marginBottom: 16 },

  // Bar chart
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, marginBottom: 12 },
  barCol: { flex: 1, alignItems: 'center' },
  barWrapper: { flex: 1, width: '60%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  barMissed: { width: '100%', borderRadius: 4, backgroundColor: BORDER },
  barLabel: { color: SUB, fontSize: 10, marginTop: 4 },
  barValue: { fontSize: 11, fontWeight: '600' },
  avg: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 13, fontWeight: '600' },

  // Stats grid (2×2)
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: CARD,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 16, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statUnit: { color: SUB, fontSize: 11, marginTop: 2 },
  statLabel: { color: TEXT, fontSize: 13, fontWeight: '600', marginTop: 4 },

  placeholder: { color: SUB, fontSize: 13, lineHeight: 20 },
  gateCard: {
    backgroundColor: '#0d1a14', borderRadius: 16, borderWidth: 1,
    borderColor: '#1a3a2a', padding: 20, marginBottom: 16,
  },
  gateTitle: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  gateSub: { color: SUB, fontSize: 13, lineHeight: 20 },
});
