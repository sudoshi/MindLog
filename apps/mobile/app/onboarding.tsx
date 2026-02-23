// =============================================================================
// MindLog Mobile — Onboarding screen
// Two tabs: Sign In (existing) | Create Account (invite-only registration)
// =============================================================================

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, LoginSchema, CRISIS_CONTACTS } from '@mindlog/shared';
import { storeSession, setMfaPartialToken, apiFetch } from '../services/auth';
import { backgroundSync } from '../db/sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function passwordStrength(pw: string): 'weak' | 'fair' | 'strong' {
  const has = (re: RegExp) => re.test(pw);
  const score =
    (pw.length >= 12 ? 1 : 0) +
    (has(/[A-Z]/) ? 1 : 0) +
    (has(/[0-9]/) ? 1 : 0) +
    (has(/[^A-Za-z0-9]/) ? 1 : 0);
  if (score <= 1) return 'weak';
  if (score <= 2) return 'fair';
  return 'strong';
}

const STRENGTH_COLOR = { weak: '#fc8181', fair: '#fbbf24', strong: '#4ade80' };

// ---------------------------------------------------------------------------
// Sign In tab
// ---------------------------------------------------------------------------

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      Alert.alert('Validation error', result.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: {
          access_token: string;
          refresh_token?: string;
          mfa_required?: boolean;
          user?: { id: string; email: string; role: string; org_id: string };
        };
        error?: { message: string };
      };

      if (!json.success) {
        Alert.alert('Login failed', json.error?.message ?? 'Invalid credentials');
        return;
      }

      if (json.data?.mfa_required) {
        if (json.data.access_token) {
          await setMfaPartialToken(json.data.access_token);
        }
        router.replace('/mfa');
        return;
      }

      if (json.data?.access_token && json.data.user) {
        await storeSession({
          access_token: json.data.access_token,
          ...(json.data.refresh_token !== undefined && { refresh_token: json.data.refresh_token }),
          user: json.data.user,
          ...(json.data.user.role === 'clinician' && { intake_complete: true }),
        });
        backgroundSync();
      }

      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Network error', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#4a5568"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        placeholderTextColor="#4a5568"
        secureTextEntry
        autoComplete="current-password"
      />

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={() => void handleLogin()}
        disabled={loading}
      >
        <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Create Account tab
// ---------------------------------------------------------------------------

