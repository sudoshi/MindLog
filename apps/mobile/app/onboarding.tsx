// =============================================================================
// MindLog Mobile — Onboarding / Login screen
// Phase 2: stores tokens in SecureStore via storeSession() / setMfaPartialToken()
// =============================================================================

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, LoginSchema, API_PREFIX, CRISIS_CONTACTS } from '@mindlog/shared';
import { storeSession, setMfaPartialToken } from '../services/auth';

export default function OnboardingScreen() {
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
      const res = await fetch(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        // Store the partial token so the MFA screen can use it
        if (json.data.access_token) {
          await setMfaPartialToken(json.data.access_token);
        }
        router.replace('/mfa');
        return;
      }

      if (json.data?.access_token && json.data.user) {
        await storeSession({
          access_token: json.data.access_token,
          refresh_token: json.data.refresh_token,
          user: json.data.user,
        });
      }

      router.replace('/');
    } catch (err) {
      Alert.alert('Network error', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.brand}>MindLog</Text>
        <Text style={styles.tagline}>Your mental wellness companion</Text>

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
            style={[styles.loginBtn, loading ? styles.loginBtnDisabled : null]}
            onPress={() => void handleLogin()}
            disabled={loading}
          >
            <Text style={styles.loginBtnText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.safetyCard}>
          <Text style={styles.safetyText}>
            In crisis? Call or text {CRISIS_CONTACTS.LIFELINE.phone} now.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  brand: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 36, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  tagline: { color: SUB, fontSize: 14, textAlign: 'center', marginBottom: 40 },
  form: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 24 },
  label: { color: SUB, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: TEXT, fontSize: 15, padding: 14, marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8,
  },
  loginBtnDisabled: { backgroundColor: '#1d7a6f' },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  safetyCard: {
    marginTop: 32, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#4a1010', backgroundColor: '#1a0a0a',
  },
  safetyText: { color: '#fc8181', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
