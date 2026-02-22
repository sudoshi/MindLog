// =============================================================================
// MindLog Mobile — Today screen (daily check-in hub)
// Phase 7b: offline/synced chip via @react-native-community/netinfo
// Phase 11b: LinearGradient header
// Phase 11i: 2×2 stat card grid (mood, streak, progress, status)
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { DESIGN_TOKENS, MOOD_COLORS, MOOD_LABELS, MOOD_EMOJIS, CRISIS_CONTACTS } from '@mindlog/shared';
import { useTodayEntry } from '../../hooks/useTodayEntry';
import { apiFetch } from '../../services/auth';
import * as Haptics from 'expo-haptics';

// Quick-mood row: 5 representative emoji → mood scores
const QUICK_MOODS: Array<{ emoji: string; score: number }> = [
  { emoji: '😢', score: 2 },
  { emoji: '😕', score: 4 },
  { emoji: '😐', score: 6 },
  { emoji: '🙂', score: 8 },
  { emoji: '😄', score: 10 },
];

interface TodayMedSummary {
  id: string;
  medication_name: string;
  dose: number | null;
  dose_unit: string;
  taken: boolean | null;
  log_id: string | null;
}

interface PatientProfile {
  first_name: string;
  preferred_name: string | null;
  tracking_streak: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Stat card helper ──────────────────────────────────────────────────────────

function StatCard({
  icon, iconBg, label, value, valueColor,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconCircle, { backgroundColor: iconBg }]}>
        <Text style={statStyles.iconText}>{icon}</Text>
      </View>
      <Text style={[statStyles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card:       { flex: 1, backgroundColor: '#1a2040', borderRadius: 14, padding: 14, alignItems: 'center', margin: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconText:   { fontSize: 18 },
  value:      { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  label:      { color: '#8b9cb0', fontSize: 11, marginTop: 2 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const { entry, loading, refresh } = useTodayEntry();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [quickMoodLoading, setQuickMoodLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Medication reminders
  const [meds, setMeds] = useState<TodayMedSummary[]>([]);
  const [medsLoading, setMedsLoading] = useState(false);

  // Pending assessments (PHQ-9, GAD-7, ASRM, C-SSRS)
  const [pendingAssessments, setPendingAssessments] = useState<Array<{ scale: string; interval_days: number }>>([]);

  // Phase 11c: animated scale values for quick-mood buttons
  const scaleAnims = useRef(QUICK_MOODS.map(() => new Animated.Value(1))).current;

  // Phase 7b: track network connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

  // Load patient profile (greeting name + streak)
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/patients/me');
        if (res.ok) {
          const json = (await res.json()) as { success: boolean; data: PatientProfile };
          if (json.success) setProfile(json.data);
        }
      } catch {
        // Non-critical — greeting falls back to generic
      }
    })();
  }, []);

  const loadMeds = useCallback(() => { void (async () => {
    setMedsLoading(true);
    try {
      const res = await apiFetch('/medications/today');
      if (!res.ok) return;
      const json = (await res.json()) as { success: boolean; data: TodayMedSummary[] };
      setMeds(json.data);
    } catch {
      // silently ignore
    } finally {
      setMedsLoading(false);
    }
  })(); }, []);

  useFocusEffect(loadMeds);

  const loadPendingAssessments = useCallback(() => { void (async () => {
    try {
      const res = await apiFetch('/assessments/pending');
      if (!res.ok) return;
      const json = (await res.json()) as { success: boolean; data: Array<{ scale: string; interval_days: number }> };
      if (json.success) setPendingAssessments(json.data);
    } catch {
      // non-critical
    }
  })(); }, []);

  useFocusEffect(loadPendingAssessments);

  // Quick-mood tap: POST /daily-entries with just the mood score
  const handleQuickMood = async (score: number, index: number) => {
    if (quickMoodLoading || entry?.submitted_at) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickMoodLoading(true);

    Animated.sequence([
      Animated.spring(scaleAnims[index]!, { toValue: 1.4, useNativeDriver: true }),
      Animated.spring(scaleAnims[index]!, { toValue: 1,   useNativeDriver: true }),
    ]).start();

    try {
      const todayIso = new Date().toISOString().split('T')[0]!;
      const res = await apiFetch('/daily-entries', {
        method: 'POST',
        body: JSON.stringify({ mood_score: score, entry_date: todayIso }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch {
      // silently ignore — user can start full check-in instead
    } finally {
      setQuickMoodLoading(false);
    }
  };

  const displayName = profile?.preferred_name ?? profile?.first_name ?? null;
  const unloggedMeds = meds.filter((m) => m.log_id === null);
  const takenMeds = meds.filter((m) => m.taken === true);

  const ctaLabel = entry?.submitted_at
    ? '✓ Check-in complete'
    : entry?.completion_pct
      ? 'Continue check-in'
      : "Start today's check-in";
  const ctaDone = !!entry?.submitted_at;

  // Phase 11i — stat card derived values
  const moodColor = entry?.mood
    ? ((MOOD_COLORS as Record<number, string>)[entry.mood] ?? '#48bb78')
    : '#4a5568';
  const streak = profile?.tracking_streak ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Phase 11b + 11i + 7b: gradient header with stat cards and offline chip */}
        <LinearGradient
          colors={['#1a1f35', '#161a27']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientHeader}
        >
          {/* Greeting row */}
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                {getGreeting()}{displayName ? `, ${displayName}` : ''}
              </Text>
              <Text style={styles.dateText}>{today}</Text>
            </View>
            {/* Phase 7b: connectivity chip */}
            <View style={[styles.netChip, isOnline ? styles.netChipOnline : styles.netChipOffline]}>
              <Text style={[styles.netChipText, isOnline ? styles.netChipTextOnline : styles.netChipTextOffline]}>
                {isOnline ? '↑↓ Synced' : '● Offline'}
              </Text>
            </View>
          </View>

          {/* Phase 11i: 2×2 stat grid */}
          <View style={styles.statGrid}>
            <StatCard
              icon={entry?.mood ? ((MOOD_EMOJIS as Record<number, string>)[entry.mood] ?? '😐') : '😐'}
              iconBg={moodColor + '33'}
              label="Mood"
              value={entry?.mood ? `${entry.mood}/10` : '—'}
              valueColor={entry?.mood ? moodColor : undefined}
            />
            <StatCard
              icon="🔥"
              iconBg="#f9731633"
              label="Streak"
              value={streak > 0 ? `${streak}d` : '—'}
              valueColor="#f97316"
            />
            <StatCard
              icon="📊"
              iconBg="#6366f133"
              label="Progress"
              value={`${entry?.completion_pct ?? 0}%`}
              valueColor={DESIGN_TOKENS.COLOR_PRIMARY}
            />
            <StatCard
              icon={entry?.submitted_at ? '✓' : '○'}
              iconBg={entry?.submitted_at ? '#22c55e33' : '#4a556833'}
              label="Today"
              value={entry?.submitted_at ? 'Done' : 'Pending'}
              valueColor={entry?.submitted_at ? '#22c55e' : '#8b9cb0'}
            />
          </View>
        </LinearGradient>

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

          {/* Quick-mood emoji row — hidden after submission */}
          {!entry?.submitted_at && (
            <View style={styles.quickMoodRow}>
              {QUICK_MOODS.map(({ emoji, score }, i) => {
                const isSelected = entry?.mood === score;
                const color = (MOOD_COLORS as Record<number, string>)[score] ?? '#333';
                return (
                  <Animated.View key={score} style={{ transform: [{ scale: scaleAnims[i]! }] }}>
                    <TouchableOpacity
                      style={[
                        styles.quickMoodBtn,
                        isSelected && { borderColor: color, borderWidth: 2, backgroundColor: color + '22' },
                      ]}
                      onPress={() => void handleQuickMood(score, i)}
                      disabled={quickMoodLoading}
                    >
                      <Text style={styles.quickMoodEmoji}>{emoji}</Text>
                      <Text style={[styles.quickMoodScore, { color }]}>{score}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Mood pip row — shown when entry has a mood */}
          {entry?.mood != null && (
            <>
              <View style={styles.moodRow}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
                  const isSelected = entry.mood === score;
                  const color = (MOOD_COLORS as Record<number, string>)[score] ?? '#333';
                  return (
                    <View
                      key={score}
                      style={[styles.moodPip, { backgroundColor: color }, isSelected && styles.moodPipSelected]}
                    >
                      <Text style={styles.moodPipText}>
                        {isSelected
                          ? ((MOOD_EMOJIS as Record<number, string>)[score] ?? score.toString())
                          : score.toString()}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text
                style={[
                  styles.moodLabel,
                  { color: (MOOD_COLORS as Record<number, string>)[entry.mood] ?? '#fff' },
                ]}
              >
                {(MOOD_LABELS as Record<number, string>)[entry.mood]} ({entry.mood}/10)
              </Text>
            </>
          )}

          {/* Progress bar */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${entry?.completion_pct ?? 0}%` as `${number}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{entry?.completion_pct ?? 0}% complete</Text>

          <TouchableOpacity
            style={[styles.ctaBtn, ctaDone ? styles.ctaBtnDone : null]}
            onPress={() => router.push('/checkin')}
            disabled={ctaDone}
          >
            <Text style={[styles.ctaBtnText, ctaDone ? styles.ctaBtnTextDone : null]}>
              {ctaLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Section completion indicators */}
        <View style={styles.sections}>
          {[
            { key: 'core',     label: 'Mood & Coping', done: entry?.core_complete,     icon: '🌡️' },
            { key: 'wellness', label: 'Wellness',       done: entry?.wellness_complete, icon: '💚' },
            { key: 'triggers', label: 'Triggers',       done: entry?.triggers_complete, icon: '⚡' },
            { key: 'symptoms', label: 'Symptoms',       done: entry?.symptoms_complete, icon: '🔍' },
            { key: 'journal',  label: 'Journal',        done: entry?.journal_complete,  icon: '📓' },
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
                          {m.medication_name}{m.dose != null ? ` · ${m.dose} ${m.dose_unit}` : ''}
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

        {/* Assessment pending banners */}
        {pendingAssessments.slice(0, 2).map((a) => (
          <TouchableOpacity
            key={a.scale}
            style={styles.assessmentBanner}
            onPress={() => router.push({ pathname: '/assessments/[scale]', params: { scale: a.scale } })}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.assessmentBannerTitle}>Weekly check-in due — {a.scale}</Text>
              <Text style={styles.assessmentBannerSub}>~2 min · Tap to start</Text>
            </View>
            <Text style={styles.assessmentBannerArrow}>›</Text>
          </TouchableOpacity>
        ))}

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
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG     = '#0c0f18';
const CARD   = '#161a27';
const BORDER = '#1e2535';
const TEXT   = '#e2e8f0';
const SUB    = '#8b9cb0';

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 40 },

  // Phase 11b: gradient header (bleeds to screen edges via negative margin)
  gradientHeader: {
    marginHorizontal: -20,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    marginBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  // Phase 7b: greeting + offline chip
  greetingRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  greeting:       { color: '#f0f4ff', fontSize: 22, fontWeight: '700' },
  dateText:       { color: '#8892a4', fontSize: 13, marginTop: 2 },
  netChip:        { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8, marginTop: 2 },
  netChipOnline:  { backgroundColor: '#0f2a1a' },
  netChipOffline: { backgroundColor: '#2a1010' },
  netChipText:    { fontSize: 11, fontWeight: '700' },
  netChipTextOnline:  { color: '#22c55e' },
  netChipTextOffline: { color: '#fc8181' },

  // Phase 11i: stat grid
  statGrid: { flexDirection: 'row', marginHorizontal: -4 },

  // Check-in card
  card:      { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER, marginBottom: 16 },
  cardTitle: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardSub:   { color: SUB, fontSize: 13, marginBottom: 16 },

  // Quick-mood row
  quickMoodRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, paddingHorizontal: 8 },
  quickMoodBtn:  { alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: BORDER, minWidth: 52 },
  quickMoodEmoji: { fontSize: 26 },
  quickMoodScore: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  // Mood pip row
  moodRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodPip:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  moodPipSelected: { transform: [{ scale: 1.3 }], borderWidth: 2, borderColor: '#fff' },
  moodPipText:    { color: '#fff', fontSize: 9, fontWeight: '700' },
  moodLabel:      { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 12 },

  // Progress
  progressBar:   { height: 6, backgroundColor: BORDER, borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 3 },
  progressLabel: { color: SUB, fontSize: 11, textAlign: 'right', marginBottom: 16 },

  // CTA
  ctaBtn:         { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 10, padding: 14, alignItems: 'center' },
  ctaBtnDone:     { backgroundColor: '#1a2a1a' },
  ctaBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  ctaBtnTextDone: { color: DESIGN_TOKENS.COLOR_SUCCESS },

  // Section completion
  sections:       { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 16 },
  sectionRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  sectionRowLast: { borderBottomWidth: 0 },
  sectionIcon:    { fontSize: 18, width: 28 },
  sectionLabel:   { color: TEXT, fontSize: 14, flex: 1 },
  sectionStatus:  { fontSize: 18, fontWeight: '700' },
  sectionDone:    { color: DESIGN_TOKENS.COLOR_PRIMARY },
  sectionPending: { color: BORDER },

  // Medication card
  medCard:       { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e3a2f', marginBottom: 16 },
  medCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  medCardTitle:  { color: TEXT, fontSize: 16, fontWeight: '700', flex: 1 },
  medCardArrow:  { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 20, fontWeight: '300' },
  medCardSub:    { color: SUB, fontSize: 12, marginBottom: 8 },
  medRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  medDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, marginRight: 8 },
  medRowText:    { color: TEXT, fontSize: 13 },
  medMore:       { color: SUB, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  medAllDone:    { color: '#48bb78', fontSize: 13, fontWeight: '600' },

  // Assessment banner
  assessmentBanner:      { backgroundColor: '#1a1f35', borderRadius: 14, borderWidth: 1, borderColor: '#2a3a6a', padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  assessmentBannerTitle: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
  assessmentBannerSub:   { color: '#4a6a9a', fontSize: 11, marginTop: 2 },
  assessmentBannerArrow: { color: '#93c5fd', fontSize: 22, fontWeight: '300' },

  // Safety card
  safetyCard:      { backgroundColor: '#1a0a0a', borderRadius: 16, borderWidth: 1, borderColor: '#4a1010', padding: 16, marginBottom: 16 },
  safetyTitle:     { color: '#fc8181', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  safetyLine:      { color: SUB, fontSize: 12, marginBottom: 2 },
  safetyHighlight: { color: '#fc8181', fontSize: 14, fontWeight: '700', marginBottom: 8 },
});
