// =============================================================================
// MindLog Mobile — Check-in flow (multi-step)
// Steps: mood → wellness → triggers → symptoms → journal → submit
// =============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, MOOD_COLORS, MOOD_LABELS, MOOD_EMOJIS, CRISIS_CONTACTS } from '@mindlog/shared';
import { apiFetch, getStoredUser } from '../services/auth';
import { database } from '../db/index';
import type DailyEntry from '../db/models/DailyEntry';

type Step = 'mood' | 'wellness' | 'triggers' | 'symptoms' | 'journal' | 'submit';
const STEPS: Step[] = ['mood', 'wellness', 'triggers', 'symptoms', 'journal', 'submit'];

interface CheckinState {
  mood_score: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  notes: string;
  journal_body: string;
  triggers: Array<{ trigger_id: string; severity: number }>;
  symptoms: Array<{ symptom_id: string; severity: number }>;
  strategies: Array<{ strategy_id: string; helped: boolean | null }>;
}

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

const SEVERITY_LEVELS = [1, 3, 5, 7, 10] as const;
const SEVERITY_LABELS: Record<number, string> = {
  1: 'Very low', 3: 'Low', 5: 'Moderate', 7: 'High', 10: 'Severe',
};

export default function CheckinScreen() {
  const params = useLocalSearchParams<{ step?: Step; preset?: string }>();
  const initialStep = (params.step && STEPS.includes(params.step)) ? params.step : 'mood';
  const [step, setStep] = useState<Step>(initialStep);
  const [submitting, setSubmitting] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);

  const [state, setState] = useState<CheckinState>({
    mood_score: params.preset ? Number(params.preset) : null,
    sleep_hours: null,
    exercise_minutes: null,
    notes: '',
    journal_body: '',
    triggers: [],
    symptoms: [],
    strategies: [],
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

  const goNext = () => { const next = STEPS[currentIndex + 1]; if (next) setStep(next); };
  const goPrev = () => {
    if (currentIndex === 0) { router.back(); return; }
    const prev = STEPS[currentIndex - 1]; if (prev) setStep(prev);
  };

  // Safety: flag if any selected symptom is a safety symptom in the catalogue
  const safetySymptomIds = useMemo(
    () => new Set((catalogue?.symptoms ?? []).filter((s) => s.is_safety_symptom).map((s) => s.symptom_id)),
    [catalogue],
  );
  const safetySymptomSelected = state.symptoms.some((sym) => safetySymptomIds.has(sym.symptom_id));

  // Wellness strategy: tap to add/remove
  const toggleStrategy = useCallback((strategyId: string) => {
    setState((s) => {
      const exists = s.strategies.some((x) => x.strategy_id === strategyId);
      return exists
        ? { ...s, strategies: s.strategies.filter((x) => x.strategy_id !== strategyId) }
        : { ...s, strategies: [...s.strategies, { strategy_id: strategyId, helped: null }] };
    });
  }, []);

  // Trigger: tap to add (default severity 5), tap again to remove
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

  // Symptom: tap to add/remove
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
      setStep('mood');
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0]!;
      const res = await apiFetch('/daily-entries', {
        method: 'POST',
        body: JSON.stringify({
          entry_date: today,
          mood_score: state.mood_score,
          sleep_hours: state.sleep_hours,
          exercise_minutes: state.exercise_minutes,
          notes: state.notes || undefined,
          triggers: state.triggers.length ? state.triggers : undefined,
          symptoms: state.symptoms.length ? state.symptoms : undefined,
          strategies: state.strategies.length
            ? state.strategies.map((s) => ({ strategy_id: s.strategy_id, helped: s.helped }))
            : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = (await res.json()) as { data: { id: string; completion_pct: number } };

      if (state.journal_body.trim()) {
        await apiFetch('/journal', {
          method: 'POST',
          body: JSON.stringify({ body: state.journal_body, is_shared_with_care_team: false }),
        });
      }

      await apiFetch(`/daily-entries/${data.data.id}/submit`, { method: 'PATCH' });

      // Write to local WatermelonDB so Today screen reflects submission instantly
      // without needing a network round-trip.
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
                rec.moodScore = state.mood_score!;
                rec.sleepHours = state.sleep_hours;
                rec.exerciseMinutes = state.exercise_minutes;
                rec.notes = state.notes || null;
                rec.submittedAt = now;
                rec.completionPct = completionPct;
                rec.isComplete = true;
                rec.coreComplete = true;
                rec.wellnessComplete = state.strategies.length > 0;
                rec.triggersComplete = state.triggers.length > 0;
                rec.symptomsComplete = state.symptoms.length > 0;
                rec.journalComplete = state.journal_body.trim().length > 0;
                rec.serverId = data.data.id;
                rec.isDirty = false;
              });
            } else {
              await database.get<DailyEntry>('daily_entries').create((rec) => {
                rec.patientId = user.id;
                rec.entryDate = today;
                rec.moodScore = state.mood_score!;
                rec.sleepHours = state.sleep_hours;
                rec.exerciseMinutes = state.exercise_minutes;
                rec.notes = state.notes || null;
                rec.submittedAt = now;
                rec.completionPct = completionPct;
                rec.isComplete = true;
                rec.coreComplete = true;
                rec.wellnessComplete = state.strategies.length > 0;
                rec.triggersComplete = state.triggers.length > 0;
                rec.symptomsComplete = state.symptoms.length > 0;
                rec.journalComplete = state.journal_body.trim().length > 0;
                rec.serverId = data.data.id;
                rec.isDirty = false;
              });
            }
          });
        }
      } catch {
        // Local DB write failure is non-fatal — server has the data
      }

      router.replace('/');
    } catch (err) {
      Alert.alert('Submission failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [state]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goPrev} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>{step.charAt(0).toUpperCase() + step.slice(1)}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as `${number}%` }]} />
      </View>

      {/* Safety banner (only when crisis symptom selected) */}
      {safetySymptomSelected && (
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyBannerText}>
            If you are in crisis, please call or text 988 now.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ---- MOOD -------------------------------------------------------- */}
        {step === 'mood' && (
          <View>
            <Text style={styles.question}>How are you feeling today?</Text>
            <Text style={styles.questionSub}>Tap a number from 1 (worst) to 10 (best)</Text>
            <View style={styles.moodGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
                const selected = state.mood_score === score;
                const color = (MOOD_COLORS as Record<number, string>)[score] ?? '#333';
                return (
                  <TouchableOpacity
                    key={score}
                    style={[styles.moodBtn, { borderColor: color }, selected && { backgroundColor: color }]}
                    onPress={() => setState((s) => ({ ...s, mood_score: score }))}
                  >
                    <Text style={styles.moodBtnEmoji}>{(MOOD_EMOJIS as Record<number, string>)[score] ?? score.toString()}</Text>
                    <Text style={[styles.moodBtnNum, selected && { color: '#fff' }]}>{score}</Text>
                    {selected && <Text style={styles.moodBtnLabel}>{(MOOD_LABELS as Record<number, string>)[score] ?? ''}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>Sleep hours (optional)</Text>
            <TextInput
              style={styles.input} placeholder="e.g. 7.5" placeholderTextColor="#4a5568"
              keyboardType="decimal-pad" value={state.sleep_hours?.toString() ?? ''}
              onChangeText={(v) => setState((s) => ({ ...s, sleep_hours: v ? Number(v) : null }))}
            />
            <Text style={styles.hint}>Exercise minutes (optional)</Text>
            <TextInput
              style={styles.input} placeholder="e.g. 30" placeholderTextColor="#4a5568"
              keyboardType="number-pad" value={state.exercise_minutes?.toString() ?? ''}
              onChangeText={(v) => setState((s) => ({ ...s, exercise_minutes: v ? Number(v) : null }))}
            />
          </View>
        )}

        {/* ---- WELLNESS ---------------------------------------------------- */}
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

        {/* ---- TRIGGERS ---------------------------------------------------- */}
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
                            {SEVERITY_LEVELS.map((lvl) => (
                              <TouchableOpacity
                                key={lvl}
                                style={[styles.severityBtn, selected.severity === lvl && styles.severityBtnActive]}
                                onPress={() => setTriggerSeverity(trigger.trigger_id, lvl)}
                              >
                                <Text style={[styles.severityBtnText, selected.severity === lvl && styles.severityBtnTextActive]}>{lvl}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text style={styles.severityDesc}>{SEVERITY_LABELS[selected.severity] ?? ''}</Text>
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

        {/* ---- SYMPTOMS ---------------------------------------------------- */}
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
                          <View style={[styles.checkCircle, selected && styles.checkCircleSelected, isSafety && !selected && styles.checkCircleSafety]}>
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
            {/* Always-visible crisis card on symptoms step */}
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

        {/* ---- JOURNAL ----------------------------------------------------- */}
        {step === 'journal' && (
          <View>
            <Text style={styles.question}>Journal entry</Text>
            <Text style={styles.questionSub}>Write freely — this is private by default</Text>
            <TextInput
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

        {/* ---- SUBMIT ------------------------------------------------------ */}
        {step === 'submit' && (
          <View>
            <Text style={styles.question}>Ready to submit?</Text>
            <Text style={styles.questionSub}>Review your entry before submitting</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Mood" value={state.mood_score != null ? `${state.mood_score}/10` : '—'} />
              <SummaryRow label="Sleep" value={state.sleep_hours != null ? `${state.sleep_hours}h` : '—'} />
              <SummaryRow label="Exercise" value={state.exercise_minutes != null ? `${state.exercise_minutes} min` : '—'} />
              <SummaryRow label="Strategies" value={state.strategies.length > 0 ? `${state.strategies.length} logged` : 'None'} />
              <SummaryRow label="Triggers" value={state.triggers.length > 0 ? `${state.triggers.length} logged` : 'None'} />
              <SummaryRow label="Symptoms" value={state.symptoms.length > 0 ? `${state.symptoms.length} logged` : 'None'} />
              <SummaryRow label="Journal" value={state.journal_body.trim() ? `${state.journal_body.trim().split(/\s+/).filter(Boolean).length} words` : 'Not written'} />
            </View>
            {safetySymptomSelected && (
              <View style={styles.crisisNote}>
                <Text style={styles.crisisNoteText}>
                  You selected symptoms associated with crisis. Your care team has been notified.{'\n'}
                  If you need immediate help: call or text {CRISIS_CONTACTS.LIFELINE.phone}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          {step !== 'submit' ? (
            <TouchableOpacity
              style={[styles.nextBtn, state.mood_score === null && step === 'mood' && styles.nextBtnDisabled]}
              onPress={goNext}
              disabled={state.mood_score === null && step === 'mood'}
            >
              <Text style={styles.nextBtnText}>Continue →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, submitting && styles.nextBtnDisabled]}
              onPress={() => void handleSubmit()}
              disabled={submitting}
            >
              <Text style={styles.nextBtnText}>{submitting ? 'Submitting…' : 'Submit Check-in ✓'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;
const DANGER = '#fc8181';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  backBtn: { width: 60 },
  backText: { color: PRIMARY, fontSize: 16 },
  stepLabel: { color: TEXT, fontSize: 16, fontWeight: '700' },
  progressBar: { height: 3, backgroundColor: BORDER },
  progressFill: { height: 3, backgroundColor: PRIMARY },
  safetyBanner: { backgroundColor: '#4a1010', padding: 12, alignItems: 'center' },
  safetyBannerText: { color: DANGER, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  question: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  questionSub: { color: SUB, fontSize: 14, marginBottom: 24 },
  emptyHint: { color: SUB, fontSize: 14, lineHeight: 22, marginBottom: 20 },

  // Mood
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  moodBtn: { width: '18%', padding: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center', backgroundColor: CARD, minHeight: 70 },
  moodBtnEmoji: { fontSize: 22 },
  moodBtnNum: { color: SUB, fontSize: 13, fontWeight: '700', marginTop: 2 },
  moodBtnLabel: { color: '#fff', fontSize: 9, textAlign: 'center', marginTop: 2 },
  hint: { color: SUB, fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, color: TEXT, fontSize: 15, padding: 14, marginBottom: 16 },

  // Wellness chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  chipSelected: { backgroundColor: '#1a3a30', borderColor: PRIMARY },
  chipText: { color: SUB, fontSize: 14 },
  chipTextSelected: { color: PRIMARY, fontWeight: '600' },

  // Catalogue cards (triggers / symptoms)
  catalogueCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 10, overflow: 'hidden' },
  catalogueCardSelected: { borderColor: PRIMARY },
  catalogueCardSafety: { borderColor: '#4a2020' },
  catalogueCardSafetySelected: { borderColor: DANGER },
  catalogueCardHeader: { padding: 14 },
  catalogueCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  checkCircleSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  checkCircleSafety: { borderColor: '#4a2020' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  catalogueName: { color: TEXT, fontSize: 15, fontWeight: '600' },
  catalogueNameSelected: { color: PRIMARY },
  catalogueCategory: { color: SUB, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },

  // Symptom extras
  symptomNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  safetyBadge: { backgroundColor: '#4a1010', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  safetyBadgeText: { color: DANGER, fontSize: 10, fontWeight: '700' },

  // Severity selector (triggers)
  severityRow: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  severityLabel: { color: SUB, fontSize: 12 },
  severityBtns: { flexDirection: 'row', gap: 8 },
  severityBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  severityBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  severityBtnText: { color: SUB, fontSize: 14, fontWeight: '600' },
  severityBtnTextActive: { color: '#fff' },
  severityDesc: { color: PRIMARY, fontSize: 11, fontStyle: 'italic' },

  selectionCount: { color: PRIMARY, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  crisisNote: { backgroundColor: '#1a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#4a1010', padding: 16, marginTop: 16, marginBottom: 8 },
  crisisNoteText: { color: DANGER, fontSize: 13, lineHeight: 22 },

  // Journal
  journalInput: { minHeight: 200, lineHeight: 22 },
  journalWordCount: { color: SUB, fontSize: 11, textAlign: 'right', marginTop: -12, marginBottom: 16 },

  // Submit
  summaryCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryLabel: { color: SUB, fontSize: 14 },
  summaryValue: { color: TEXT, fontSize: 14, fontWeight: '600' },

  // Navigation
  navRow: { marginTop: 8 },
  nextBtn: { backgroundColor: PRIMARY, borderRadius: 12, padding: 16, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#2d3748' },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
