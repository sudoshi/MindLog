// =============================================================================
// MindLog Mobile — Settings index
// Navigation hub for all settings sub-screens.
// Includes inline Appearance toggle (system / light / dark).
// =============================================================================

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { useColorScheme, type SchemePref } from '../../hooks/useColorScheme';

const NAV_ITEMS = [
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

const SCHEME_OPTIONS: Array<{ value: SchemePref; label: string; icon: string }> = [
  { value: 'system', label: 'System', icon: '⚙️' },
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
];

export default function SettingsIndexScreen() {
  const { preference, setOverride } = useColorScheme();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Appearance ───────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.section}>
          <View style={styles.appearanceRow}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Theme</Text>
              <Text style={styles.rowDesc}>Match OS, or choose light / dark</Text>
            </View>
          </View>
          <View style={styles.schemeToggle}>
            {SCHEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.schemeBtn,
                  preference === opt.value && styles.schemeBtnActive,
                ]}
                onPress={() => void setOverride(opt.value)}
                accessibilityLabel={`Set theme to ${opt.label}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: preference === opt.value }}
              >
                <Text style={styles.schemeIcon}>{opt.icon}</Text>
                <Text style={[
                  styles.schemeBtnText,
                  preference === opt.value && styles.schemeBtnTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Navigation items ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.section}>
          {NAV_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, i === 0 && styles.rowFirst]}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
              accessibilityLabel={item.label}
              accessibilityHint={item.description}
              accessibilityRole="button"
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

const BG      = '#0c0f18';
const CARD    = '#161a27';
const BORDER  = '#1e2535';
const TEXT    = '#e2e8f0';
const SUB     = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20,
    paddingTop:        8,
    paddingBottom:     16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn:  { marginBottom: 8 },
  backText: { color: PRIMARY, fontSize: 15 },
  title:    { color: TEXT, fontSize: 22, fontWeight: '700' },
  scroll:   { padding: 20, paddingBottom: 40 },

  sectionLabel: {
    color:          SUB,
    fontSize:       11,
    fontWeight:     '600',
    textTransform:  'uppercase',
    letterSpacing:  0.8,
    marginBottom:   8,
    marginTop:      16,
  },
  section: {
    backgroundColor: CARD,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     BORDER,
    overflow:        'hidden',
  },

  // Appearance card
  appearanceRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingTop:        14,
    paddingBottom:     10,
  },
  schemeToggle: {
    flexDirection: 'row',
    padding:       12,
    paddingTop:     0,
    gap:            8,
  },
  schemeBtn: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: 10,
    borderRadius:   10,
    borderWidth:    1,
    borderColor:    BORDER,
    backgroundColor: '#1e2535',
    minHeight:      44,
    justifyContent: 'center',
    gap:             4,
  },
  schemeBtnActive: {
    borderColor:     PRIMARY,
    backgroundColor: 'rgba(42,157,143,0.12)',
  },
  schemeIcon:          { fontSize: 16 },
  schemeBtnText:       { color: SUB, fontSize: 12, fontWeight: '500' },
  schemeBtnTextActive: { color: TEXT, fontWeight: '600' },

  // Navigation rows
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderTopWidth:    1,
    borderTopColor:    BORDER,
    minHeight:         44,
  },
  rowFirst:   { borderTopWidth: 0 },
  rowContent: { flex: 1 },
  rowLabel:   { color: TEXT, fontSize: 15, fontWeight: '500' },
  rowDesc:    { color: SUB, fontSize: 12, marginTop: 2 },
  rowArrow:   { color: SUB, fontSize: 18 },
});
