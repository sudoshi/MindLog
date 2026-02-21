// =============================================================================
// MindLog Mobile — Profile tab
// Phase 2: sign-out clears SecureStore session
// =============================================================================

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, CRISIS_CONTACTS } from '@mindlog/shared';
import { clearSession } from '../../services/auth';

export default function ProfileScreen() {
  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void clearSession().then(() => router.replace('/onboarding'));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Profile</Text>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {[
            { label: 'Notifications', onPress: () => router.push('/settings/notifications') },
            { label: 'Privacy & Consent', onPress: () => router.push('/settings/consent') },
            { label: 'Biometric Lock', onPress: () => router.push('/settings/biometric') },
          ].map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, i === 0 && styles.rowFirst]}
              onPress={item.onPress}
            >
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Safety resources */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>Crisis Resources (US)</Text>
          <Text style={styles.safetyLine}>📞 {CRISIS_CONTACTS.LIFELINE.name}</Text>
          <Text style={styles.safetyHighlight}>Call or text {CRISIS_CONTACTS.LIFELINE.phone}</Text>
          <Text style={styles.safetyLine}>💬 {CRISIS_CONTACTS.CRISIS_TEXT_LINE.name}</Text>
          <Text style={styles.safetyHighlight}>
            Text {CRISIS_CONTACTS.CRISIS_TEXT_LINE.keyword} to {CRISIS_CONTACTS.CRISIS_TEXT_LINE.text_to}
          </Text>
          <Text style={styles.safetyLine}>🎖️ {CRISIS_CONTACTS.VETERANS_CRISIS_LINE.name}</Text>
          <Text style={styles.safetyHighlight}>Call 988, {CRISIS_CONTACTS.VETERANS_CRISIS_LINE.phone_prompt}</Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MindLog v0.1.0 · US edition</Text>
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
  scroll: { padding: 20, paddingBottom: 40 },
  title: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 20 },
  section: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, marginBottom: 16, overflow: 'hidden',
  },
  sectionTitle: { color: SUB, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, padding: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  rowFirst: { borderTopWidth: 0 },
  rowLabel: { color: TEXT, fontSize: 15 },
  rowArrow: { color: SUB, fontSize: 18 },
  safetyCard: {
    backgroundColor: '#1a0a0a', borderRadius: 16, borderWidth: 1,
    borderColor: '#4a1010', padding: 16, marginBottom: 16,
  },
  safetyTitle: { color: '#fc8181', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  safetyLine: { color: SUB, fontSize: 12, marginBottom: 2 },
  safetyHighlight: { color: '#fc8181', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  signOutBtn: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 14, alignItems: 'center', marginBottom: 16,
  },
  signOutText: { color: DESIGN_TOKENS.COLOR_DANGER, fontWeight: '600', fontSize: 15 },
  version: { color: '#2d3748', fontSize: 11, textAlign: 'center' },
});
