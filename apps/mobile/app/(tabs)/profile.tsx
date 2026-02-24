// =============================================================================
// MindLog Mobile — Profile tab
// Phase 4: real account info from GET /patients/me, dynamic version
// =============================================================================

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { DESIGN_TOKENS, CRISIS_CONTACTS } from '@mindlog/shared';
import { clearSession, apiFetch } from '../../services/auth';

interface PatientProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string;
  date_of_birth: string | null;
  status: string;
  risk_level: string;
  tracking_streak: number;
  longest_streak: number;
  last_checkin_at: string | null;
  timezone: string | null;
  onboarding_complete: boolean;
  created_at?: string;
}

function formatMemberSince(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/patients/me')
      .then(r => r.ok ? r.json() : null)
      .then((json: { success: boolean; data: PatientProfile } | null) => {
        if (json?.success) setProfile(json.data);
      })
      .catch(() => {/* silently degrade */})
      .finally(() => setLoading(false));
  }, []);

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

  const displayName = profile?.preferred_name
    ?? (profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : null)
    ?? profile?.email
    ?? '—';

  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Profile</Text>

        {/* ---- Account info card ---- */}
        <View style={styles.accountCard}>
          {loading ? (
            <ActivityIndicator color={DESIGN_TOKENS.COLOR_PRIMARY} />
          ) : (
            <>
              <View testID="profile-avatar" style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {(profile?.preferred_name ?? profile?.first_name ?? profile?.email ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.accountName}>{displayName}</Text>
              <Text style={styles.accountEmail}>{profile?.email ?? '—'}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: DESIGN_TOKENS.COLOR_PRIMARY }]}>
                    {profile?.tracking_streak ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Day streak</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: DESIGN_TOKENS.COLOR_PRIMARY }]}>
                    {profile?.longest_streak ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Best streak</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {formatMemberSince((profile as PatientProfile & { created_at?: string })?.created_at)}
                  </Text>
                  <Text style={styles.statLabel}>Member since</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ---- Settings ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
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

        {/* ---- Safety resources ---- */}
        <View testID="profile-crisis-card" style={styles.safetyCard}>
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

        {/* ---- Sign out ---- */}
        <TouchableOpacity testID="sign-out-btn" style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MindLog v{version} · US edition</Text>
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

  // Account card
  accountCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 20, marginBottom: 16, alignItems: 'center',
  },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY + '33',
    borderWidth: 2, borderColor: DESIGN_TOKENS.COLOR_PRIMARY,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarInitial: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 26, fontWeight: '700' },
  accountName: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  accountEmail: { color: SUB, fontSize: 13, marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: TEXT, fontSize: 18, fontWeight: '700' },
  statLabel: { color: SUB, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: BORDER },

  // Settings list
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

  // Safety
  safetyCard: {
    backgroundColor: '#1a0a0a', borderRadius: 16, borderWidth: 1,
    borderColor: '#4a1010', padding: 16, marginBottom: 16,
  },
  safetyTitle: { color: '#fc8181', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  safetyLine: { color: SUB, fontSize: 12, marginBottom: 2 },
  safetyHighlight: { color: '#fc8181', fontSize: 14, fontWeight: '700', marginBottom: 8 },

  // Sign out
  signOutBtn: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 14, alignItems: 'center', marginBottom: 16,
  },
  signOutText: { color: DESIGN_TOKENS.COLOR_DANGER, fontWeight: '600', fontSize: 15 },
  version: { color: '#2d3748', fontSize: 11, textAlign: 'center' },
});
