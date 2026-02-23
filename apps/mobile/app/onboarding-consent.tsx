// =============================================================================
// MindLog Mobile — Post-registration consent wizard
// Screen 1: Welcome
// Screen 2: Required consents (ToS + Privacy Policy — already stored at register)
// Screen 3: Optional consents (Data Research, AI Insights)
// =============================================================================

import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { apiFetch, getStoredUser } from '../services/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const TOTAL_SCREENS = 3;

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postConsent(consent_type: string, granted: boolean) {
  try {
    await apiFetch('/consent', {
      method: 'POST',
      body: JSON.stringify({ consent_type, granted }),
    });
  } catch {
    // Non-fatal — optional consents
  }
}

// ---------------------------------------------------------------------------
// Screen 1 — Welcome
// ---------------------------------------------------------------------------

function WelcomeScreen({ firstName, clinicianName, onNext }: {
  firstName: string;
  clinicianName: string;
  onNext: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <LinearGradient
        colors={['#1a1f35', '#161a27']}
        style={styles.welcomeCard}
      >
        <Text style={styles.welcomeEmoji}>👋</Text>
        <Text style={styles.welcomeHeading}>Welcome{firstName ? `, ${firstName}` : ''}!</Text>
        <Text style={styles.welcomeBody}>
          {clinicianName
            ? `${clinicianName} has invited you to MindLog to help track your mental wellness between appointments.`
            : 'Your care team has invited you to MindLog to help track your mental wellness between appointments.'}
        </Text>
        <Text style={styles.welcomeBody}>
          Before you start, we need a few minutes to walk through your legal consents and a brief clinical intake.
        </Text>
      </LinearGradient>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          🔒 Your data is encrypted and only visible to you and the clinicians on your care team.
        </Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext}>
        <Text style={styles.primaryBtnText}>Get Started →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — Required Consents
// ---------------------------------------------------------------------------

const TOS_TEXT = `By using MindLog, you agree to the following terms:

1. ELIGIBILITY — You must be 18 years of age or older to use MindLog.

2. PURPOSE — MindLog is a health tracking tool. It is not a substitute for professional medical advice, diagnosis, or treatment.

3. DATA — Your data is stored securely and shared only with clinicians on your care team.

4. ACCOUNT — You are responsible for maintaining the confidentiality of your account credentials.

5. CRISIS — If you are in crisis or danger, please contact emergency services or call/text 988 immediately. MindLog is not a crisis service.

6. CHANGES — We may update these terms from time to time. Continued use constitutes acceptance.`;

const PRIVACY_TEXT = `Your privacy and the security of your health information is our highest priority.

WHAT WE COLLECT
• Daily check-in responses (mood, sleep, symptoms)
• Journal entries you choose to share
• Medication records you add
• Device and usage analytics

HOW WE USE IT
• To show your care team clinically relevant trends
• To generate insights for your own review
• To send you reminders you configure

HIPAA COMPLIANCE
MindLog operates as a Business Associate under HIPAA. Your Protected Health Information (PHI) is encrypted at rest and in transit and is never sold to third parties.

YOUR RIGHTS
• Access and download your data at any time
• Request deletion of your account and data
• Revoke consent to share with your care team

CONTACT
privacy@mindlog.app`;

function RequiredConsentsScreen({ onNext }: { onNext: () => void }) {
  const [tosAgreed, setTosAgreed] = useState(false);
  const [ppAgreed, setPpAgreed] = useState(false);
  const canContinue = tosAgreed && ppAgreed;

  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Text style={styles.screenHeading}>Legal Consents</Text>
      <Text style={styles.screenSubtitle}>Both are required to use MindLog.</Text>

      {/* Terms of Service */}
      <View style={styles.consentCard}>
        <Text style={styles.consentCardTitle}>Terms of Service</Text>
        <ScrollView style={styles.consentScroll} nestedScrollEnabled>
          <Text style={styles.consentBody}>{TOS_TEXT}</Text>
        </ScrollView>
        <TouchableOpacity
          style={[styles.agreeBtn, tosAgreed && styles.agreedBtn]}
          onPress={() => setTosAgreed(true)}
          disabled={tosAgreed}
        >
          <Text style={styles.agreeBtnText}>{tosAgreed ? '✓ Agreed' : 'I Agree'}</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy Policy */}
      <View style={styles.consentCard}>
        <Text style={styles.consentCardTitle}>Privacy Policy &amp; HIPAA Notice</Text>
        <ScrollView style={styles.consentScroll} nestedScrollEnabled>
          <Text style={styles.consentBody}>{PRIVACY_TEXT}</Text>
        </ScrollView>
        <TouchableOpacity
          style={[styles.agreeBtn, ppAgreed && styles.agreedBtn]}
          onPress={() => setPpAgreed(true)}
          disabled={ppAgreed}
        >
          <Text style={styles.agreeBtnText}>{ppAgreed ? '✓ Agreed' : 'I Agree'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canContinue && styles.primaryBtnDisabled]}
        onPress={onNext}
        disabled={!canContinue}
      >
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Optional Consents
// ---------------------------------------------------------------------------

