// =============================================================================
// MindLog Mobile — Settings index
// Navigation hub for all settings sub-screens.
// =============================================================================

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@mindlog/shared';

const ITEMS = [
  {
    label: 'Notifications',
    description: 'Check-in reminders, weekly reports',
    route: '/settings/notifications' as const,
  },
  {
    label: 'Privacy & Consent',
    description: 'Manage data sharing and HIPAA consents',
    route: '/settings/consent' as const,
  },
  {
    label: 'Biometric Lock',
    description: 'Face ID / fingerprint app protection',
    route: '/settings/biometric' as const,
  },
];

export default function SettingsIndexScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          {ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, i === 0 && styles.rowFirst]}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowDesc}>{item.description}</Text>
              </View>
              <Text style={styles.rowArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { marginBottom: 8 },
  backText: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 15 },
  title: { color: TEXT, fontSize: 22, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 40 },
  section: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  rowFirst: { borderTopWidth: 0 },
  rowContent: { flex: 1 },
  rowLabel: { color: TEXT, fontSize: 15, fontWeight: '500' },
  rowDesc: { color: SUB, fontSize: 12, marginTop: 2 },
  rowArrow: { color: SUB, fontSize: 18 },
});
