// =============================================================================
// MindLog Mobile — Insights tab
// Phase 3: uses /insights/me API for real server-side correlations,
//          top triggers, top strategies, mood trend.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { DESIGN_TOKENS, MOOD_COLORS } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

interface AiInsight {
  id:           string;
  insight_type: string;
  period_start: string;
  period_end:   string;
  narrative:    string;
  key_findings: string[];
  risk_delta:   number | null;
  generated_at: string;
}

interface AiInsightsResponse {
  risk_score:         number | null;
  risk_score_factors: Array<{ rule: string; label: string; weight: number; fired: boolean; value: unknown }> | null;
  latest_insight:     AiInsight | null;
  disclaimer:         string;
}

interface InsightsResponse {
  period_days: number;
  summary: {
    check_in_days: number;
    avg_mood: number | null;
    avg_coping: number | null;
    min_mood: number | null;
    max_mood: number | null;
    avg_sleep_minutes: number | null;
    avg_exercise_minutes: number | null;
  };
  mood_trend: Array<{
    entry_date: string;
    mood: number | null;
    sleep_minutes: number | null;
    exercise_minutes: number | null;
  }>;
  correlations: {
    sleep_mood: { coefficient: number | null; data_points: number } | null;
    exercise_mood: { coefficient: number | null; data_points: number } | null;
  };
  top_triggers: Array<{ trigger_id: string; name: string; count: number; avg_severity: number | null }>;
  top_symptoms: Array<{ symptom_id: string; name: string; count: number; avg_intensity: number | null }>;
  top_strategies: Array<{ strategy_id: string; name: string; count: number; avg_mood_on_use: number | null }>;
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function corrLabel(coeff: number | null): string {
  if (coeff === null) return '—';
  const abs = Math.abs(coeff);
  const dir = coeff >= 0 ? 'positive' : 'negative';
  if (abs < 0.2) return `Weak ${dir}`;
  if (abs < 0.5) return `Moderate ${dir}`;
  return `Strong ${dir}`;
}

function corrColor(coeff: number | null): string {
  if (coeff === null) return SUB;
  if (coeff >= 0.3) return DESIGN_TOKENS.COLOR_SUCCESS;
  if (coeff <= -0.3) return DESIGN_TOKENS.COLOR_DANGER;
  return DESIGN_TOKENS.COLOR_WARNING;
}

export default function InsightsScreen() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI state — fetched separately (may 503 if AI disabled)
  const [aiData,        setAiData]        = useState<AiInsightsResponse | null>(null);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiNoConsent,   setAiNoConsent]   = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch('/insights/me?days=30');
      if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: InsightsResponse };
      if (json.success) setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAiData = useCallback(async () => {
    setAiLoading(true);
    setAiUnavailable(false);
    setAiNoConsent(false);
    try {
      const res = await apiFetch('/insights/me/ai');
      if (res.status === 503) { setAiUnavailable(true); return; }
      if (res.status === 403) { setAiNoConsent(true); return; }
      if (!res.ok) { setAiUnavailable(true); return; }
      const json = (await res.json()) as { success: boolean; data: AiInsightsResponse };
      if (json.success) setAiData(json.data);
    } catch {
      setAiUnavailable(true);
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); void fetchAiData(); }, [fetchData, fetchAiData]);
  useFocusEffect(useCallback(() => { void fetchData(); void fetchAiData(); }, [fetchData, fetchAiData]));

  const last7 = data?.mood_trend.slice(-7) ?? [];
  const s = data?.summary;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Insights</Text>
          {!loading && (
            <TouchableOpacity testID="insights-refresh-btn" onPress={() => { setLoading(true); void fetchData(); }}>
              <Text style={styles.refreshBtn}>↻ Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.sub}>Your last 30 days</Text>

        {loading && <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 40 }} />}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); void fetchData(); }}>
              <Text style={styles.retryBtn}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && data && (
          <>
            {/* ---- 7-Day Mood Bar Chart ---- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mood — last 7 days</Text>
              {last7.length === 0 ? (
                <Text style={styles.placeholder}>No entries yet. Complete your first check-in to see your mood trend.</Text>
              ) : (
                <>
                  <View style={styles.barChart}>
                    {last7.map((entry, i) => {
                      const mood = entry.mood;
                      const barPct = mood != null ? mood * 10 : 0;
                      const color = mood != null
                        ? (MOOD_COLORS as Record<number, string>)[mood] ?? '#333'
                        : BORDER;
                      return (
                        <View key={entry.entry_date ?? i} style={styles.barCol}>
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
                  {s?.avg_mood != null && (
                    <Text style={styles.avg}>30-day average: {s.avg_mood.toFixed(1)}</Text>
                  )}
                </>
              )}
            </View>

            {/* ---- Stats summary ---- */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Check-ins"
                value={(s?.check_in_days ?? 0).toString()}
                unit="/ 30 days"
                color={DESIGN_TOKENS.COLOR_PRIMARY}
              />
              <StatCard
                label="Avg mood"
                value={s?.avg_mood != null ? s.avg_mood.toFixed(1) : '—'}
                unit="/ 10"
                color={s?.avg_mood != null ? ((MOOD_COLORS as Record<number, string>)[Math.round(s.avg_mood)] ?? SUB) : SUB}
              />
              <StatCard
                label="Avg sleep"
                value={s?.avg_sleep_minutes != null ? (s.avg_sleep_minutes / 60).toFixed(1) : '—'}
                unit="hours"
                color="#7ec8e3"
              />
              <StatCard
                label="Avg exercise"
                value={s?.avg_exercise_minutes != null ? Math.round(s.avg_exercise_minutes).toString() : '—'}
                unit="min / day"
                color="#82c991"
              />
            </View>

            {/* ---- Correlations ---- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What moves your mood</Text>
              {(s?.check_in_days ?? 0) < 7 ? (
                <Text style={styles.placeholder}>
                  Correlation insights available after{' '}
                  <Text style={{ color: DESIGN_TOKENS.COLOR_PRIMARY }}>
                    {7 - (s?.check_in_days ?? 0)} more check-in{7 - (s?.check_in_days ?? 0) === 1 ? '' : 's'}
                  </Text>
                  .{'\n\n'}Keep tracking to unlock sleep and exercise impact analysis.
                </Text>
              ) : (
                <View style={{ gap: 12 }}>
                  <CorrCard
                    label="Sleep → Mood"
                    icon="🌙"
                    corr={data.correlations.sleep_mood}
                  />
                  <CorrCard
                    label="Exercise → Mood"
                    icon="🏃"
                    corr={data.correlations.exercise_mood}
                  />
                </View>
              )}
            </View>

            {/* ---- Top triggers ---- */}
            {data.top_triggers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Most common triggers</Text>
                {data.top_triggers.slice(0, 3).map((t, i) => (
                  <View key={t.trigger_id} style={[styles.listRow, i === 2 ? styles.listRowLast : null]}>
                    <View style={styles.listDot} />
                    <Text style={styles.listName} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.listCount}>{t.count}×</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ---- Top strategies ---- */}
            {data.top_strategies.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>What's helping</Text>
                {data.top_strategies.slice(0, 3).map((st, i) => (
                  <View key={st.strategy_id} style={[styles.listRow, i === 2 ? styles.listRowLast : null]}>
                    <View style={[styles.listDot, { backgroundColor: DESIGN_TOKENS.COLOR_SUCCESS }]} />
                    <Text style={styles.listName} numberOfLines={1}>{st.name}</Text>
                    {st.avg_mood_on_use != null && (
                      <Text style={[styles.listCount, { color: DESIGN_TOKENS.COLOR_SUCCESS }]}>
                        {st.avg_mood_on_use.toFixed(1)} avg mood
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* ---- AI Insights section ---- */}
            <AiInsightsSection
              loading={aiLoading}
              unavailable={aiUnavailable}
              noConsent={aiNoConsent}
              data={aiData}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// AI Insights section component
// ---------------------------------------------------------------------------

type RiskBand = 'low' | 'moderate' | 'high' | 'critical';

function riskBandColor(score: number | null): string {
  if (score === null) return SUB;
  if (score >= 75) return DESIGN_TOKENS.COLOR_DANGER;
  if (score >= 50) return '#e07a3a';
  if (score >= 25) return DESIGN_TOKENS.COLOR_WARNING;
  return DESIGN_TOKENS.COLOR_SUCCESS;
}

function riskBandLabel(score: number | null): RiskBand | 'unknown' {
  if (score === null) return 'unknown';
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function RiskGauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <View style={styles.riskGaugeWrap}>
        <Text style={styles.riskScoreNone}>Not yet computed</Text>
      </View>
    );
  }
  const color = riskBandColor(score);
  const band  = riskBandLabel(score);
  const pct   = score / 100;

  return (
    <View style={styles.riskGaugeWrap}>
      {/* Track */}
      <View style={styles.riskTrack}>
        <View style={[styles.riskFill, { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.riskScoreRow}>
        <Text style={[styles.riskScoreNumber, { color }]}>{score}</Text>
        <Text style={styles.riskScoreSlash}>/100</Text>
        <View style={[styles.riskBadge, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
          <Text style={[styles.riskBadgeText, { color }]}>{band.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function AiInsightsSection({
  loading, unavailable, noConsent, data,
}: {
  loading:     boolean;
  unavailable: boolean;
  noConsent:   boolean;
  data:        AiInsightsResponse | null;
}) {
  // Locked / unavailable state
  if (unavailable) {
    return (
      <View style={styles.gateCard}>
        <Text style={styles.gateIcon}>🔒</Text>
        <Text style={styles.gateTitle}>AI-Powered Insights</Text>
        <Text style={styles.gateSub}>
          Personalised insights powered by Claude AI are available once your care team enables this feature (requires BAA with Anthropic).
        </Text>
      </View>
    );
  }

  // Consent required
  if (noConsent) {
    return (
      <View testID="insights-ai-section" style={[styles.gateCard, styles.gateConsentCard]}>
        <Text style={styles.gateIcon}>🔐</Text>
        <Text style={styles.gateTitle}>AI Insights Locked</Text>
        <Text style={styles.gateSub}>
          Enable AI-powered insights in your Privacy settings to receive personalised clinical summaries generated by Claude AI.
        </Text>
        <TouchableOpacity
          testID="insights-ai-consent-btn"
          style={styles.gateConsentBtn}
          onPress={() => router.push('/settings/consent' as never)}
          accessibilityLabel="Go to privacy settings to enable AI insights"
          accessibilityRole="button"
        >
          <Text style={styles.gateConsentBtnText}>Open Privacy Settings →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.aiCard}>
        <Text style={styles.aiCardTitle}>AI Clinical Summary</Text>
        <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginVertical: 20 }} />
        <Text style={styles.aiLoadingText}>Generating personalised insights…</Text>
      </View>
    );
  }

  // No insight yet
  if (!data?.latest_insight) {
    return (
      <View style={styles.aiCard}>
        <View style={styles.aiCardHeader}>
          <Text style={styles.aiCardTitle}>AI Clinical Summary</Text>
          <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
        </View>
        {/* Risk gauge even without narrative */}
        <View style={styles.riskSection}>
          <Text style={styles.riskLabel}>Composite Risk Score</Text>
          <RiskGauge score={data?.risk_score ?? null} />
        </View>
        <Text style={styles.aiEmptyText}>
          Your first AI summary will be generated tonight. Check back tomorrow for personalised insights.
        </Text>
        <Text style={styles.aiDisclaimer}>{data?.disclaimer ?? ''}</Text>
      </View>
    );
  }

  const insight = data.latest_insight;
  const genDate = new Date(insight.generated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={styles.aiCard}>
      {/* Header */}
      <View style={styles.aiCardHeader}>
        <Text style={styles.aiCardTitle}>AI Clinical Summary</Text>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
      </View>
      <Text style={styles.aiGenDate}>Generated {genDate}</Text>

      {/* Risk score gauge */}
      <View style={styles.riskSection}>
        <Text style={styles.riskLabel}>Composite Risk Score</Text>
        <RiskGauge score={data.risk_score} />
        {insight.risk_delta !== null && insight.risk_delta !== 0 && (
          <Text style={[
            styles.riskDelta,
            { color: (insight.risk_delta ?? 0) > 0 ? DESIGN_TOKENS.COLOR_DANGER : DESIGN_TOKENS.COLOR_SUCCESS },
          ]}>
            {(insight.risk_delta ?? 0) > 0 ? '▲' : '▼'} {Math.abs(insight.risk_delta ?? 0)} pts since last week
          </Text>
        )}
      </View>

      {/* Key findings chips */}
      {insight.key_findings.length > 0 && (
        <View style={styles.findingsSection}>
          <Text style={styles.findingsLabel}>Key Findings</Text>
          {insight.key_findings.slice(0, 5).map((finding, i) => (
            <View key={i} style={styles.findingRow}>
              <View style={styles.findingDot} />
              <Text style={styles.findingText}>{finding}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Narrative — truncated with expand */}
      <View style={styles.narrativeSection}>
        <Text style={styles.narrativeLabel}>Clinical Narrative</Text>
        <Text style={styles.narrativeText} numberOfLines={5}>
          {insight.narrative}
        </Text>
      </View>

      {/* HIPAA disclaimer */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>⚕ {data.disclaimer}</Text>
      </View>
    </View>
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

function CorrCard({
  label, icon, corr,
}: {
  label: string;
  icon: string;
  corr: { coefficient: number | null; data_points: number } | null;
}) {
  const coeff = corr?.coefficient ?? null;
  const dataPoints = corr?.data_points ?? 0;
  const needsMore = dataPoints < 14;

  return (
    <View style={styles.corrRow}>
      <Text style={styles.corrIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.corrLabel}>{label}</Text>
        {needsMore ? (
          <Text style={styles.corrSub}>
            More data needed ({dataPoints}/14 check-ins)
          </Text>
        ) : (
          <Text style={[styles.corrValue, { color: corrColor(coeff) }]}>
            {corrLabel(coeff)}
            {coeff !== null ? ` (r = ${coeff.toFixed(2)})` : ''}
          </Text>
        )}
      </View>
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
  errorBox: { alignItems: 'center', marginTop: 20, gap: 8 },
  errorText: { color: '#fc8181', fontSize: 14, textAlign: 'center' },
  retryBtn: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 14, fontWeight: '600' },

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

  // Correlation rows
  corrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  corrIcon: { fontSize: 20, width: 28, lineHeight: 24 },
  corrLabel: { color: TEXT, fontSize: 14, fontWeight: '600' },
  corrValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  corrSub: { color: SUB, fontSize: 12, marginTop: 2 },

  // Top lists
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  listRowLast: { borderBottomWidth: 0 },
  listDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESIGN_TOKENS.COLOR_DANGER },
  listName: { flex: 1, color: TEXT, fontSize: 14 },
  listCount: { color: SUB, fontSize: 13, fontWeight: '600' },

  placeholder: { color: SUB, fontSize: 13, lineHeight: 20 },

  // ── AI gate (locked / consent states) ─────────────────────────────────────
  gateCard: {
    backgroundColor: '#0d1a14', borderRadius: 16, borderWidth: 1,
    borderColor: '#1a3a2a', padding: 20, marginBottom: 16, alignItems: 'center',
  },
  gateConsentCard: { backgroundColor: '#1a1a0d', borderColor: '#3a3a1a' },
  gateIcon:  { fontSize: 28, marginBottom: 10 },
  gateTitle: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  gateSub:   { color: SUB, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  gateConsentBtn: {
    marginTop: 16, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
  gateConsentBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── AI Insights card ───────────────────────────────────────────────────────
  aiCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 20, marginBottom: 16,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  aiCardTitle:  { color: TEXT, fontSize: 16, fontWeight: '700', flex: 1 },
  aiBadge: {
    backgroundColor: `${DESIGN_TOKENS.COLOR_PRIMARY}22`,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: `${DESIGN_TOKENS.COLOR_PRIMARY}44`,
  },
  aiBadgeText:  { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  aiGenDate:    { color: SUB, fontSize: 11, marginBottom: 16 },
  aiLoadingText:{ color: SUB, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  aiEmptyText:  { color: SUB, fontSize: 13, lineHeight: 20, marginTop: 12 },
  aiDisclaimer: { color: '#5a6a80', fontSize: 11, lineHeight: 18, fontStyle: 'italic', marginTop: 8 },

  // ── Risk gauge ─────────────────────────────────────────────────────────────
  riskSection:     { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  riskLabel:       { color: SUB, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  riskGaugeWrap:   { gap: 8 },
  riskTrack:       { height: 8, backgroundColor: '#1e2535', borderRadius: 4, overflow: 'hidden' },
  riskFill:        { height: '100%', borderRadius: 4 },
  riskScoreRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riskScoreNumber: { fontSize: 32, fontWeight: '800' },
  riskScoreSlash:  { color: SUB, fontSize: 14, alignSelf: 'flex-end', marginBottom: 4 },
  riskScoreNone:   { color: SUB, fontSize: 13 },
  riskBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, marginLeft: 4,
  },
  riskBadgeText:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  riskDelta:       { fontSize: 12, fontWeight: '600', marginTop: 4 },

  // ── Key findings ───────────────────────────────────────────────────────────
  findingsSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  findingsLabel:   { color: SUB, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  findingRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  findingDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, marginTop: 5 },
  findingText:     { flex: 1, color: TEXT, fontSize: 13, lineHeight: 20 },

  // ── Narrative ──────────────────────────────────────────────────────────────
  narrativeSection: { marginBottom: 16 },
  narrativeLabel:   { color: SUB, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  narrativeText:    { color: TEXT, fontSize: 13, lineHeight: 22 },

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  disclaimerBox:    { backgroundColor: '#1a1f2e', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: BORDER },
  disclaimerText:   { color: '#5a6a80', fontSize: 11, lineHeight: 18, fontStyle: 'italic' },
});