function OptionalConsentsScreen({ onFinish }: { onFinish: () => void }) {
  const [dataResearch, setDataResearch] = useState(false);
  const [aiInsights, setAiInsights] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    setSaving(true);
    try {
      await Promise.all([
        postConsent('data_research', dataResearch),
        postConsent('ai_insights', aiInsights),
      ]);
    } finally {
      setSaving(false);
      onFinish();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Text style={styles.screenHeading}>Optional Permissions</Text>
      <Text style={styles.screenSubtitle}>
        These are optional — you can change them at any time in Settings → Privacy.
      </Text>

      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={styles.optionTitle}>Research &amp; Quality Improvement</Text>
            <Text style={styles.optionDesc}>
              Allow de-identified data to be used to improve mental health care. No personally
              identifying information is ever shared.
            </Text>
          </View>
          <Switch
            value={dataResearch}
            onValueChange={setDataResearch}
            trackColor={{ false: BORDER, true: PRIMARY }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={styles.optionTitle}>AI-Powered Insights</Text>
            <Text style={styles.optionDesc}>
              Allow an AI model to analyse your check-in patterns and generate personalised
              insights. Requires a signed Business Associate Agreement.
            </Text>
          </View>
          <Switch
            value={aiInsights}
            onValueChange={setAiInsights}
            trackColor={{ false: BORDER, true: PRIMARY }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
        onPress={() => void handleContinue()}
        disabled={saving}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Continue →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Root wizard — manages slide transitions between the 3 screens
// ---------------------------------------------------------------------------

export default function OnboardingConsentScreen() {
  const [screen, setScreen] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [firstName, setFirstName] = useState('');
  const [clinicianName, setClinicianName] = useState('');

  // Load user name from SecureStore on mount
  useState(() => {
    getStoredUser().then((u) => {
      if (u?.email) {
        // first_name is not stored separately — fetch from /patients/me
        apiFetch('/patients/me').then(async (res) => {
          if (res.ok) {
            const json = (await res.json()) as { success: boolean; data?: { first_name?: string } };
            if (json.success && json.data?.first_name) setFirstName(json.data.first_name);
          }
        }).catch(() => undefined);
      }
    }).catch(() => undefined);
  });

  const goToScreen = (next: number) => {
    Animated.timing(slideAnim, {
      toValue: -next * SCREEN_W,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setScreen(next));
    setScreen(next);
  };

  const handleFinish = () => {
    router.replace('/onboarding-intake');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
          <View key={i} style={[styles.dot, i <= screen && styles.dotActive]} />
        ))}
      </View>

      {screen === 0 && (
        <WelcomeScreen
          firstName={firstName}
          clinicianName={clinicianName}
          onNext={() => goToScreen(1)}
        />
      )}
      {screen === 1 && (
        <RequiredConsentsScreen onNext={() => goToScreen(2)} />
      )}
      {screen === 2 && (
        <OptionalConsentsScreen onFinish={handleFinish} />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  dots: { flexDirection: 'row', justifyContent: 'center', paddingTop: 16, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BORDER },
  dotActive: { backgroundColor: PRIMARY },

  screenContent: { padding: 24, paddingBottom: 48 },
  screenHeading: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  screenSubtitle: { color: SUB, fontSize: 14, marginBottom: 24, lineHeight: 20 },

  welcomeCard: {
    borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 20,
  },
  welcomeEmoji: { fontSize: 40, marginBottom: 12 },
  welcomeHeading: { color: TEXT, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  welcomeBody: { color: SUB, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 12 },

  infoBox: {
    backgroundColor: '#1e2535', borderRadius: 10, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: BORDER,
  },
  infoText: { color: SUB, fontSize: 13, lineHeight: 20 },

  consentCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 20, marginBottom: 16,
  },
  consentCardTitle: { color: TEXT, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  consentScroll: { maxHeight: 180, marginBottom: 16 },
  consentBody: { color: SUB, fontSize: 13, lineHeight: 20 },
  agreeBtn: {
    backgroundColor: BORDER, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  agreedBtn: { backgroundColor: '#14532d' },
  agreeBtnText: { color: TEXT, fontWeight: '600', fontSize: 14 },

  optionCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 20, marginBottom: 16,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  optionTitle: { color: TEXT, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  optionDesc: { color: SUB, fontSize: 13, lineHeight: 19 },

  primaryBtn: {
    backgroundColor: PRIMARY, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
