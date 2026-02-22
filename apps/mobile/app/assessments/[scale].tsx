// =============================================================================
// MindLog Mobile — Validated assessment questionnaire screen
// Phase 9c: PHQ-9, GAD-7, ASRM, ISI, C-SSRS full questionnaire rendering.
// Accessible via Today screen banner when a scale is due.
// Route: /assessments/[scale]
// =============================================================================

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

// ---------------------------------------------------------------------------
// Questionnaire definitions
// ---------------------------------------------------------------------------

interface QuestionItem {
  id: string;
  text: string;
  /** 0-based answer options with their values */
  options: Array<{ value: number; label: string }>;
}

interface ScaleDefinition {
  name: string;
  title: string;
  instructions: string;
  questions: QuestionItem[];
  scoring: (responses: Record<string, number>) => number;
  interpretation: (score: number) => string;
}

const PHQ9_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

const GAD7_OPTIONS = PHQ9_OPTIONS;

const ASRM_OPTIONS = [
  { value: 0, label: 'Absent / no change' },
  { value: 1, label: 'Slightly present' },
  { value: 2, label: 'Present to a significant degree' },
  { value: 3, label: 'Present to an extreme degree' },
];

const SCALES: Record<string, ScaleDefinition> = {
  'PHQ-9': {
    name: 'PHQ-9',
    title: 'PHQ-9 — Depression Screener',
    instructions: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    questions: [
      { id: 'q1', text: 'Little interest or pleasure in doing things', options: PHQ9_OPTIONS },
      { id: 'q2', text: 'Feeling down, depressed, or hopeless', options: PHQ9_OPTIONS },
      { id: 'q3', text: 'Trouble falling or staying asleep, or sleeping too much', options: PHQ9_OPTIONS },
      { id: 'q4', text: 'Feeling tired or having little energy', options: PHQ9_OPTIONS },
      { id: 'q5', text: 'Poor appetite or overeating', options: PHQ9_OPTIONS },
      { id: 'q6', text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down', options: PHQ9_OPTIONS },
      { id: 'q7', text: 'Trouble concentrating on things, such as reading the newspaper or watching television', options: PHQ9_OPTIONS },
      { id: 'q8', text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual', options: PHQ9_OPTIONS },
      { id: 'q9', text: 'Thoughts that you would be better off dead or of hurting yourself in some way', options: PHQ9_OPTIONS },
    ],
    scoring: (r) => Object.values(r).reduce((a, b) => a + b, 0),
    interpretation: (s) => {
      if (s >= 20) return 'Severe depression (score ≥ 20). Your care team has been notified.';
      if (s >= 15) return 'Moderately severe depression (score 15–19). Consider contacting your care team.';
      if (s >= 10) return 'Moderate depression (score 10–14).';
      if (s >= 5) return 'Mild depression (score 5–9).';
      return 'Minimal or no depression (score < 5).';
    },
  },

  'GAD-7': {
    name: 'GAD-7',
    title: 'GAD-7 — Anxiety Screener',
    instructions: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    questions: [
      { id: 'q1', text: 'Feeling nervous, anxious, or on edge', options: GAD7_OPTIONS },
      { id: 'q2', text: 'Not being able to stop or control worrying', options: GAD7_OPTIONS },
      { id: 'q3', text: 'Worrying too much about different things', options: GAD7_OPTIONS },
      { id: 'q4', text: 'Trouble relaxing', options: GAD7_OPTIONS },
      { id: 'q5', text: 'Being so restless that it is hard to sit still', options: GAD7_OPTIONS },
      { id: 'q6', text: 'Becoming easily annoyed or irritable', options: GAD7_OPTIONS },
      { id: 'q7', text: 'Feeling afraid, as if something awful might happen', options: GAD7_OPTIONS },
    ],
    scoring: (r) => Object.values(r).reduce((a, b) => a + b, 0),
    interpretation: (s) => {
      if (s >= 15) return 'Severe anxiety (score ≥ 15). Consider contacting your care team.';
      if (s >= 10) return 'Moderate anxiety (score 10–14).';
      if (s >= 5) return 'Mild anxiety (score 5–9).';
      return 'Minimal anxiety (score < 5).';
    },
  },

  'ASRM': {
    name: 'ASRM',
    title: 'ASRM — Altman Self-Rating Mania Scale',
    instructions: 'Choose the statement that best describes how you have been feeling over the last week.',
    questions: [
      { id: 'q1', text: 'Positive mood / elevated spirits', options: ASRM_OPTIONS },
      { id: 'q2', text: 'Increased self-confidence', options: ASRM_OPTIONS },
      { id: 'q3', text: 'Decreased need for sleep', options: ASRM_OPTIONS },
      { id: 'q4', text: 'Increased speech or talkativeness', options: ASRM_OPTIONS },
      { id: 'q5', text: 'Increased activity / energy', options: ASRM_OPTIONS },
    ],
    scoring: (r) => Object.values(r).reduce((a, b) => a + b, 0),
    interpretation: (s) => {
      if (s >= 6) return 'Possible manic or hypomanic episode (score ≥ 6). Please contact your care team.';
      return 'No significant manic symptoms (score < 6).';
    },
  },

  'C-SSRS': {
    name: 'C-SSRS',
    title: 'C-SSRS — Suicidal Ideation Screener',
    instructions: 'Please answer honestly. Your answers are shared with your care team.',
    questions: [
      {
        id: 'q1',
        text: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
        options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }],
      },
      {
        id: 'q2',
        text: 'Have you had any actual thoughts of killing yourself?',
        options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }],
      },
      {
        id: 'q3',
        text: 'Have you been thinking about how you might do this?',
        options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }],
      },
      {
        id: 'q4',
        text: 'Have you had any intention of acting on these thoughts?',
        options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }],
      },
    ],
    scoring: (r) => Object.values(r).reduce((a, b) => a + b, 0),
    interpretation: (s) => {
      if (s >= 2) return 'Elevated suicidal ideation. Your care team has been notified. If you are in crisis, call or text 988 now.';
      if (s >= 1) return 'Passive ideation noted. Your care team will follow up.';
      return 'No current suicidal ideation.';
    },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssessmentScreen() {
  const { scale } = useLocalSearchParams<{ scale: string }>();
  const def = scale ? SCALES[scale] : undefined;

  const [responses, setResponses] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const setAnswer = useCallback((qId: string, value: number) => {
    setResponses((prev) => ({ ...prev, [qId]: value }));
  }, []);

  const allAnswered = def ? def.questions.every((q) => responses[q.id] !== undefined) : false;
  const score = def && allAnswered ? def.scoring(responses) : null;

  const handleSubmit = useCallback(async () => {
    if (!def || !allAnswered || score === null) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/assessments', {
        method: 'POST',
        body: JSON.stringify({ scale: def.name, score, item_responses: responses }),
      });
      if (!res.ok) throw new Error(`Submission failed (${res.status})`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFinalScore(score);
      setSubmitted(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [def, allAnswered, score, responses]);

  if (!def) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Unknown assessment scale: {scale}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted && finalScore !== null) {
    const message = def.interpretation(finalScore);
    const isAlert = finalScore >= (def.name === 'ASRM' ? 6 : def.name === 'C-SSRS' ? 2 : def.name === 'PHQ-9' ? 15 : 15);
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.resultCard}>
            <Text style={styles.resultEmoji}>{isAlert ? '⚠️' : '✓'}</Text>
            <Text style={styles.resultTitle}>{def.name} Complete</Text>
            <Text style={styles.resultScore}>Score: {finalScore}</Text>
            <Text style={[styles.resultMessage, isAlert && { color: '#fc8181' }]}>{message}</Text>
          </View>
          {isAlert && (
            <View style={styles.crisisCard}>
              <Text style={styles.crisisText}>
                If you are in immediate distress:{'\n'}
                📞 Call or text <Text style={styles.crisisHighlight}>988</Text>{'\n'}
                💬 Text HOME to <Text style={styles.crisisHighlight}>741741</Text>
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBack}>
          <Text style={styles.navBackText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{def.name}</Text>
        <Text style={styles.headerProgress}>{Object.keys(responses).length}/{def.questions.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${(Object.keys(responses).length / def.questions.length) * 100}%` as `${number}%` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.scaleTitle}>{def.title}</Text>
        <Text style={styles.instructions}>{def.instructions}</Text>

        {/* C-SSRS crisis notice */}
        {def.name === 'C-SSRS' && (
          <View style={styles.crisisCard}>
            <Text style={styles.crisisText}>
              If you are in crisis right now: call or text <Text style={styles.crisisHighlight}>988</Text>
            </Text>
          </View>
        )}

        {def.questions.map((q, qi) => (
          <View key={q.id} style={styles.questionCard}>
            <Text style={styles.questionNum}>{qi + 1} of {def.questions.length}</Text>
            <Text style={styles.questionText}>{q.text}</Text>
            <View style={styles.optionList}>
              {q.options.map((opt) => {
                const selected = responses[q.id] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                    onPress={() => setAnswer(q.id, opt.value)}
                  >
                    <View style={[styles.optionRadio, selected && styles.optionRadioSelected]}>
                      {selected && <View style={styles.optionRadioDot} />}
                    </View>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.optionValue, selected && { color: DESIGN_TOKENS.COLOR_PRIMARY }]}>
                      {opt.value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!allAnswered || submitting) && styles.submitBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={!allAnswered || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>
                {allAnswered ? `Submit ${def.name} (score: ${score ?? '…'})` : `Answer all ${def.questions.length} questions to submit`}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#fc8181', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  backBtn: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: '#fff', fontWeight: '600' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  navBack: { width: 60 },
  navBackText: { color: PRIMARY, fontSize: 16 },
  headerTitle: { color: TEXT, fontSize: 16, fontWeight: '700' },
  headerProgress: { color: SUB, fontSize: 14, width: 60, textAlign: 'right' },

  progressBar: { height: 3, backgroundColor: BORDER },
  progressFill: { height: 3, backgroundColor: PRIMARY },

  scroll: { padding: 20, paddingBottom: 48 },
  scaleTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 6 },
  instructions: { color: SUB, fontSize: 14, lineHeight: 20, marginBottom: 20 },

  crisisCard: {
    backgroundColor: '#1a0a0a', borderRadius: 12, borderWidth: 1,
    borderColor: '#4a1010', padding: 14, marginBottom: 16,
  },
  crisisText: { color: '#fc8181', fontSize: 13, lineHeight: 20 },
  crisisHighlight: { color: '#fc8181', fontWeight: '800' },

  questionCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: BORDER, padding: 16, marginBottom: 12,
  },
  questionNum: { color: SUB, fontSize: 11, marginBottom: 4 },
  questionText: { color: TEXT, fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 14 },

  optionList: { gap: 8 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    backgroundColor: BG,
  },
  optionBtnSelected: { borderColor: PRIMARY, backgroundColor: '#0d2420' },
  optionRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  optionRadioSelected: { borderColor: PRIMARY },
  optionRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  optionLabel: { flex: 1, color: SUB, fontSize: 14 },
  optionLabelSelected: { color: TEXT, fontWeight: '600' },
  optionValue: { color: BORDER, fontSize: 12, fontWeight: '700', width: 16, textAlign: 'right' },

  submitBtn: {
    backgroundColor: PRIMARY, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#2d3748' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Results
  resultCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  resultEmoji: { fontSize: 48, marginBottom: 12 },
  resultTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  resultScore: { color: PRIMARY, fontSize: 28, fontWeight: '800', marginBottom: 12 },
  resultMessage: { color: TEXT, fontSize: 14, lineHeight: 22, textAlign: 'center' },

  doneBtn: { backgroundColor: PRIMARY, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
