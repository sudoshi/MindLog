// =============================================================================
// MindLog Mobile — Check-in flow (multi-step)
// Steps: mood → mania → wellbeing → lifestyle → wellness → triggers → symptoms → journal → submit
// Phase 8c: new clinical domains; Phase 11g: Animated slide transitions
// =============================================================================

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, MOOD_COLORS, MOOD_LABELS, MOOD_EMOJIS, CRISIS_CONTACTS } from '@mindlog/shared';
import { COLOR, FONTS, GRADIENT } from '../constants/DesignTokens';
import { apiFetch, getStoredUser } from '../services/auth';
import { database } from '../db/index';
import type DailyEntry from '../db/models/DailyEntry';

// ── Step definitions ──────────────────────────────────────────────────────────

type Step =
  | 'mood'
  | 'mania'
  | 'wellbeing'
  | 'lifestyle'
  | 'wellness'
  | 'triggers'
  | 'symptoms'
  | 'journal'
  | 'submit';

const STEPS: Step[] = [
  'mood', 'mania', 'wellbeing', 'lifestyle',
  'wellness', 'triggers', 'symptoms', 'journal', 'submit',
];

const STEP_LABELS: Record<Step, string> = {
  mood:      'Mood & Sleep',
  mania:     'Energy Pole',
  wellbeing: 'Wellbeing',
  lifestyle: 'Lifestyle',
  wellness:  'Strategies',
  triggers:  'Triggers',
  symptoms:  'Symptoms',
  journal:   'Journal',
  submit:    'Review',
};

// ── State interface ───────────────────────────────────────────────────────────

interface CheckinState {
  // Core
  mood_score: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  notes: string;
  journal_body: string;
  triggers: Array<{ trigger_id: string; severity: number }>;
  symptoms: Array<{ symptom_id: string; severity: number }>;
  strategies: Array<{ strategy_id: string; helped: boolean | null }>;

  // Mania pole (Phase 8c — ASRM-informed)
  mania_score: number | null;
  racing_thoughts: boolean | null;
  decreased_sleep_need: boolean | null;

  // Wellbeing snapshot (Phase 8c — GAD-2, PHQ-2, C-SSRS screener)
  anxiety_score: number | null;
  somatic_anxiety: boolean | null;
  anhedonia_score: number | null;
  suicidal_ideation: number | null; // 0=none, 1=passing, 2=frequent, 3=plan/intent
  social_score: number | null;
  social_avoidance: boolean | null;
  cognitive_score: number | null;
  brain_fog: boolean | null;
  stress_score: number | null;

  // Lifestyle (Phase 8c — AUDIT-C-informed)
  substance_use: 'none' | 'alcohol' | 'cannabis' | 'other' | null;
  substance_quantity: number | null;
  appetite_score: number | null;
  life_event_note: string;
}

// ── Catalogue types ───────────────────────────────────────────────────────────

interface TriggerItem {
  trigger_id: string;
  name: string;
  category: string;
  icon_key: string | null;
}

interface SymptomItem {
  symptom_id: string;
  name: string;
  category: string;
  icon_key: string | null;
  is_safety_symptom: boolean;
}

interface StrategyItem {
  strategy_id: string;
  name: string;
  category: string;
  icon_key: string | null;
  has_quality_rating: boolean;
}

