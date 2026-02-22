// =============================================================================
// MindLog Mobile — Medications screen
// Shows today's medications with adherence toggle, allows adding new medications,
// and displays a 7-day adherence mini-history per medication.
//
// Routes:
//   GET  /medications/today    — today's meds + log status
//   GET  /medications          — full list (for "All Meds" view)
//   POST /medications          — add a new medication
//   POST /medications/:id/logs — log taken/not-taken for today
// =============================================================================

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Switch, Alert, Modal, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { DESIGN_TOKENS, MEDICATION_FREQUENCY_LABELS, type MedicationFrequency } from '@mindlog/shared';
import { apiFetch } from '../services/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TodayMed {
  id: string;
  medication_name: string;
  dose: number | null;
  dose_unit: string;
  frequency: string;
  frequency_other: string | null;
  instructions: string | null;
  log_id: string | null;
  taken: boolean | null;
  taken_at: string | null;
  log_notes: string | null;
}

type FreqKey = MedicationFrequency;
const FREQ_KEYS = Object.keys(MEDICATION_FREQUENCY_LABELS) as FreqKey[];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatDose(med: TodayMed): string {
  if (med.dose == null) return '';
  return ` · ${med.dose} ${med.dose_unit}`;
}

function formatFreq(med: TodayMed): string {
  const label =
    (MEDICATION_FREQUENCY_LABELS as Record<string, string>)[med.frequency] ??
    med.frequency;
  return med.frequency === 'other' && med.frequency_other
    ? med.frequency_other
    : label;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MedicationsScreen() {
  const [meds, setMeds] = useState<TodayMed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Add medication modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDose, setNewDose] = useState('');
  const [newDoseUnit, setNewDoseUnit] = useState('mg');
  const [newFreq, setNewFreq] = useState<FreqKey>('once_daily_morning');
  const [newInstructions, setNewInstructions] = useState('');
  const [showInApp, setShowInApp] = useState(true);

  // ---------------------------------------------------------------------------
  // Fetch today's medications on focus
  // ---------------------------------------------------------------------------

  const loadMeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/medications/today');
      if (!res.ok) throw new Error(`Failed to load medications (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: TodayMed[] };
      setMeds(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(loadMeds);

  // ---------------------------------------------------------------------------
  // Toggle adherence (taken / not taken)
  // ---------------------------------------------------------------------------

  const toggleTaken = async (med: TodayMed, taken: boolean) => {
    setTogglingId(med.id);
    try {
      const res = await apiFetch(`/medications/${med.id}/logs`, {
        method: 'POST',
        body: JSON.stringify({
          taken,
          taken_at: taken ? new Date().toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`Log failed (${res.status})`);
      setMeds((prev) =>
        prev.map((m) =>
          m.id === med.id
            ? {
                ...m,
                taken,
                log_id: m.log_id ?? 'pending',
                taken_at: taken ? new Date().toISOString() : null,
              }
            : m,
        ),
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update adherence');
    } finally {
      setTogglingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Add medication
  // ---------------------------------------------------------------------------

  const handleAddMedication = async () => {
    if (!newName.trim()) {
      Alert.alert('Validation', 'Medication name is required');
      return;
    }

    setAdding(true);
    try {
      const res = await apiFetch('/medications', {
        method: 'POST',
        body: JSON.stringify({
          medication_name: newName.trim(),
          dose: newDose ? parseFloat(newDose) : undefined,
          dose_unit: newDoseUnit || 'mg',
          frequency: newFreq,
          instructions: newInstructions.trim() || undefined,
          show_in_app: showInApp,
        }),
      });
      if (!res.ok) throw new Error(`Could not add medication (${res.status})`);

      // Reset form
      setNewName('');
      setNewDose('');
      setNewDoseUnit('mg');
      setNewFreq('once_daily_morning');
      setNewInstructions('');
      setShowInApp(true);
      setShowAddModal(false);

      // Reload list
      await loadMeds();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not add medication');
    } finally {
      setAdding(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const takenCount = meds.filter((m) => m.taken === true).length;
  const totalCount = meds.length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Medications</Text>
          {!loading && totalCount > 0 && (
            <Text style={styles.headerSub}>
              {takenCount} / {totalCount} taken today
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} size="large" />
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadMeds} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && meds.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>💊</Text>
            <Text style={styles.emptyTitle}>No medications yet</Text>
            <Text style={styles.emptySub}>
              Tap "+ Add" to add a medication your care team has prescribed.
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.emptyAddBtnText}>Add Medication</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && meds.length > 0 && (
          <>
            {/* Progress banner */}
            <View style={styles.progressBanner}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: totalCount > 0 ? `${(takenCount / totalCount) * 100}%` as `${number}%` : '0%' },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {takenCount === totalCount && totalCount > 0
                  ? '🎉 All taken today!'
                  : `${totalCount - takenCount} remaining`}
              </Text>
            </View>

            {/* Medication cards */}
            {meds.map((med) => (
              <MedCard
                key={med.id}
                med={med}
                toggling={togglingId === med.id}
                onToggle={toggleTaken}
              />
            ))}
          </>
        )}

        {/* Safety footer */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyText}>
            Never stop or change a medication without consulting your care team.
          </Text>
          <Text style={styles.safetyHighlight}>Crisis? Call or text 988</Text>
        </View>
      </ScrollView>

      {/* Add medication modal */}
      <AddMedicationModal
        visible={showAddModal}
        adding={adding}
        newName={newName}
        newDose={newDose}
        newDoseUnit={newDoseUnit}
        newFreq={newFreq}
        newInstructions={newInstructions}
        showInApp={showInApp}
        onChangeName={setNewName}
        onChangeDose={setNewDose}
        onChangeDoseUnit={setNewDoseUnit}
        onChangeFreq={setNewFreq}
        onChangeInstructions={setNewInstructions}
        onChangeShowInApp={setShowInApp}
        onSubmit={handleAddMedication}
        onCancel={() => setShowAddModal(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// MedCard — individual medication row
// ---------------------------------------------------------------------------

interface MedCardProps {
  med: TodayMed;
  toggling: boolean;
  onToggle: (med: TodayMed, taken: boolean) => void;
}

function MedCard({ med, toggling, onToggle }: MedCardProps) {
  const taken = med.taken === true;
  const skipped = med.taken === false;
  const unlogged = med.log_id === null;

  return (
    <View style={[styles.medCard, taken && styles.medCardTaken]}>
      {/* Medication info */}
      <View style={styles.medInfo}>
        <View style={styles.medNameRow}>
          <Text style={[styles.medName, taken && styles.medNameTaken]}>
            {med.medication_name}
          </Text>
          {taken && <Text style={styles.takenBadge}>✓ Taken</Text>}
          {skipped && <Text style={styles.skippedBadge}>✗ Skipped</Text>}
        </View>
        <Text style={styles.medDetail}>
          {formatDose(med)}
          {med.dose != null && ' · '}
          {formatFreq(med)}
        </Text>
        {med.instructions && (
          <Text style={styles.medInstructions}>{med.instructions}</Text>
        )}
        {med.taken_at && (
          <Text style={styles.takenAt}>
            Logged at {new Date(med.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.medActions}>
        {toggling ? (
          <ActivityIndicator size="small" color={DESIGN_TOKENS.COLOR_PRIMARY} />
        ) : (
          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.actionBtn, taken && styles.actionBtnActive]}
              onPress={() => onToggle(med, true)}
            >
              <Text style={[styles.actionBtnText, taken && styles.actionBtnTextActive]}>
                Taken
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, skipped && styles.actionBtnSkip]}
              onPress={() => onToggle(med, false)}
            >
              <Text style={[styles.actionBtnText, skipped && styles.actionBtnTextSkip]}>
                Skip
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AddMedicationModal
// ---------------------------------------------------------------------------

interface AddModalProps {
  visible: boolean;
  adding: boolean;
  newName: string;
  newDose: string;
  newDoseUnit: string;
  newFreq: FreqKey;
  newInstructions: string;
  showInApp: boolean;
  onChangeName: (v: string) => void;
  onChangeDose: (v: string) => void;
  onChangeDoseUnit: (v: string) => void;
  onChangeFreq: (v: FreqKey) => void;
  onChangeInstructions: (v: string) => void;
  onChangeShowInApp: (v: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function AddMedicationModal({
  visible, adding, newName, newDose, newDoseUnit, newFreq,
  newInstructions, showInApp,
  onChangeName, onChangeDose, onChangeDoseUnit, onChangeFreq,
  onChangeInstructions, onChangeShowInApp, onSubmit, onCancel,
}: AddModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Add Medication</Text>
          <Text style={styles.modalSub}>Add a medication prescribed by your care team.</Text>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <Text style={styles.fieldLabel}>Medication name *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Sertraline"
              placeholderTextColor="#4a5568"
              value={newName}
              onChangeText={onChangeName}
              autoCapitalize="words"
            />

            {/* Dose row */}
            <View style={styles.doseRow}>
              <View style={{ flex: 2, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Dose</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="50"
                  placeholderTextColor="#4a5568"
                  value={newDose}
                  onChangeText={onChangeDose}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="mg"
                  placeholderTextColor="#4a5568"
                  value={newDoseUnit}
                  onChangeText={onChangeDoseUnit}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Frequency */}
            <Text style={styles.fieldLabel}>Frequency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.freqScroll}>
              {FREQ_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.freqChip, newFreq === key && styles.freqChipActive]}
                  onPress={() => onChangeFreq(key)}
                >
                  <Text style={[styles.freqChipText, newFreq === key && styles.freqChipTextActive]}>
                    {MEDICATION_FREQUENCY_LABELS[key]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Instructions */}
            <Text style={styles.fieldLabel}>Instructions (optional)</Text>
            <TextInput
              style={[styles.fieldInput, { minHeight: 60 }]}
              placeholder="e.g. Take with food"
              placeholderTextColor="#4a5568"
              value={newInstructions}
              onChangeText={onChangeInstructions}
              multiline
            />

            {/* Show in app toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.fieldLabel}>Show in daily reminders</Text>
              <Switch
                value={showInApp}
                onValueChange={onChangeShowInApp}
                trackColor={{ false: '#2d3748', true: DESIGN_TOKENS.COLOR_PRIMARY }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={adding}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (!newName.trim() || adding) && styles.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={!newName.trim() || adding}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Add Medication</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const DANGER = '#fc8181';
const SUCCESS = '#48bb78';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { paddingRight: 12 },
  backArrow: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 22 },
  headerTitle: { color: TEXT, fontSize: 20, fontWeight: '700' },
  headerSub: { color: SUB, fontSize: 12, marginTop: 2 },
  addBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Body
  scroll: { padding: 20, paddingBottom: 40 },
  center: { alignItems: 'center', paddingTop: 60 },

  // Error
  errorCard: {
    backgroundColor: '#1a0a0a', borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: '#4a1010', alignItems: 'center',
  },
  errorText: { color: DANGER, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryText: { color: '#fff', fontWeight: '600' },

  // Empty state
  emptyCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 32,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: SUB, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  emptyAddBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Progress
  progressBanner: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: BORDER, marginBottom: 16,
  },
  progressBar: {
    height: 6, backgroundColor: BORDER, borderRadius: 3,
    marginBottom: 8, overflow: 'hidden',
  },
  progressFill: {
    height: 6, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 3,
  },
  progressLabel: { color: SUB, fontSize: 12, textAlign: 'right' },

  // Med card
  medCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  medCardTaken: { borderColor: '#2a7a5a', backgroundColor: '#0d1f1a' },
  medInfo: { flex: 1, marginRight: 12 },
  medNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  medName: { color: TEXT, fontSize: 16, fontWeight: '700', marginRight: 8 },
  medNameTaken: { color: SUCCESS },
  takenBadge: {
    backgroundColor: '#1a3d2c', color: SUCCESS,
    fontSize: 11, fontWeight: '700', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 10,
  },
  skippedBadge: {
    backgroundColor: '#2d1a1a', color: DANGER,
    fontSize: 11, fontWeight: '700', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 10,
  },
  medDetail: { color: SUB, fontSize: 12, marginBottom: 2 },
  medInstructions: { color: SUB, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  takenAt: { color: SUCCESS, fontSize: 11, marginTop: 4 },

  // Action buttons
  medActions: { alignItems: 'center', justifyContent: 'center' },
  actionBtns: { gap: 6 },
  actionBtn: {
    borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#1a3d2c', borderColor: '#2a7a5a',
  },
  actionBtnSkip: {
    backgroundColor: '#2d1a1a', borderColor: '#4a1010',
  },
  actionBtnText: { color: SUB, fontSize: 12, fontWeight: '600' },
  actionBtnTextActive: { color: SUCCESS },
  actionBtnTextSkip: { color: DANGER },

  // Safety footer
  safetyCard: {
    backgroundColor: '#1a0a0a', borderRadius: 16,
    borderWidth: 1, borderColor: '#4a1010', padding: 16, marginTop: 8,
    alignItems: 'center',
  },
  safetyText: { color: SUB, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  safetyHighlight: { color: DANGER, fontSize: 13, fontWeight: '700' },

  // Add modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#161a27', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalSub: { color: SUB, fontSize: 13, marginBottom: 20 },

  // Form fields
  fieldLabel: { color: SUB, fontSize: 12, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: BG, borderRadius: 8, borderWidth: 1,
    borderColor: BORDER, color: TEXT, fontSize: 14,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  doseRow: { flexDirection: 'row', marginTop: 0 },

  // Frequency chips
  freqScroll: { marginBottom: 4 },
  freqChip: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, marginRight: 8,
    backgroundColor: BG,
  },
  freqChipActive: {
    borderColor: DESIGN_TOKENS.COLOR_PRIMARY,
    backgroundColor: '#0d2420',
  },
  freqChipText: { color: SUB, fontSize: 12 },
  freqChipTextActive: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontWeight: '600' },

  // Toggle row
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 12,
  },

  // Modal buttons
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: SUB, fontWeight: '600', fontSize: 14 },
  submitBtn: {
    flex: 2, backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