function CreateAccountForm({ initialToken }: { initialToken: string }) {
  const [inviteCode, setInviteCode] = useState(initialToken);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [inviteHint, setInviteHint] = useState('');
  const [prefillEmail, setPrefillEmail] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');            // "DD/MM/YYYY" input
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);

  const validateToken = useCallback(async (token: string) => {
    if (token.length < 6) return;
    setInviteStatus('checking');
    try {
      const res = await apiFetch(`/invites/validate/${encodeURIComponent(token)}`);
      const json = (await res.json()) as {
        success: boolean;
        data?: { clinician_name: string; org_name: string; email: string };
        error?: { message: string };
      };
      if (json.success && json.data) {
        setInviteStatus('valid');
        setInviteHint(`✓ Invited by ${json.data.clinician_name} at ${json.data.org_name}`);
        setPrefillEmail(json.data.email);
        if (!email) setEmail(json.data.email);
      } else {
        setInviteStatus('invalid');
        setInviteHint(json.error?.message ?? 'Invalid or expired invite');
      }
    } catch {
      setInviteStatus('invalid');
      setInviteHint('Could not validate — check your connection');
    }
  }, [email]);

  // Parse "DD/MM/YYYY" → "YYYY-MM-DD"
  const parseDob = (raw: string): string | null => {
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  };

  const handleRegister = async () => {
    if (inviteStatus !== 'valid') {
      Alert.alert('Invalid invite', 'Please enter a valid invite code first');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing name', 'Please enter your first and last name');
      return;
    }
    const dateOfBirth = parseDob(dob);
    if (!dateOfBirth) {
      Alert.alert('Invalid date', 'Please enter your date of birth as DD/MM/YYYY');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address');
      return;
    }
    if (password.length < 12) {
      Alert.alert('Weak password', 'Password must be at least 12 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          invite_token: inviteCode,
          email,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dateOfBirth,
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: {
          access_token: string;
          refresh_token?: string | null;
          user?: { id: string; email: string; role: string; org_id: string };
        };
        error?: { message: string };
      };

      if (!json.success || !json.data?.user) {
        Alert.alert('Registration failed', json.error?.message ?? 'Please try again');
        return;
      }

      await storeSession({
        access_token: json.data.access_token,
        ...(json.data.refresh_token ? { refresh_token: json.data.refresh_token } : {}),
        user: json.data.user,
        intake_complete: false,  // new patient — must complete intake wizard
      });

      router.replace('/onboarding-consent');
    } catch (err) {
      Alert.alert('Network error', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Invite Code</Text>
      <TextInput
        style={[
          styles.input,
          inviteStatus === 'valid' && { borderColor: '#4ade80' },
          inviteStatus === 'invalid' && { borderColor: '#fc8181' },
        ]}
        value={inviteCode}
        onChangeText={(v) => { setInviteCode(v); setInviteStatus('idle'); setInviteHint(''); }}
        onBlur={() => void validateToken(inviteCode)}
        placeholder="Paste your invite code"
        placeholderTextColor="#4a5568"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {inviteStatus === 'checking' && (
        <ActivityIndicator size="small" color={DESIGN_TOKENS.COLOR_PRIMARY} style={{ marginBottom: 8 }} />
      )}
      {inviteHint.length > 0 && (
        <Text style={[styles.hint, { color: inviteStatus === 'valid' ? '#4ade80' : '#fc8181' }]}>
          {inviteHint}
        </Text>
      )}

      <View style={styles.nameRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Jane"
            placeholderTextColor="#4a5568"
            autoComplete="given-name"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Smith"
            placeholderTextColor="#4a5568"
            autoComplete="family-name"
          />
        </View>
      </View>

      <Text style={styles.label}>Date of Birth</Text>
      <TextInput
        style={styles.input}
        value={dob}
        onChangeText={setDob}
        placeholder="DD/MM/YYYY"
        placeholderTextColor="#4a5568"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={prefillEmail || 'you@example.com'}
        placeholderTextColor="#4a5568"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <Text style={styles.label}>Password (min 12 characters)</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Create a strong password"
        placeholderTextColor="#4a5568"
        secureTextEntry
      />
      {password.length > 0 && (
        <View style={styles.strengthBar}>
          {(['weak', 'fair', 'strong'] as const).map((level) => (
            <View
              key={level}
              style={[
                styles.strengthSegment,
                { backgroundColor: passwordStrength(password) >= level ? STRENGTH_COLOR[strength] : BORDER },
              ]}
            />
          ))}
          <Text style={[styles.strengthLabel, { color: STRENGTH_COLOR[strength] }]}>
            {strength.charAt(0).toUpperCase() + strength.slice(1)}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Confirm Password</Text>
      <TextInput
        style={[
          styles.input,
          confirmPassword.length > 0 && password !== confirmPassword && { borderColor: '#fc8181' },
        ]}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Repeat your password"
        placeholderTextColor="#4a5568"
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={() => void handleRegister()}
        disabled={loading}
      >
        <Text style={styles.primaryBtnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Root screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const initialToken = params.token ?? '';
  const [tab, setTab] = useState<'signin' | 'register'>(initialToken ? 'register' : 'signin');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>MindLog</Text>
        <Text style={styles.tagline}>Your mental wellness companion</Text>

        {/* Tab toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'signin' && styles.tabActive]}
            onPress={() => setTab('signin')}
          >
            <Text style={[styles.tabText, tab === 'signin' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'register' && styles.tabActive]}
            onPress={() => setTab('register')}
          >
            <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        {tab === 'signin' ? <SignInForm /> : <CreateAccountForm initialToken={initialToken} />}

        <View style={styles.safetyCard}>
          <Text style={styles.safetyText}>
            In crisis? Call or text {CRISIS_CONTACTS.LIFELINE.phone} now.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, padding: 32, justifyContent: 'center' },

  brand: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 36, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  tagline: { color: SUB, fontSize: 14, textAlign: 'center', marginBottom: 24 },

  tabRow: {
    flexDirection: 'row', backgroundColor: CARD,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    marginBottom: 16, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY },
  tabText: { color: SUB, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  form: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 24 },
  label: { color: SUB, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: TEXT, fontSize: 15, padding: 14, marginBottom: 12,
  },
  hint: { fontSize: 12, marginBottom: 8, marginTop: -6 },
  nameRow: { flexDirection: 'row' },
  strengthBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, marginTop: -4,
  },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', marginLeft: 4 },

  primaryBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  safetyCard: {
    marginTop: 32, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#4a1010', backgroundColor: '#1a0a0a',
  },
  safetyText: { color: '#fc8181', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
