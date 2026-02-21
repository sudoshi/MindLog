// =============================================================================
// MindLog Mobile — MFA verification screen
// Shown after successful password auth when the clinician account has TOTP enabled.
// Reads the partial token from SecureStore, calls /auth/mfa/verify, then
// stores the full session and navigates to the main app.
// =============================================================================

import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, API_PREFIX, CRISIS_CONTACTS } from '@mindlog/shared';
import {
  getMfaPartialToken, clearMfaPartialToken, storeSession, clearSession,
} from '../services/auth';

export default function MfaScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleVerify = async () => {
    const trimmed = code.trim().replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      Alert.alert('Invalid code', 'Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    try {
      const partialToken = await getMfaPartialToken();
      if (!partialToken) {
        Alert.alert('Session expired', 'Please sign in again.');
        await clearSession();
        router.replace('/onboarding');
        return;
      }

      const res = await fetch(`${API_PREFIX}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${partialToken}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: {
          access_token: string;
          refresh_token?: string;
          user: { id: string; email: string; role: string; org_id: string };
        };
        error?: { message: string };
      };

      if (!json.success || !json.data) {
        Alert.alert('Verification failed', json.error?.message ?? 'Invalid code. Please try again.');
        setCode('');
        inputRef.current?.focus();
        return;
      }

      await clearMfaPartialToken();
      await storeSession({
        access_token: json.data.access_token,
        refresh_token: json.data.refresh_token,
        user: json.data.user,
      });

      router.replace('/');
    } catch (err) {
      Alert.alert('Network error', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await clearMfaPartialToken();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Two-factor authentication</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code from your authenticator app to complete sign in.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Authenticator code</Text>
            <TextInput
              ref={inputRef}
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor="#4a5568"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={() => void handleVerify()}
            />

            <TouchableOpacity
              style={[styles.verifyBtn, (loading || code.trim().length !== 6) ? styles.verifyBtnDisabled : null]}
              onPress={() => void handleVerify()}
              disabled={loading || code.trim().length !== 6}
            >
              <Text style={styles.verifyBtnText}>
                {loading ? 'Verifying…' : 'Verify'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => void handleCancel()}>
              <Text style={styles.cancelText}>Cancel — sign in with a different account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.safetyCard}>
            <Text style={styles.safetyText}>
              In crisis? Call or text {CRISIS_CONTACTS.LIFELINE.phone} now.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  flex: { flex: 1 },
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  title: {
    color: DESIGN_TOKENS.COLOR_PRIMARY,
    fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 10,
  },
  subtitle: {
    color: SUB, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32,
  },
  card: {
    backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 24,
  },
  label: { color: SUB, fontSize: 13, marginBottom: 8 },
  codeInput: {
    backgroundColor: BG,
    borderWidth: 1, borderColor: DESIGN_TOKENS.COLOR_PRIMARY, borderRadius: 12,
    color: TEXT, fontSize: 28, fontWeight: '700',
    padding: 16, marginBottom: 20, textAlign: 'center',
    letterSpacing: 8,
  },
  verifyBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12,
  },
  verifyBtnDisabled: { backgroundColor: '#1d7a6f', opacity: 0.5 },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: SUB, fontSize: 13 },
  safetyCard: {
    marginTop: 32, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#4a1010', backgroundColor: '#1a0a0a',
  },
  safetyText: { color: '#fc8181', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
