// =============================================================================
// MindLog Mobile — Biometric lock settings screen
// Uses expo-local-authentication to enrol / unenrol biometric app lock.
// The lock status (enabled/disabled) is stored in SecureStore.
// When enabled, the root layout (Phase 3) will challenge on app foreground.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { DESIGN_TOKENS } from '@mindlog/shared';

const BIOMETRIC_KEY = 'ml_biometric_enabled';

export default function BiometricScreen() {
  const [supported, setSupported] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [hasHardware, isEnrolled, storedValue] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
      ]);
      setSupported(hasHardware);
      setEnrolled(isEnrolled);
      setEnabled(storedValue === 'true');
      setLoading(false);
    };
    void init();
  }, []);

  const handleToggle = async (value: boolean) => {
    if (value) {
      // Require authentication before enabling
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric lock',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) {
        Alert.alert('Authentication required', 'You must authenticate to enable biometric lock.');
        return;
      }
    }

    setSaving(true);
    try {
      await SecureStore.setItemAsync(BIOMETRIC_KEY, value ? 'true' : 'false');
      setEnabled(value);
    } finally {
      setSaving(false);
    }
  };

  const biometricTypeLabel = (): string => {
    // On iOS, Face ID vs Touch ID is handled by the system modal
    return 'Face ID / Touch ID / Fingerprint';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Biometric Lock</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.loading}>Checking biometric support…</Text>
        ) : !supported ? (
          <View style={styles.card}>
            <Text style={styles.unsupported}>
              This device does not have biometric hardware. Biometric lock is unavailable.
            </Text>
          </View>
        ) : !enrolled ? (
          <View style={styles.card}>
            <Text style={styles.unsupported}>
              No biometric credentials are enrolled on this device. Please set up Face ID, Touch ID,
              or fingerprint in your device Settings, then return here to enable biometric lock.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lock settings</Text>
              <View style={styles.row}>
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowLabel}>Require {biometricTypeLabel()}</Text>
                  <Text style={styles.rowSub}>Lock MindLog when you leave the app</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => void handleToggle(v)}
                  disabled={saving}
                  trackColor={{ true: DESIGN_TOKENS.COLOR_PRIMARY }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>About biometric lock</Text>
              <Text style={styles.infoText}>
                When enabled, MindLog will require your biometric credential each time you open the
                app or return from the background. Your health data is always encrypted at rest
                by your device's secure enclave.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
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
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16,
  },
  backBtn: { width: 60 },
  backText: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 16 },
  headerTitle: { color: TEXT, fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  loading: { color: SUB, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 20,
  },
  unsupported: { color: SUB, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  section: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, marginBottom: 16, overflow: 'hidden',
  },
  sectionTitle: {
    color: SUB, fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, padding: 16, paddingBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  rowTextGroup: { flex: 1, marginRight: 12 },
  rowLabel: { color: TEXT, fontSize: 15 },
  rowSub: { color: SUB, fontSize: 12, marginTop: 2 },
  infoCard: {
    backgroundColor: '#0d1a29', borderRadius: 16, borderWidth: 1,
    borderColor: '#1e3a5c', padding: 16,
  },
  infoTitle: { color: '#63b3ed', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoText: { color: SUB, fontSize: 12, lineHeight: 18 },
});
