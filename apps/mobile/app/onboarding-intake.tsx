// =============================================================================
// MindLog Mobile — Clinical intake wizard (7 steps)
// Step 1: Primary concern          (required, no skip)
// Step 2: Current medications      (skippable)
// Step 3: Symptoms                 (skippable)
// Step 4: Mood triggers            (skippable)
// Step 5: Emergency contact        (skippable)
// Step 6: Daily reminders          (not skippable — pushes notification prefs)
// Step 7: All set!                 (confirmation + navigate to Today)
// =============================================================================

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { apiFetch, setIntakeComplete } from '../services/auth';

const TOTAL_STEPS = 7;
const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[styles.progressSegment, i < step && styles.progressSegmentFilled]}
        />
      ))}
    </View>
  );
}

function NavHeader({
  step,
  onBack,
  onSkip,
}: {
  step: number;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  return (
    <View style={styles.navHeader}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      ) : <View style={{ width: 64 }} />}
      <Text style={styles.navStepText}>{step} of {TOTAL_STEPS}</Text>
      {onSkip ? (
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
      ) : <View style={{ width: 64 }} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Primary Concern
// ---------------------------------------------------------------------------

const PRIMARY_CONCERNS = [
  { label: 'Depression / Low Mood', icon: '😔' },
  { label: 'Anxiety', icon: '😰' },
  { label: 'Bipolar Disorder', icon: '🌊' },
  { label: 'PTSD / Trauma', icon: '🧩' },
  { label: 'ADHD', icon: '⚡' },
  { label: 'Sleep Problems', icon: '😴' },
  { label: 'Other', icon: '💬' },
];

function Step1PrimaryConcern({ onNext }: { onNext: (concern: string) => void }) {
  const [selected, setSelected] = useState('');
  const [other, setOther] = useState('');

  const handleNext = () => {
    const concern = selected === 'Other' ? other.trim() : selected;
    if (!concern) {
      Alert.alert('Please select a concern', 'Tap one of the options to continue.');
      return;
    }
    onNext(concern);
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>What brings you to care?</Text>
      <Text style={styles.stepSubtitle}>Select the area that best describes your main concern.</Text>

      <View style={styles.grid}>
        {PRIMARY_CONCERNS.map((c) => (
          <TouchableOpacity
            key={c.label}
            style={[styles.chip, selected === c.label && styles.chipSelected]}
            onPress={() => setSelected(c.label)}
          >
            <Text style={styles.chipIcon}>{c.icon}</Text>
            <Text style={[styles.chipLabel, selected === c.label && styles.chipLabelSelected]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {selected === 'Other' && (
        <TextInput
          style={styles.input}
          value={other}
          onChangeText={setOther}
          placeholder="Describe your main concern…"
          placeholderTextColor="#4a5568"
          multiline
          numberOfLines={3}
        />
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Current Medications
// ---------------------------------------------------------------------------

interface MedEntry {
  name: string;
  dose: string;
  frequency: string;
}

const FREQ_OPTIONS = ['Once daily', 'Twice daily', 'Three times daily', 'As needed', 'Weekly', 'Other'];

function Step2Medications({ onNext, onSkip }: { onNext: (meds: MedEntry[]) => void; onSkip: () => void }) {
  const [search, setSearch] = useState('');
  const [meds, setMeds] = useState<MedEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newDose, setNewDose] = useState('');
  const [newFreq, setNewFreq] = useState(FREQ_OPTIONS[0]!);

  const addMed = () => {
    if (!search.trim()) return;
    setMeds((prev) => [...prev, { name: search.trim(), dose: newDose, frequency: newFreq }]);
    setSearch('');
    setNewDose('');
    setShowAdd(false);
  };

  const removeMed = (i: number) => setMeds((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>Current Medications</Text>
      <Text style={styles.stepSubtitle}>
        Add any medications you take. Tracking these will personalise your daily check-in.
      </Text>

      {meds.map((m, i) => (
        <View key={i} style={styles.medChip}>
          <Text style={styles.medChipText}>{m.name} · {m.dose || '—'} · {m.frequency}</Text>
          <TouchableOpacity onPress={() => removeMed(i)}>
            <Text style={styles.removeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TextInput
        style={styles.input}
        value={search}
        onChangeText={(v) => { setSearch(v); setShowAdd(v.trim().length > 0); }}
        placeholder="Search or type a medication name…"
        placeholderTextColor="#4a5568"
      />

      {showAdd && (
        <View style={styles.addMedBox}>
          <TextInput
            style={styles.input}
            value={newDose}
            onChangeText={setNewDose}
            placeholder="Dose (e.g. 50mg)"
            placeholderTextColor="#4a5568"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {FREQ_OPTIONS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.freqChip, newFreq === f && styles.freqChipSelected]}
                onPress={() => setNewFreq(f)}
              >
                <Text style={[styles.freqChipText, newFreq === f && styles.freqChipTextSelected]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.addBtn} onPress={addMed}>
            <Text style={styles.addBtnText}>+ Add {search}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onNext(meds)}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>Skip — I don't take any medications</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Symptoms
// ---------------------------------------------------------------------------

function Step3Symptoms({ onNext, onSkip }: {
  onNext: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    apiFetch('/catalogues/symptoms').then(async (res) => {
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; data?: { id: string; name: string }[] };
        if (json.success && json.data) setItems(json.data.slice(0, 24));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>Symptoms You Experience</Text>
      <Text style={styles.stepSubtitle}>
        Tracking these will personalise your daily check-in.
      </Text>

      {!loaded && <Text style={styles.loadingText}>Loading…</Text>}

      <View style={styles.chipGrid}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.smallChip, selected.has(item.id) && styles.chipSelected]}
            onPress={() => toggle(item.id)}
          >
            <Text style={[styles.smallChipLabel, selected.has(item.id) && styles.chipLabelSelected]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onNext([...selected])}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>Skip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Triggers
// ---------------------------------------------------------------------------

function Step4Triggers({ onNext, onSkip }: {
  onNext: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    apiFetch('/catalogues/triggers').then(async (res) => {
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; data?: { id: string; name: string }[] };
        if (json.success && json.data) setItems(json.data.slice(0, 24));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>Things That Affect Your Mood</Text>
      <Text style={styles.stepSubtitle}>
        Select common triggers so we can track patterns for you.
      </Text>

      {!loaded && <Text style={styles.loadingText}>Loading…</Text>}

      <View style={styles.chipGrid}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.smallChip, selected.has(item.id) && styles.chipSelected]}
            onPress={() => toggle(item.id)}
          >
            <Text style={[styles.smallChipLabel, selected.has(item.id) && styles.chipLabelSelected]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onNext([...selected])}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>Skip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Emergency Contact
// ---------------------------------------------------------------------------

const RELATIONSHIP_OPTIONS = ['Partner', 'Parent', 'Sibling', 'Friend', 'Therapist', 'Other'];

function Step5EmergencyContact({ onNext, onSkip }: {
  onNext: (data: { name: string; phone: string; relationship: string }) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');

  const handleNext = () => {
    if (!name.trim() || !phone.trim() || !relationship) {
      Alert.alert('Missing details', 'Please fill in all emergency contact fields or skip this step.');
      return;
    }
    onNext({ name: name.trim(), phone: phone.trim(), relationship });
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>Emergency Contact</Text>
      <Text style={styles.stepSubtitle}>
        This is only shared with your care team if there is a safety concern.
      </Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sarah Smith"
        placeholderTextColor="#4a5568"
        autoComplete="name"
      />

      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 (555) 000-0000"
        placeholderTextColor="#4a5568"
        keyboardType="phone-pad"
        autoComplete="tel"
      />

      <Text style={styles.label}>Relationship</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {RELATIONSHIP_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.freqChip, relationship === r && styles.freqChipSelected]}
            onPress={() => setRelationship(r)}
          >
            <Text style={[styles.freqChipText, relationship === r && styles.freqChipTextSelected]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>Add Later</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Daily Reminders
// ---------------------------------------------------------------------------

function Step6Reminders({ hasMeds, onNext }: { hasMeds: boolean; onNext: () => void }) {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [medReminders, setMedReminders] = useState(true);
  const [reminderHour, setReminderHour] = useState(20); // 8pm default
  const [saving, setSaving] = useState(false);

  const requestAndSave = async () => {
    setSaving(true);
    try {
      if (!notifEnabled) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Notifications blocked',
            'You can enable them later in your device Settings → Notifications → MindLog.',
          );
          onNext();
          return;
        }
        setNotifEnabled(true);
      }

      // Save notification preferences
      await apiFetch('/notifications/prefs', {
        method: 'POST',
        body: JSON.stringify({
          daily_checkin_enabled: true,
          daily_checkin_time: `${String(reminderHour).padStart(2, '0')}:00`,
          medication_reminders_enabled: hasMeds ? medReminders : false,
        }),
      });
    } catch {
      // Non-fatal
    } finally {
      setSaving(false);
      onNext();
    }
  };

  // Simple hour picker
  const adjustHour = (delta: number) =>
    setReminderHour((h) => (h + delta + 24) % 24);

  const formatHour = (h: number) => {
    const suffix = h < 12 ? 'AM' : 'PM';
    const display = h % 12 || 12;
    return `${display}:00 ${suffix}`;
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepHeading}>Daily Reminders</Text>
      <Text style={styles.stepSubtitle}>
        A daily reminder helps build your check-in streak. You can change this anytime in Settings.
      </Text>

      <View style={styles.reminderCard}>
        <Text style={styles.reminderCardTitle}>Daily Check-In Reminder</Text>
        <View style={styles.hourPicker}>
          <TouchableOpacity style={styles.hourBtn} onPress={() => adjustHour(-1)}>
            <Text style={styles.hourBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.hourDisplay}>{formatHour(reminderHour)}</Text>
          <TouchableOpacity style={styles.hourBtn} onPress={() => adjustHour(1)}>
            <Text style={styles.hourBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {hasMeds && (
        <View style={styles.optionCard}>
          <View style={styles.optionRow}>
            <Text style={[styles.optionTitle, { flex: 1 }]}>Medication Reminders</Text>
            <Switch
              value={medReminders}
              onValueChange={setMedReminders}
              trackColor={{ false: BORDER, true: PRIMARY }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
        onPress={() => void requestAndSave()}
        disabled={saving}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Saving…' : 'Enable Notifications'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — All Set!
// ---------------------------------------------------------------------------

function Step7Complete({ firstName, onCheckin, onExplore }: {
  firstName: string;
  onCheckin: () => void;
  onExplore: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={[styles.stepContent, { alignItems: 'center' }]}>
      <LinearGradient
        colors={['#1a1f35', '#161a27']}
        style={styles.completeCard}
      >
        <Text style={styles.completeEmoji}>🎉</Text>
        <Text style={styles.completeHeading}>
          You're ready{firstName ? `, ${firstName}` : ''}!
        </Text>
        <Text style={styles.completeBody}>
          Your profile is set up. Your care team can now see your check-ins as you build your streak.
        </Text>
      </LinearGradient>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💡 Check your Insights tab after 7 days to see your first mood patterns.
        </Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onCheckin}>
        <Text style={styles.primaryBtnText}>Start My First Check-In</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={onExplore}>
        <Text style={styles.skipLinkText}>Explore the app first</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Root wizard
// ---------------------------------------------------------------------------

export default function OnboardingIntakeScreen() {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [hasMeds, setHasMeds] = useState(false);

  // Load patient name on mount
  useState(() => {
    apiFetch('/patients/me').then(async (res) => {
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; data?: { first_name?: string } };
        if (json.success && json.data?.first_name) setFirstName(json.data.first_name);
      }
    }).catch(() => undefined);
  });

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  // Step 1 handler
  const handleConcern = useCallback(async (concern: string) => {
    try {
      await apiFetch('/patients/me/intake', {
        method: 'PATCH',
        body: JSON.stringify({ primary_concern: concern }),
      });
    } catch { /* non-fatal */ }
    next();
  }, []);

  // Step 2 handler
  const handleMedications = useCallback(async (meds: MedEntry[]) => {
    setHasMeds(meds.length > 0);
    for (const med of meds) {
      try {
        await apiFetch('/medications', {
          method: 'POST',
          body: JSON.stringify({
            medication_name: med.name,
            dose: med.dose ? parseFloat(med.dose) : undefined,
            frequency: 'once_daily_morning', // simplified mapping
          }),
        });
      } catch { /* non-fatal */ }
    }
    next();
  }, []);

  // Step 3 handler
  const handleSymptoms = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      try {
        await apiFetch('/patients/me/symptoms', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
      } catch { /* non-fatal */ }
    }
    next();
  }, []);

  // Step 4 handler
  const handleTriggers = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      try {
        await apiFetch('/patients/me/triggers', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
      } catch { /* non-fatal */ }
    }
    next();
  }, []);

  // Step 5 handler
  const handleEmergencyContact = useCallback(async (data: {
    name: string; phone: string; relationship: string;
  }) => {
    try {
      await apiFetch('/patients/me/intake', {
        method: 'PATCH',
        body: JSON.stringify({
          emergency_contact_name: data.name,
          emergency_contact_phone: data.phone,
          emergency_contact_relationship: data.relationship,
        }),
      });
    } catch { /* non-fatal */ }
    next();
  }, []);

  // Step 6 complete → mark intake done
  const handleRemindersNext = useCallback(async () => {
    try {
      await apiFetch('/patients/me/intake', {
        method: 'PATCH',
        body: JSON.stringify({ mark_complete: true }),
      });
      await setIntakeComplete(true);
    } catch { /* non-fatal */ }
    next();
  }, []);

  const goToCheckin = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
    // Small delay so tabs are mounted before pushing the checkin modal
    setTimeout(() => router.push('/checkin'), 100);
  };

  const goToTabs = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ProgressBar step={step} />

      {step > 1 && step < 7 && step === 6 && (
        <NavHeader step={step} onBack={back} />
      )}
      {step > 1 && step < 7 && step !== 6 && (
        <NavHeader step={step} onBack={back} onSkip={next} />
      )}
      {step === 1 && <NavHeader step={step} />}
      {step === 7 && <NavHeader step={step} />}

      {step === 1 && <Step1PrimaryConcern onNext={(c) => void handleConcern(c)} />}
      {step === 2 && (
        <Step2Medications
          onNext={(meds) => void handleMedications(meds)}
          onSkip={() => { setHasMeds(false); next(); }}
        />
      )}
      {step === 3 && (
        <Step3Symptoms
          onNext={(ids) => void handleSymptoms(ids)}
          onSkip={next}
        />
      )}
      {step === 4 && (
        <Step4Triggers
          onNext={(ids) => void handleTriggers(ids)}
          onSkip={next}
        />
      )}
      {step === 5 && (
        <Step5EmergencyContact
          onNext={(data) => void handleEmergencyContact(data)}
          onSkip={next}
        />
      )}
      {step === 6 && (
        <Step6Reminders
          hasMeds={hasMeds}
          onNext={() => void handleRemindersNext()}
        />
      )}
      {step === 7 && (
        <Step7Complete
          firstName={firstName}
          onCheckin={goToCheckin}
          onExplore={goToTabs}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  progressRow: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 12, gap: 6 },
  progressSegment: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: BORDER,
  },
  progressSegmentFilled: { backgroundColor: PRIMARY },

  navHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 8,
  },
  backBtn: { padding: 8 },
  backBtnText: { color: PRIMARY, fontSize: 14, fontWeight: '600' },
  navStepText: { color: SUB, fontSize: 13 },
  skipBtn: { padding: 8 },
  skipBtnText: { color: SUB, fontSize: 14 },

  stepContent: { padding: 24, paddingBottom: 48 },
  stepHeading: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  stepSubtitle: { color: SUB, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  loadingText: { color: SUB, fontSize: 14, textAlign: 'center', marginVertical: 16 },

  // Grid chips (Step 1)
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip: {
    flexBasis: '47%', backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 16, alignItems: 'center',
  },
  chipSelected: { borderColor: PRIMARY, backgroundColor: '#1a1f35' },
  chipIcon: { fontSize: 24, marginBottom: 6 },
  chipLabel: { color: SUB, fontSize: 13, textAlign: 'center', fontWeight: '600' },
  chipLabelSelected: { color: PRIMARY },

  // Flat chip grid (Steps 3+4)
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  smallChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: CARD, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
  },
  smallChipLabel: { color: SUB, fontSize: 13, fontWeight: '500' },

  // Medication chips
  medChip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  medChipText: { color: TEXT, fontSize: 13, flex: 1 },
  removeBtn: { color: '#fc8181', fontSize: 16, paddingLeft: 8 },
  addMedBox: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 16,
  },
  addBtn: {
    backgroundColor: '#1e2535', borderRadius: 10, padding: 12, alignItems: 'center',
  },
  addBtnText: { color: PRIMARY, fontSize: 14, fontWeight: '600' },

  // Frequency chips
  freqChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: CARD, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, marginRight: 8,
  },
  freqChipSelected: { borderColor: PRIMARY, backgroundColor: '#1a1f35' },
  freqChipText: { color: SUB, fontSize: 13 },
  freqChipTextSelected: { color: PRIMARY, fontWeight: '600' },

  // Emergency contact / Step 5
  label: { color: SUB, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: TEXT, fontSize: 15, padding: 14, marginBottom: 12,
  },

  // Step 6
  reminderCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 20, marginBottom: 16, alignItems: 'center',
  },
  reminderCardTitle: { color: TEXT, fontSize: 15, fontWeight: '600', marginBottom: 16 },
  hourPicker: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  hourBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center',
  },
  hourBtnText: { color: TEXT, fontSize: 22, lineHeight: 28 },
  hourDisplay: { color: TEXT, fontSize: 22, fontWeight: '700', minWidth: 100, textAlign: 'center' },

  optionCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 20, marginBottom: 16,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  optionTitle: { color: TEXT, fontSize: 15, fontWeight: '600' },

  // Step 7
  completeCard: {
    borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 20, width: '100%',
  },
  completeEmoji: { fontSize: 52, marginBottom: 16 },
  completeHeading: { color: TEXT, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  completeBody: { color: SUB, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  infoBox: {
    backgroundColor: '#1e2535', borderRadius: 10, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: BORDER, width: '100%',
  },
  infoText: { color: SUB, fontSize: 13, lineHeight: 20 },

  primaryBtn: {
    backgroundColor: PRIMARY, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8, width: '100%',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skipLink: { marginTop: 16, alignItems: 'center' },
  skipLinkText: { color: SUB, fontSize: 14 },
});
