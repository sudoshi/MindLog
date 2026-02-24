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
import { COLOR, FONTS, GRADIENT } from '../../constants/DesignTokens';
import { useTodayEntry } from '../../hooks/useTodayEntry';
import { apiFetch } from '../../services/auth';
import { syncHealthData, getHealthPermissionGranted, requestHealthPermissions } from '../../services/healthData';
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
  valueColor?: string | undefined;
}) {
  return (
    <View testID={`stat-${label.toLowerCase()}`} style={statStyles.card}>
      <View style={[statStyles.iconCircle, { backgroundColor: iconBg }]}>
        <Text style={statStyles.iconText}>{icon}</Text>
      </View>
      <Text style={[statStyles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card:       { flex: 1, backgroundColor: COLOR.CARD_ELEVATED, borderRadius: 14, padding: 14, alignItems: 'center', margin: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconText:   { fontSize: 18 },
  value:      { color: COLOR.INK, fontFamily: FONTS.SANS_BOLD, fontSize: 20, fontWeight: '700' },
  label:      { color: COLOR.INK_SOFT, fontFamily: FONTS.SANS, fontSize: 11, marginTop: 2 },
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

  // Passive health snapshot
  const [healthSnapshot, setHealthSnapshot] = useState<{
    step_count: number | null;
    sleep_hours: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    snapshot_date: string;
  } | null>(null);
  const [healthPermission, setHealthPermission] = useState<boolean | null>(null);

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

  const loadHealthSnapshot = useCallback(() => { void (async () => {
    const granted = await getHealthPermissionGranted();
    setHealthPermission(granted);
    if (!granted) return;
    // Sync in background, then fetch the latest snapshot
    void syncHealthData();
    try {
      const res = await apiFetch('/health-data/me');
      if (!res.ok) return;
      const json = (await res.json()) as {
        success: boolean;
        data: { snapshots: Array<{ snapshot_date: string; step_count: number | null; sleep_hours: number | null; resting_hr: number | null; hrv_ms: number | null }> };
      };
      if (json.success && json.data.snapshots.length > 0) {
        const latest = json.data.snapshots[0]!;
        setHealthSnapshot({
          snapshot_date: latest.snapshot_date,
          step_count:    latest.step_count,
          sleep_hours:   latest.sleep_hours,
          resting_hr:    latest.resting_hr,
          hrv_ms:        latest.hrv_ms,
        });
      }
    } catch {
      // non-critical
    }
  })(); }, []);

  useFocusEffect(loadHealthSnapshot);

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
    ? ((MOOD_COLORS as Record<number, string>)[entry.mood] ?? COLOR.SUCCESS)
    : COLOR.INK_GHOST;
  const streak = profile?.tracking_streak ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Phase 11b + 11i + 7b: gradient header with stat cards and offline chip */}
        <LinearGradient
          colors={GRADIENT.TODAY_HEADER}
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
              valueColor={entry?.submitted_at ? COLOR.SUCCESS : COLOR.INK_SOFT}
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
                      testID={`quick-mood-${score}`}
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
                  { color: (MOOD_COLORS as Record<number, string>)[entry.mood] ?? COLOR.WHITE },
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
            testID="checkin-cta-btn"
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
            testID="today-med-card"
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
            testID={`assessment-banner-${a.scale}`}
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

        {/* Passive health card — shown when health data is available */}
        {healthPermission === false && (
          <TouchableOpacity
            style={styles.healthCard}
            onPress={() => void requestHealthPermissions().then((granted) => setHealthPermission(granted))}
            activeOpacity={0.8}
            accessibilityLabel="Connect health data to see sleep, steps, and heart rate"
            accessibilityRole="button"
          >
            <Text style={styles.healthCardTitle}>🏃 Connect Health Data</Text>
            <Text style={styles.healthCardSub}>
              Tap to link {'{'}platform{'}'} Health — track sleep, steps and heart rate alongside your mood.
            </Text>
          </TouchableOpacity>
        )}
        {healthPermission === true && healthSnapshot && (
          <View style={styles.healthCard}>
            <Text style={styles.healthCardTitle}>
              ❤️ Yesterday's Health · {healthSnapshot.snapshot_date}
            </Text>
            <View style={styles.healthGrid}>
              {healthSnapshot.step_count != null && (
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>
                    {healthSnapshot.step_count.toLocaleString()}
                  </Text>
                  <Text style={styles.healthStatLabel}>steps</Text>
                </View>
              )}
              {healthSnapshot.sleep_hours != null && (
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>
                    {healthSnapshot.sleep_hours.toFixed(1)}h
                  </Text>
                  <Text style={styles.healthStatLabel}>sleep</Text>
                </View>
              )}
              {healthSnapshot.resting_hr != null && (
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>
                    {healthSnapshot.resting_hr}
                  </Text>
                  <Text style={styles.healthStatLabel}>resting HR</Text>
                </View>
              )}
              {healthSnapshot.hrv_ms != null && (
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>
                    {healthSnapshot.hrv_ms.toFixed(0)}ms
                  </Text>
                  <Text style={styles.healthStatLabel}>HRV</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Safety card (always visible — SAF-002) */}
        <View testID="today-safety-card" style={styles.safetyCard}>
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

const BG     = COLOR.BG;
const CARD   = COLOR.SURFACE_2;
const BORDER = COLOR.SURFACE_3;
const TEXT   = COLOR.INK;
const SUB    = COLOR.INK_SOFT;

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
  greeting:       { color: TEXT, fontFamily: FONTS.SERIF, fontSize: 22, fontWeight: '400' },
  dateText:       { color: COLOR.INK_GHOST, fontFamily: FONTS.SANS, fontSize: 13, marginTop: 2 },
  netChip:        { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8, marginTop: 2 },
  netChipOnline:  { backgroundColor: COLOR.SUCCESS_BG },
  netChipOffline: { backgroundColor: COLOR.DANGER_BG },
  netChipText:    { fontFamily: FONTS.SANS_BOLD, fontSize: 11 },
  netChipTextOnline:  { color: COLOR.SUCCESS },
  netChipTextOffline: { color: COLOR.DANGER },

  // Phase 11i: stat grid
  statGrid: { flexDirection: 'row', marginHorizontal: -4 },

  // Check-in card
  card:      { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER, marginBottom: 16 },
  cardTitle: { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardSub:   { color: SUB, fontFamily: FONTS.SANS, fontSize: 13, marginBottom: 16 },

  // Quick-mood row
  quickMoodRow:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, paddingHorizontal: 8 },
  quickMoodBtn:   { alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: BORDER, minWidth: 52 },
  quickMoodEmoji: { fontSize: 26 },
  quickMoodScore: { fontFamily: FONTS.SANS_BOLD, fontSize: 11, marginTop: 2 },

  // Mood pip row
  moodRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodPip:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  moodPipSelected: { transform: [{ scale: 1.3 }], borderWidth: 2, borderColor: COLOR.WHITE },
  moodPipText:     { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD, fontSize: 9 },
  moodLabel:       { textAlign: 'center', fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 14, marginBottom: 12 },

  // Progress
  progressBar:   { height: 6, backgroundColor: BORDER, borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 3 },
  progressLabel: { color: SUB, fontFamily: FONTS.SANS, fontSize: 11, textAlign: 'right', marginBottom: 16 },

  // CTA
  ctaBtn:         { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 10, padding: 14, alignItems: 'center' },
  ctaBtnDone:     { backgroundColor: COLOR.SUCCESS_BG },
  ctaBtnText:     { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD, fontWeight: '700', fontSize: 15 },
  ctaBtnTextDone: { color: COLOR.SUCCESS },

  // Section completion
  sections:       { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 16 },
  sectionRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  sectionRowLast: { borderBottomWidth: 0 },
  sectionIcon:    { fontSize: 18, width: 28 },
  sectionLabel:   { color: TEXT, fontFamily: FONTS.SANS, fontSize: 14, flex: 1 },
  sectionStatus:  { fontSize: 18, fontWeight: '700' },
  sectionDone:    { color: DESIGN_TOKENS.COLOR_PRIMARY },
  sectionPending: { color: BORDER },

  // Medication card
  medCard:       { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLOR.SUCCESS_BORDER, marginBottom: 16 },
  medCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  medCardTitle:  { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 16, fontWeight: '700', flex: 1 },
  medCardArrow:  { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 20, fontWeight: '300' },
  medCardSub:    { color: SUB, fontFamily: FONTS.SANS, fontSize: 12, marginBottom: 8 },
  medRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  medDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, marginRight: 8 },
  medRowText:    { color: TEXT, fontFamily: FONTS.SANS, fontSize: 13 },
  medMore:       { color: SUB, fontFamily: FONTS.SANS, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  medAllDone:    { color: COLOR.SUCCESS, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 13 },

  // Assessment banner
  assessmentBanner:      { backgroundColor: COLOR.CARD_INPUT, borderRadius: 14, borderWidth: 1, borderColor: COLOR.INSIGHT_BORDER, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  assessmentBannerTitle: { color: COLOR.INSIGHT, fontFamily: FONTS.SANS_BOLD, fontSize: 14 },
  assessmentBannerSub:   { color: COLOR.INSIGHT_MUTED, fontFamily: FONTS.SANS, fontSize: 11, marginTop: 2 },
  assessmentBannerArrow: { color: COLOR.INSIGHT, fontSize: 22, fontWeight: '300' },

  // Passive health card
  healthCard:      { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: '#1e3a4a', padding: 16, marginBottom: 16 },
  healthCardTitle: { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  healthCardSub:   { color: SUB, fontFamily: FONTS.SANS, fontSize: 12, lineHeight: 18 },
  healthGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  healthStat:      { minWidth: 60, alignItems: 'center' },
  healthStatValue: { color: '#7ec8e3', fontFamily: FONTS.SANS_BOLD, fontSize: 18, fontWeight: '700' },
  healthStatLabel: { color: SUB, fontFamily: FONTS.SANS, fontSize: 11, marginTop: 2 },

  // Safety card
  safetyCard:      { backgroundColor: COLOR.DANGER_BG, borderRadius: 16, borderWidth: 1, borderColor: COLOR.DANGER_BORDER, padding: 16, marginBottom: 16 },
  safetyTitle:     { color: COLOR.DANGER, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 13, marginBottom: 8 },
  safetyLine:      { color: SUB, fontFamily: FONTS.SANS, fontSize: 12, marginBottom: 2 },
  safetyHighlight: { color: COLOR.DANGER, fontFamily: FONTS.SANS_BOLD, fontSize: 14, marginBottom: 8 },
});