interface CatalogueData {
  triggers: TriggerItem[];
  symptoms: SymptomItem[];
  strategies: StrategyItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_LEVELS = [1, 3, 5, 7, 10] as const;
const SEVERITY_LABELS: Record<number, string> = {
  1: 'Very low', 3: 'Low', 5: 'Moderate', 7: 'High', 10: 'Severe',
};
const SEVERITY_COLORS: Record<number, string> = {
  1: '#4ade80', 3: '#2dd4bf', 5: '#fbbf24', 7: '#f97316', 10: '#ef4444',
};

const SI_OPTIONS = [
  { value: 0, label: 'None',     desc: 'No thoughts of suicide or self-harm' },
  { value: 1, label: 'Passive',  desc: 'Occasional passive thoughts ("I wish I weren\'t here")' },
  { value: 2, label: 'Frequent', desc: 'Active thoughts of suicide more often' },
  { value: 3, label: 'Intent',   desc: 'Thoughts with a plan or intention to act' },
];

const APPETITE_LABELS: Record<number, string> = {
  1: 'Much less than normal',
  2: 'Slightly less than normal',
  3: 'Normal',
  4: 'Slightly more than normal',
  5: 'Much more than normal',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckinScreen() {
  const params = useLocalSearchParams<{ step?: Step; preset?: string }>();
  const initialStep = (params.step && STEPS.includes(params.step)) ? params.step : 'mood';

  const [step, setStep] = useState<Step>(initialStep);
  const [submitting, setSubmitting] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);

  // Phase 11g: slide transition animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [state, setState] = useState<CheckinState>({
    mood_score:           params.preset ? Number(params.preset) : null,
    sleep_hours:          null,
    exercise_minutes:     null,
    notes:                '',
    journal_body:         '',
    triggers:             [],
    symptoms:             [],
    strategies:           [],
    mania_score:          null,
    racing_thoughts:      null,
    decreased_sleep_need: null,
    anxiety_score:        null,
    somatic_anxiety:      null,
    anhedonia_score:      null,
    suicidal_ideation:    null,
    social_score:         null,
    social_avoidance:     null,
    cognitive_score:      null,
    brain_fog:            null,
    stress_score:         null,
    substance_use:        null,
    substance_quantity:   null,
    appetite_score:       null,
    life_event_note:      '',
  });

  // Fetch all catalogue data on mount — ready before user reaches those steps
  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, sRes, wRes] = await Promise.all([
          apiFetch('/catalogues/triggers'),
          apiFetch('/catalogues/symptoms'),
          apiFetch('/catalogues/strategies'),
        ]);
        const [tData, sData, wData] = await Promise.all([
          tRes.ok ? (tRes.json() as Promise<{ data: TriggerItem[] }>) : Promise.resolve({ data: [] as TriggerItem[] }),
          sRes.ok ? (sRes.json() as Promise<{ data: SymptomItem[] }>) : Promise.resolve({ data: [] as SymptomItem[] }),
          wRes.ok ? (wRes.json() as Promise<{ data: StrategyItem[] }>) : Promise.resolve({ data: [] as StrategyItem[] }),
        ]);
        setCatalogue({ triggers: tData.data, symptoms: sData.data, strategies: wData.data });
      } catch {
        setCatalogue({ triggers: [], symptoms: [], strategies: [] });
      } finally {
        setCatalogueLoading(false);
      }
    };
    void load();
  }, []);

  const currentIndex = STEPS.indexOf(step);
  const progress = ((currentIndex + 1) / STEPS.length) * 100;

  // Phase 11g: animated step transition — slide in from right (forward) or left (back)
  const goTo = useCallback((target: Step, direction: 'forward' | 'back') => {
    slideAnim.setValue(direction === 'forward' ? 40 : -40);
    setStep(target);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const goNext = () => {
    const next = STEPS[currentIndex + 1];
    if (next) goTo(next, 'forward');
  };

  const goPrev = () => {
    if (currentIndex === 0) { router.back(); return; }
    const prev = STEPS[currentIndex - 1];
    if (prev) goTo(prev, 'back');
  };

  // Safety flags
  const safetySymptomIds = useMemo(
    () => new Set((catalogue?.symptoms ?? []).filter((s) => s.is_safety_symptom).map((s) => s.symptom_id)),
    [catalogue],
  );
  const safetySymptomSelected = state.symptoms.some((sym) => safetySymptomIds.has(sym.symptom_id));
  const siFlag = (state.suicidal_ideation ?? 0) > 0;
  const showSafetyBanner = safetySymptomSelected || siFlag;

  // Catalogue interaction handlers
  const toggleStrategy = useCallback((strategyId: string) => {
    setState((s) => {
      const exists = s.strategies.some((x) => x.strategy_id === strategyId);
      return exists
        ? { ...s, strategies: s.strategies.filter((x) => x.strategy_id !== strategyId) }
        : { ...s, strategies: [...s.strategies, { strategy_id: strategyId, helped: null }] };
    });
  }, []);

  const toggleTrigger = useCallback((triggerId: string) => {
    setState((s) => {
      const exists = s.triggers.some((x) => x.trigger_id === triggerId);
      return exists
        ? { ...s, triggers: s.triggers.filter((x) => x.trigger_id !== triggerId) }
        : { ...s, triggers: [...s.triggers, { trigger_id: triggerId, severity: 5 }] };
    });
  }, []);

  const setTriggerSeverity = useCallback((triggerId: string, severity: number) => {
    setState((s) => ({
      ...s,
      triggers: s.triggers.map((x) => x.trigger_id === triggerId ? { ...x, severity } : x),
    }));
  }, []);

  const toggleSymptom = useCallback((symptomId: string) => {
    setState((s) => {
      const exists = s.symptoms.some((x) => x.symptom_id === symptomId);
      return exists
        ? { ...s, symptoms: s.symptoms.filter((x) => x.symptom_id !== symptomId) }
        : { ...s, symptoms: [...s.symptoms, { symptom_id: symptomId, severity: 5 }] };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (state.mood_score === null) {
      Alert.alert('Mood required', 'Please select a mood score before submitting.');
      goTo('mood', 'back');
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0]!;
      const res = await apiFetch('/daily-entries', {
        method: 'POST',
        body: JSON.stringify({
          entry_date:       today,
          mood_score:       state.mood_score,
          sleep_hours:      state.sleep_hours,
          exercise_minutes: state.exercise_minutes,
          notes:            state.notes || undefined,
          triggers:         state.triggers.length ? state.triggers : undefined,
          symptoms:         state.symptoms.length ? state.symptoms : undefined,
          strategies:       state.strategies.length
            ? state.strategies.map((s) => ({ strategy_id: s.strategy_id, helped: s.helped }))
            : undefined,
          // Phase 8c — clinical domains
          mania_score:          state.mania_score          ?? undefined,
          racing_thoughts:      state.racing_thoughts      ?? undefined,
          decreased_sleep_need: state.decreased_sleep_need ?? undefined,
          anxiety_score:        state.anxiety_score        ?? undefined,
          somatic_anxiety:      state.somatic_anxiety      ?? undefined,
          anhedonia_score:      state.anhedonia_score      ?? undefined,
          suicidal_ideation:    state.suicidal_ideation    ?? undefined,
          social_score:         state.social_score         ?? undefined,
          social_avoidance:     state.social_avoidance     ?? undefined,
          cognitive_score:      state.cognitive_score      ?? undefined,
          brain_fog:            state.brain_fog            ?? undefined,
          stress_score:         state.stress_score         ?? undefined,
          substance_use:        state.substance_use        ?? undefined,
          substance_quantity:   state.substance_quantity   ?? undefined,
          appetite_score:       state.appetite_score       ?? undefined,
          life_event_note:      state.life_event_note || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = (await res.json()) as { data: { id: string; completion_pct: number } };

      if (state.journal_body.trim()) {
        const entryDate = new Date();
        const autoTitle = `Entry — ${entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        await apiFetch('/journal', {
          method: 'POST',
          body: JSON.stringify({
            title:                    autoTitle,
            body:                     state.journal_body,
            is_shared_with_care_team: false,
          }),
        });
      }

      await apiFetch(`/daily-entries/${data.data.id}/submit`, { method: 'PATCH' });

      // Write to local WatermelonDB so Today screen reflects submission instantly
      try {
        const user = await getStoredUser();
        if (user) {
          const { Q } = await import('@nozbe/watermelondb');
          const existing = await database
            .get<DailyEntry>('daily_entries')
            .query(Q.where('patient_id', user.id), Q.where('entry_date', today))
            .fetch();

          const now = new Date().toISOString();
          const completionPct = data.data.completion_pct ?? 80;

          await database.write(async () => {
            if (existing.length > 0) {
              await existing[0]!.update((rec) => {
                rec.moodScore        = state.mood_score!;
                rec.sleepHours       = state.sleep_hours;
                rec.exerciseMinutes  = state.exercise_minutes;
                rec.notes            = state.notes || null;
                rec.submittedAt      = now;
                rec.completionPct    = completionPct;
                rec.isComplete       = true;
                rec.coreComplete     = true;
                rec.wellnessComplete = state.strategies.length > 0;
                rec.triggersComplete = state.triggers.length > 0;
                rec.symptomsComplete = state.symptoms.length > 0;
                rec.journalComplete  = state.journal_body.trim().length > 0;
                rec.serverId         = data.data.id;
                rec.isDirty          = false;
              });
            } else {
              await database.get<DailyEntry>('daily_entries').create((rec) => {
                rec.patientId        = user.id;
                rec.entryDate        = today;
                rec.moodScore        = state.mood_score!;
                rec.sleepHours       = state.sleep_hours;
                rec.exerciseMinutes  = state.exercise_minutes;
                rec.notes            = state.notes || null;
                rec.submittedAt      = now;
                rec.completionPct    = completionPct;
                rec.isComplete       = true;
                rec.coreComplete     = true;
                rec.wellnessComplete = state.strategies.length > 0;
                rec.triggersComplete = state.triggers.length > 0;
                rec.symptomsComplete = state.symptoms.length > 0;
                rec.journalComplete  = state.journal_body.trim().length > 0;
                rec.serverId         = data.data.id;
                rec.isDirty          = false;
              });
            }
          });
        }
      } catch {
        // Local DB write failure is non-fatal — server has the data
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Submission failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [state, goTo]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goPrev} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>{STEP_LABELS[step]}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Segmented progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as `${number}%` }]} />
      </View>

      {/* Safety banner — shown when any safety symptom or SI > 0 is active */}
      {showSafetyBanner && (
        <View testID="checkin-safety-banner" style={styles.safetyBanner}>
          <Text style={styles.safetyBannerText}>
            If you are in crisis, please call or text 988 now.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Slide-transition wrapper — all step content moves together */}
        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>

          {/* ── MOOD ──────────────────────────────────────────────────────────── */}
          {step === 'mood' && (
            <View>
              <Text style={styles.question}>How are you feeling today?</Text>
              <Text style={styles.questionSub}>Tap a number from 1 (worst) to 10 (best)</Text>
              {/* Phase 11e: mood spectrum gradient band */}
              <LinearGradient
                colors={[COLOR.DANGER_DARK, COLOR.WARNING, COLOR.SUCCESS]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.moodGradientBand}
              />
              <View style={styles.moodGrid}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
                  const selected = state.mood_score === score;
                  const color = (MOOD_COLORS as Record<number, string>)[score] ?? '#333';
                  return (
                    <TouchableOpacity
                      key={score}
                      testID={`mood-btn-${score}`}
                      style={[styles.moodBtn, { borderColor: color }, selected && { backgroundColor: color }]}
                      onPress={() => setState((s) => ({ ...s, mood_score: score }))}
                    >
                      <Text style={styles.moodBtnEmoji}>{(MOOD_EMOJIS as Record<number, string>)[score] ?? score.toString()}</Text>
                      <Text style={[styles.moodBtnNum, selected && { color: COLOR.WHITE }]}>{score}</Text>
                      {selected && <Text style={styles.moodBtnLabel}>{(MOOD_LABELS as Record<number, string>)[score] ?? ''}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>Sleep hours (optional)</Text>
              <TextInput
                testID="sleep-input"
                style={styles.input} placeholder="e.g. 7.5" placeholderTextColor="#4a5568"
                keyboardType="decimal-pad" value={state.sleep_hours?.toString() ?? ''}
                onChangeText={(v) => setState((s) => ({ ...s, sleep_hours: v ? Number(v) : null }))}
              />
              <Text style={styles.hint}>Exercise minutes (optional)</Text>
              <TextInput
                testID="exercise-input"
                style={styles.input} placeholder="e.g. 30" placeholderTextColor="#4a5568"
                keyboardType="number-pad" value={state.exercise_minutes?.toString() ?? ''}
                onChangeText={(v) => setState((s) => ({ ...s, exercise_minutes: v ? Number(v) : null }))}
              />
            </View>
          )}

          {/* ── MANIA POLE ────────────────────────────────────────────────────── */}
          {step === 'mania' && (
            <View>
              <Text style={styles.question}>Energy & Mood Elevation</Text>
              <Text style={styles.questionSub}>
                Rate your energy level and any elevated mood symptoms today. All fields are optional.
              </Text>

              <Text style={styles.sectionLabel}>Energy / mood elevation today</Text>
              <ScoreSelector
                min={1} max={10}
                value={state.mania_score}
                onChange={(v) => setState((s) => ({ ...s, mania_score: v }))}
                lowLabel="Normal" highLabel="Very elevated"
              />

              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Manic / hypomanic features</Text>
              <View style={styles.toggleRow}>
                <ToggleChip
                  label="Racing thoughts"
                  value={state.racing_thoughts}
                  onChange={(v) => setState((s) => ({ ...s, racing_thoughts: v }))}
                />
                <ToggleChip
                  label="Less sleep needed"
                  value={state.decreased_sleep_need}
                  onChange={(v) => setState((s) => ({ ...s, decreased_sleep_need: v }))}
                />
              </View>
            </View>
          )}

          {/* ── WELLBEING ─────────────────────────────────────────────────────── */}
          {step === 'wellbeing' && (
            <View>
              <Text style={styles.question}>Wellbeing Snapshot</Text>
              <Text style={styles.questionSub}>
                A quick check across several clinical domains. All fields are optional.
              </Text>

              {/* Anxiety */}
              <Text style={styles.sectionLabel}>Anxiety level today (1 = calm, 10 = very anxious)</Text>
              <ScoreSelector
                min={1} max={10}
                value={state.anxiety_score}
                onChange={(v) => setState((s) => ({ ...s, anxiety_score: v }))}
                lowLabel="Calm" highLabel="Very anxious"
              />
              <View style={[styles.toggleRow, { marginTop: 10, marginBottom: 4 }]}>
                <ToggleChip
                  label="Physical anxiety symptoms (racing heart, chest tightness)"
                  value={state.somatic_anxiety}
                  onChange={(v) => setState((s) => ({ ...s, somatic_anxiety: v }))}
                />
              </View>

              {/* Low mood / anhedonia */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Ability to enjoy things (1 = no enjoyment, 10 = fully enjoying)</Text>
              <ScoreSelector
                min={1} max={10}
                value={state.anhedonia_score}
                onChange={(v) => setState((s) => ({ ...s, anhedonia_score: v }))}
                lowLabel="No enjoyment" highLabel="Enjoying fully"
              />

              {/* Social */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Social connectedness (1 = isolated, 5 = very social)</Text>
              <ScoreSelector
                min={1} max={5}
                value={state.social_score}
                onChange={(v) => setState((s) => ({ ...s, social_score: v }))}
                lowLabel="Isolated" highLabel="Very social"
              />
              <View style={[styles.toggleRow, { marginTop: 10, marginBottom: 4 }]}>
                <ToggleChip
                  label="Avoiding social situations"
                  value={state.social_avoidance}
                  onChange={(v) => setState((s) => ({ ...s, social_avoidance: v }))}
                />
              </View>

              {/* Cognitive */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Mental clarity (1 = very foggy, 10 = sharp)</Text>
              <ScoreSelector
                min={1} max={10}
                value={state.cognitive_score}
                onChange={(v) => setState((s) => ({ ...s, cognitive_score: v }))}
                lowLabel="Very foggy" highLabel="Very clear"
              />
              <View style={[styles.toggleRow, { marginTop: 10, marginBottom: 4 }]}>
                <ToggleChip
                  label="Brain fog / poor concentration"
                  value={state.brain_fog}
                  onChange={(v) => setState((s) => ({ ...s, brain_fog: v }))}
                />
              </View>

              {/* Stress */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Stress level (1 = no stress, 10 = overwhelmed)</Text>
              <ScoreSelector
                min={1} max={10}
                value={state.stress_score}
                onChange={(v) => setState((s) => ({ ...s, stress_score: v }))}
                lowLabel="No stress" highLabel="Overwhelmed"
              />

              {/* Safety screener (C-SSRS) */}
              <View style={styles.siSection}>
                <Text style={styles.siSectionTitle}>Safety Check</Text>
                <Text style={styles.siSectionSub}>
                  Select the option that best describes how you have felt today.
                </Text>
                {SI_OPTIONS.map((opt) => {
                  const selected = state.suicidal_ideation === opt.value;
                  const isCrisis = opt.value > 0;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      testID={`si-option-${opt.value}`}
                      style={[
                        styles.siOption,
                        selected && styles.siOptionSelected,
                        selected && isCrisis && styles.siOptionCrisis,
                      ]}
                      onPress={() => setState((s) => ({ ...s, suicidal_ideation: opt.value }))}
                    >
                      <View style={[
                        styles.siRadio,
                        selected && styles.siRadioSelected,
                        selected && isCrisis && styles.siRadioCrisis,
                      ]}>
                        {selected && <View style={[styles.siRadioDot, isCrisis && styles.siRadioDotCrisis]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.siLabel, selected && isCrisis && styles.siLabelCrisis]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.siDesc}>{opt.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {siFlag && (
                  <View style={[styles.crisisNote, { marginTop: 12 }]}>
                    <Text style={styles.crisisNoteText}>
                      Your care team has been notified.{'\n'}
                      📞 Call or text {CRISIS_CONTACTS.LIFELINE.phone}{'\n'}
                      💬 Text {CRISIS_CONTACTS.CRISIS_TEXT_LINE.keyword} to {CRISIS_CONTACTS.CRISIS_TEXT_LINE.text_to}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── LIFESTYLE ─────────────────────────────────────────────────────── */}
          {step === 'lifestyle' && (
            <View>
              <Text style={styles.question}>Lifestyle</Text>
              <Text style={styles.questionSub}>
                Optional check on substance use, appetite, and any notable life events.
              </Text>

              {/* Substance use */}
              <Text style={styles.sectionLabel}>Any substance use today?</Text>
              <View style={styles.chipGrid}>
                {(['none', 'alcohol', 'cannabis', 'other'] as const).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.chip, state.substance_use === val && styles.chipSelected]}
                    onPress={() => setState((s) => ({
                      ...s,
                      substance_use:     val,
                      substance_quantity: val === 'none' ? null : s.substance_quantity,
                    }))}
                  >
                    <Text style={[styles.chipText, state.substance_use === val && styles.chipTextSelected]}>
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(state.substance_use === 'alcohol' || state.substance_use === 'other') && (
                <>
                  <Text style={[styles.hint, { marginTop: 4 }]}>
                    {state.substance_use === 'alcohol' ? 'How many drinks/units?' : 'How many units?'}
                  </Text>
                  <TextInput
                    style={styles.input} placeholder="e.g. 2" placeholderTextColor="#4a5568"
                    keyboardType="number-pad"
                    value={state.substance_quantity?.toString() ?? ''}
                    onChangeText={(v) => setState((s) => ({ ...s, substance_quantity: v ? Number(v) : null }))}
                  />
                </>
              )}

              {/* Appetite */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Appetite compared to usual (1 = much less, 3 = normal, 5 = much more)</Text>
              <ScoreSelector
                min={1} max={5}
                value={state.appetite_score}
                onChange={(v) => setState((s) => ({ ...s, appetite_score: v }))}
                lowLabel="Much less" highLabel="Much more"
              />
              {state.appetite_score !== null && (
                <Text style={styles.scoreHintText}>{APPETITE_LABELS[state.appetite_score] ?? ''}</Text>
              )}

              {/* Life event */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Notable life event today? (optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                placeholder="e.g. Stressful meeting, argument, good news…"
                placeholderTextColor="#4a5568"
                multiline numberOfLines={3} textAlignVertical="top"
                value={state.life_event_note}
                onChangeText={(v) => setState((s) => ({ ...s, life_event_note: v }))}
              />
            </View>
          )}

          {/* ── WELLNESS STRATEGIES ──────────────────────────────────────────── */}
          {step === 'wellness' && (
            <View>
              <Text style={styles.question}>Wellness strategies today</Text>
              <Text style={styles.questionSub}>Tap each strategy you practised</Text>
              {catalogueLoading
                ? <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 40 }} />
                : (catalogue?.strategies ?? []).length === 0
                  ? <Text style={styles.emptyHint}>No strategies yet. Your care team will add a personalised list.</Text>
                  : (
                    <View style={styles.chipGrid}>
                      {(catalogue?.strategies ?? []).map((strategy) => {
                        const selected = state.strategies.some((s) => s.strategy_id === strategy.strategy_id);
                        return (
                          <TouchableOpacity
                            key={strategy.strategy_id}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => toggleStrategy(strategy.strategy_id)}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                              {strategy.name}{selected ? ' ✓' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )
              }
              {state.strategies.length > 0 && (
                <Text style={styles.selectionCount}>
                  {state.strategies.length} strateg{state.strategies.length === 1 ? 'y' : 'ies'} logged
                </Text>
              )}
            </View>
          )}

          {/* ── TRIGGERS ─────────────────────────────────────────────────────── */}
          {step === 'triggers' && (
            <View>
              <Text style={styles.question}>Active triggers today?</Text>
              <Text style={styles.questionSub}>Select any stressors and rate their intensity</Text>
              {catalogueLoading
                ? <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 40 }} />
                : (catalogue?.triggers ?? []).length === 0
                  ? <Text style={styles.emptyHint}>No triggers yet. Your care team will add a personalised list.</Text>
                  : (catalogue?.triggers ?? []).map((trigger) => {
                    const selected = state.triggers.find((t) => t.trigger_id === trigger.trigger_id);
                    return (
                      <View key={trigger.trigger_id} style={[styles.catalogueCard, selected && styles.catalogueCardSelected]}>
                        <TouchableOpacity style={styles.catalogueCardHeader} onPress={() => toggleTrigger(trigger.trigger_id)}>
                          <View style={styles.catalogueCardLeft}>
                            <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                              {selected && <Text style={styles.checkMark}>✓</Text>}
                            </View>
                            <View>
                              <Text style={[styles.catalogueName, selected && styles.catalogueNameSelected]}>{trigger.name}</Text>
                              <Text style={styles.catalogueCategory}>{trigger.category.replace(/_/g, ' ')}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                        {selected && (
                          <View style={styles.severityRow}>
                            <Text style={styles.severityLabel}>Intensity:</Text>
                            <View style={styles.severityBtns}>
                              {SEVERITY_LEVELS.map((lvl) => {
                                const c = SEVERITY_COLORS[lvl] ?? PRIMARY;
                                const active = selected.severity === lvl;
                                return (
                                  <TouchableOpacity
                                    key={lvl}
                                    style={[
                                      styles.severityBtn,
                                      { borderColor: c + '50' },
                                      active && { backgroundColor: c, borderColor: c },
                                    ]}
                                    onPress={() => setTriggerSeverity(trigger.trigger_id, lvl)}
                                  >
                                    <Text style={[
                                      styles.severityBtnText,
                                      { color: c },
                                      active && { color: lvl === 5 ? '#1a1500' : COLOR.WHITE },
                                    ]}>{lvl}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <Text style={[styles.severityDesc, { color: SEVERITY_COLORS[selected.severity] ?? PRIMARY }]}>
                              {SEVERITY_LABELS[selected.severity] ?? ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })
              }
              {state.triggers.length > 0 && (
                <Text style={styles.selectionCount}>
                  {state.triggers.length} trigger{state.triggers.length === 1 ? '' : 's'} selected
                </Text>
              )}
            </View>
          )}

          {/* ── SYMPTOMS ─────────────────────────────────────────────────────── */}
          {step === 'symptoms' && (
            <View>
              <Text style={styles.question}>Symptoms today?</Text>
              <Text style={styles.questionSub}>Select any symptoms you experienced</Text>
              {catalogueLoading
                ? <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginTop: 40 }} />
                : (catalogue?.symptoms ?? []).length === 0
                  ? <Text style={styles.emptyHint}>No symptoms yet. Your care team will add a personalised list.</Text>
                  : (catalogue?.symptoms ?? []).map((symptom) => {
                    const selected = state.symptoms.some((s) => s.symptom_id === symptom.symptom_id);
                    const isSafety = symptom.is_safety_symptom;
                    return (
                      <TouchableOpacity
                        key={symptom.symptom_id}
                        style={[
                          styles.catalogueCard,
                          selected && styles.catalogueCardSelected,
                          isSafety && styles.catalogueCardSafety,
                          selected && isSafety && styles.catalogueCardSafetySelected,
                        ]}
                        onPress={() => toggleSymptom(symptom.symptom_id)}
                      >
                        <View style={styles.catalogueCardHeader}>
                          <View style={styles.catalogueCardLeft}>
                            <View style={[
                              styles.checkCircle,
                              selected && styles.checkCircleSelected,
                              isSafety && !selected && styles.checkCircleSafety,
                            ]}>
                              {selected && <Text style={styles.checkMark}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.symptomNameRow}>
                                <Text style={[styles.catalogueName, selected && styles.catalogueNameSelected]}>{symptom.name}</Text>
                                {isSafety && (
                                  <View style={styles.safetyBadge}>
                                    <Text style={styles.safetyBadgeText}>Crisis</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.catalogueCategory}>{symptom.category}</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
              }
              <View style={styles.crisisNote}>
                <Text style={styles.crisisNoteText}>
                  If you are experiencing thoughts of suicide or self-harm:{'\n'}
                  📞 Call or text {CRISIS_CONTACTS.LIFELINE.phone}{'\n'}
                  💬 Text {CRISIS_CONTACTS.CRISIS_TEXT_LINE.keyword} to {CRISIS_CONTACTS.CRISIS_TEXT_LINE.text_to}
                </Text>
              </View>
              {state.symptoms.length > 0 && (
                <Text style={styles.selectionCount}>
                  {state.symptoms.length} symptom{state.symptoms.length === 1 ? '' : 's'} selected
                </Text>
              )}
            </View>
          )}

          {/* ── JOURNAL ──────────────────────────────────────────────────────── */}
          {step === 'journal' && (
            <View>
              <Text style={styles.question}>Journal entry</Text>
              <Text style={styles.questionSub}>Write freely — this is private by default</Text>
              <TextInput
                testID="checkin-journal-input"
                style={[styles.input, styles.journalInput]}
                placeholder="How was your day? What's on your mind?"
                placeholderTextColor="#4a5568"
                multiline numberOfLines={10} textAlignVertical="top"
                value={state.journal_body}
                onChangeText={(v) => setState((s) => ({ ...s, journal_body: v }))}
              />
              <Text style={styles.journalWordCount}>
                {state.journal_body.trim().split(/\s+/).filter(Boolean).length} words
              </Text>
            </View>
          )}

          {/* ── SUBMIT ───────────────────────────────────────────────────────── */}
          {step === 'submit' && (
            <View>
              <Text style={styles.question}>Ready to submit?</Text>
              <Text style={styles.questionSub}>Review your entry before submitting</Text>
              <View style={styles.summaryCard}>
                <SummaryRow label="Mood"     value={state.mood_score != null ? `${state.mood_score}/10` : '—'} />
                <SummaryRow label="Sleep"    value={state.sleep_hours != null ? `${state.sleep_hours}h` : '—'} />
                <SummaryRow label="Exercise" value={state.exercise_minutes != null ? `${state.exercise_minutes} min` : '—'} />
                {state.mania_score != null && (
                  <SummaryRow label="Energy elevation" value={`${state.mania_score}/10`} />
                )}
                {state.anxiety_score != null && (
                  <SummaryRow label="Anxiety" value={`${state.anxiety_score}/10`} />
                )}
                {state.stress_score != null && (
                  <SummaryRow label="Stress" value={`${state.stress_score}/10`} />
                )}
                {state.suicidal_ideation != null && state.suicidal_ideation > 0 && (
                  <SummaryRow label="Safety flag" value="⚠ Reported" danger />
                )}
                <SummaryRow label="Strategies" value={state.strategies.length > 0 ? `${state.strategies.length} logged` : 'None'} />
                <SummaryRow label="Triggers"   value={state.triggers.length > 0 ? `${state.triggers.length} logged` : 'None'} />
                <SummaryRow label="Symptoms"   value={state.symptoms.length > 0 ? `${state.symptoms.length} logged` : 'None'} />
                <SummaryRow label="Journal"    value={state.journal_body.trim() ? `${state.journal_body.trim().split(/\s+/).filter(Boolean).length} words` : 'Not written'} />
              </View>
              {showSafetyBanner && (
                <View style={styles.crisisNote}>
                  <Text style={styles.crisisNoteText}>
                    You reported symptoms associated with crisis. Your care team has been notified.{'\n'}
                    If you need immediate help: call or text {CRISIS_CONTACTS.LIFELINE.phone}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Navigation buttons */}
          <View style={styles.navRow}>
            {step !== 'submit' ? (
              <>
                <TouchableOpacity
                  testID="checkin-continue-btn"
                  style={[styles.nextBtn, state.mood_score === null && step === 'mood' && styles.nextBtnDisabled]}
                  onPress={goNext}
                  disabled={state.mood_score === null && step === 'mood'}
                >
                  <Text style={styles.nextBtnText}>Continue →</Text>
                </TouchableOpacity>
                {step !== 'mood' && (
                  <TouchableOpacity testID="checkin-skip-btn" onPress={goNext} style={styles.skipBtn}>
                    <Text style={styles.skipBtnText}>Skip this step</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity
                testID="checkin-submit-btn"
                style={[styles.nextBtn, submitting && styles.nextBtnDisabled]}
                onPress={() => void handleSubmit()}
                disabled={submitting}
              >
                <Text style={styles.nextBtnText}>{submitting ? 'Submitting…' : 'Submit Check-in ✓'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function ScoreSelector({
  min, max, value, onChange, lowLabel, highLabel,
}: {
  min: number;
  max: number;
  value: number | null;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
}) {
  const range = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  return (
    <View>
      <View style={styles.scoreRow}>
        {range.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.scoreBtn, value === n && styles.scoreBtnActive]}
            onPress={() => onChange(n)}
          >
            <Text style={[styles.scoreBtnText, value === n && styles.scoreBtnTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {(lowLabel != null || highLabel != null) && (
        <View style={styles.scoreLabelRow}>
          <Text style={styles.scoreLabelText}>{lowLabel ?? ''}</Text>
          <Text style={styles.scoreLabelText}>{highLabel ?? ''}</Text>
        </View>
      )}
    </View>
  );
}

function ToggleChip({
  label, value, onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const active = value === true;
  return (
    <TouchableOpacity
      style={[styles.toggleChip, active && styles.toggleChipActive]}
      onPress={() => onChange(!active)}
    >
      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
        {active ? '✓ ' : ''}{label}
      </Text>
    </TouchableOpacity>
  );
}

function SummaryRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, danger === true && { color: DANGER }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG      = COLOR.BG;
const CARD    = COLOR.SURFACE_2;
const BORDER  = COLOR.SURFACE_3;
const TEXT    = COLOR.INK;
const SUB     = COLOR.INK_SOFT;
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;
const DANGER  = COLOR.DANGER;

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: BG },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  backBtn:    { width: 60 },
  backText:   { color: PRIMARY, fontFamily: FONTS.SANS_MEDIUM, fontSize: 16 },
  stepLabel:  { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 16 },

  progressBar:  { height: 3, backgroundColor: BORDER },
  progressFill: { height: 3, backgroundColor: PRIMARY },

  safetyBanner:     { backgroundColor: COLOR.DANGER_BORDER, padding: 12, alignItems: 'center' },
  safetyBannerText: { color: DANGER, fontFamily: FONTS.SANS_BOLD, fontSize: 13, textAlign: 'center' },

  scroll:       { padding: 24, paddingBottom: 48 },
  question:     { color: TEXT, fontFamily: FONTS.SERIF, fontSize: 22, fontWeight: '400', marginBottom: 6 },
  questionSub:  { color: SUB, fontFamily: FONTS.SANS, fontSize: 14, marginBottom: 24 },
  emptyHint:    { color: SUB, fontFamily: FONTS.SANS, fontSize: 14, lineHeight: 22, marginBottom: 20 },

  // Mood
  moodGradientBand: { height: 6, borderRadius: 3, marginBottom: 14 },
  moodGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  moodBtn:       { width: '18%', padding: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center', backgroundColor: CARD, minHeight: 70 },
  moodBtnEmoji:  { fontSize: 22 },
  moodBtnNum:    { color: SUB, fontSize: 13, fontWeight: '700', marginTop: 2 },
  moodBtnLabel:  { color: COLOR.WHITE, fontFamily: FONTS.SANS, fontSize: 9, textAlign: 'center', marginTop: 2 },
  hint:          { color: SUB, fontFamily: FONTS.SANS, fontSize: 13, marginBottom: 6 },
  input:         { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, color: TEXT, fontFamily: FONTS.SANS, fontSize: 15, padding: 14, marginBottom: 16 },

  // ScoreSelector (Phase 8c)
  sectionLabel:       { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 14, marginBottom: 10 },
  scoreRow:           { flexDirection: 'row', gap: 5, marginBottom: 6 },
  scoreBtn:           { flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD },
  scoreBtnActive:     { backgroundColor: PRIMARY, borderColor: PRIMARY },
  scoreBtnText:       { color: SUB, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 12 },
  scoreBtnTextActive: { color: COLOR.WHITE, fontFamily: FONTS.SANS_SEMIBOLD },
  scoreLabelRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreLabelText:     { color: SUB, fontFamily: FONTS.SANS, fontSize: 11 },
  scoreHintText:      { color: PRIMARY, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 12, marginTop: -4, marginBottom: 16 },

  // ToggleChip (Phase 8c)
  toggleRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toggleChip:           { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  toggleChipActive:     { backgroundColor: COLOR.SUCCESS_BG, borderColor: PRIMARY },
  toggleChipText:       { color: SUB, fontFamily: FONTS.SANS, fontSize: 13 },
  toggleChipTextActive: { color: PRIMARY, fontFamily: FONTS.SANS_SEMIBOLD },

  // Suicidal ideation screener (Phase 8c)
  siSection:      { marginTop: 28, backgroundColor: COLOR.CARD_INPUT, borderRadius: 14, borderWidth: 1, borderColor: COLOR.INSIGHT_BORDER, padding: 16 },
  siSectionTitle: { color: TEXT, fontFamily: FONTS.SANS_BOLD, fontSize: 16, marginBottom: 4 },
  siSectionSub:   { color: SUB, fontFamily: FONTS.SANS, fontSize: 13, marginBottom: 16 },
  siOption:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 8 },
  siOptionSelected: { borderColor: PRIMARY },
  siOptionCrisis: { borderColor: DANGER, backgroundColor: COLOR.DANGER_BG },
  siRadio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  siRadioSelected: { borderColor: PRIMARY },
  siRadioCrisis:  { borderColor: DANGER },
  siRadioDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY },
  siRadioDotCrisis: { backgroundColor: DANGER },
  siLabel:        { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 14 },
  siLabelCrisis:  { color: DANGER },
  siDesc:         { color: SUB, fontFamily: FONTS.SANS, fontSize: 12, marginTop: 2, lineHeight: 18 },

  // Wellness chips
  chipGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  chip:             { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  chipSelected:     { backgroundColor: COLOR.SUCCESS_BG, borderColor: PRIMARY },
  chipText:         { color: SUB, fontFamily: FONTS.SANS, fontSize: 14 },
  chipTextSelected: { color: PRIMARY, fontFamily: FONTS.SANS_SEMIBOLD },

  // Catalogue cards (triggers / symptoms)
  catalogueCard:               { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 10, overflow: 'hidden' },
  catalogueCardSelected:       { borderColor: PRIMARY },
  catalogueCardSafety:         { borderColor: COLOR.DANGER_BORDER },
  catalogueCardSafetySelected: { borderColor: DANGER },
  catalogueCardHeader:         { padding: 14 },
  catalogueCardLeft:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle:                 { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  checkCircleSelected:         { backgroundColor: PRIMARY, borderColor: PRIMARY },
  checkCircleSafety:           { borderColor: COLOR.DANGER_BORDER },
  checkMark:                   { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD, fontSize: 12 },
  catalogueName:               { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 15 },
  catalogueNameSelected:       { color: PRIMARY },
  catalogueCategory:           { color: SUB, fontFamily: FONTS.SANS, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },

  // Symptom extras
  symptomNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  safetyBadge:     { backgroundColor: COLOR.DANGER_BORDER, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  safetyBadgeText: { color: DANGER, fontFamily: FONTS.SANS_BOLD, fontSize: 10 },

  // Severity selector (triggers)
  severityRow:           { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  severityLabel:         { color: SUB, fontFamily: FONTS.SANS, fontSize: 12 },
  severityBtns:          { flexDirection: 'row', gap: 8 },
  severityBtn:           { width: 40, height: 40, borderRadius: 8, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  severityBtnText:       { fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 14 },
  severityDesc:          { fontFamily: FONTS.SANS, fontSize: 11, fontStyle: 'italic' },

  selectionCount: { color: PRIMARY, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 13, marginTop: 4, marginBottom: 8 },
  crisisNote:     { backgroundColor: COLOR.DANGER_BG, borderRadius: 12, borderWidth: 1, borderColor: COLOR.DANGER_BORDER, padding: 16, marginTop: 16, marginBottom: 8 },
  crisisNoteText: { color: DANGER, fontFamily: FONTS.SANS, fontSize: 13, lineHeight: 22 },

  // Journal
  journalInput:     { minHeight: 200, lineHeight: 22 },
  journalWordCount: { color: SUB, fontFamily: FONTS.SANS, fontSize: 11, textAlign: 'right', marginTop: -12, marginBottom: 16 },

  // Submit summary
  summaryCard:  { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 24 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryLabel: { color: SUB, fontFamily: FONTS.SANS, fontSize: 14 },
  summaryValue: { color: TEXT, fontFamily: FONTS.SANS_SEMIBOLD, fontSize: 14 },

  // Navigation
  navRow:          { marginTop: 8 },
  nextBtn:         { backgroundColor: PRIMARY, borderRadius: 12, padding: 16, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: COLOR.SURFACE_4 },
  nextBtnText:     { color: COLOR.WHITE, fontFamily: FONTS.SANS_BOLD, fontSize: 16 },
  skipBtn:         { alignItems: 'center', paddingVertical: 12 },
  skipBtnText:     { color: SUB, fontFamily: FONTS.SANS, fontSize: 14 },
});
