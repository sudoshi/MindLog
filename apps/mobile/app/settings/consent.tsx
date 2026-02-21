// =============================================================================
// MindLog Mobile — Privacy & Consent settings screen
// Displays the patient's active consent records and allows withdrawal.
// HIPAA §164.508 — right to revoke authorization.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, API_PREFIX } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

interface ConsentRecord {
  id: string;
  consent_type: string;
  granted_at: string;
  expires_at: string | null;
  withdrawn_at: string | null;
}

const CONSENT_LABELS: Record<string, string> = {
  HIPAA_AUTHORIZATION: 'HIPAA Authorization',
  DATA_SHARING_CARE_TEAM: 'Share data with care team',
  AI_ANALYSIS: 'AI-assisted insights',
  RESEARCH_PARTICIPATION: 'Research participation',
};

export default function ConsentScreen() {
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/consent');
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; data: ConsentRecord[] };
        if (json.success) setRecords(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const withdraw = (record: ConsentRecord) => {
    if (record.consent_type === 'HIPAA_AUTHORIZATION') {
      Alert.alert(
        'Cannot withdraw HIPAA Authorization',
        'HIPAA Authorization is required to use MindLog. Contact your care team to request record deletion.',
      );
      return;
    }

    Alert.alert(
      `Withdraw ${CONSENT_LABELS[record.consent_type] ?? record.consent_type}?`,
      'This will stop sharing this type of data immediately. Some features may become unavailable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiFetch(`/consent/${record.id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              await load();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not withdraw consent');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Consent</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          You have the right to withdraw consent at any time, except where required by law.
          Your data will continue to be retained per our HIPAA-compliant retention schedule.
        </Text>

        {loading ? (
          <Text style={styles.loading}>Loading consent records…</Text>
        ) : records.length === 0 ? (
          <Text style={styles.empty}>No consent records found.</Text>
        ) : (
          records.map((record) => {
            const active = !record.withdrawn_at;
            return (
              <View key={record.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {CONSENT_LABELS[record.consent_type] ?? record.consent_type}
                  </Text>
                  <View style={[styles.badge, active ? styles.badgeActive : styles.badgeWithdrawn]}>
                    <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextWithdrawn]}>
                      {active ? 'Active' : 'Withdrawn'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDate}>
                  Granted: {new Date(record.granted_at).toLocaleDateString()}
                  {record.expires_at ? `  ·  Expires: ${new Date(record.expires_at).toLocaleDateString()}` : ''}
                </Text>
                {record.withdrawn_at && (
                  <Text style={styles.cardDate}>
                    Withdrawn: {new Date(record.withdrawn_at).toLocaleDateString()}
                  </Text>
                )}
                {active && (
                  <TouchableOpacity
                    style={styles.withdrawBtn}
                    onPress={() => withdraw(record)}
                  >
                    <Text style={styles.withdrawBtnText}>Withdraw</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Your rights under HIPAA</Text>
          <Text style={styles.infoText}>
            You have the right to access, amend, and request an accounting of disclosures of your
            protected health information. Contact privacy@mindlog.app to exercise these rights.
          </Text>
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
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16,
  },
  backBtn: { width: 60 },
  backText: { color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 16 },
  headerTitle: { color: TEXT, fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  intro: { color: SUB, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  loading: { color: SUB, textAlign: 'center', marginTop: 40 },
  empty: { color: SUB, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
    borderColor: BORDER, padding: 16, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: TEXT, fontSize: 15, fontWeight: '600', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  badgeActive: { backgroundColor: '#0d3026' },
  badgeWithdrawn: { backgroundColor: '#2d1a1a' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: DESIGN_TOKENS.COLOR_SUCCESS },
  badgeTextWithdrawn: { color: DESIGN_TOKENS.COLOR_DANGER },
  cardDate: { color: SUB, fontSize: 12, marginBottom: 2 },
  withdrawBtn: {
    marginTop: 10, borderWidth: 1, borderColor: '#4a1010',
    borderRadius: 8, padding: 8, alignItems: 'center',
  },
  withdrawBtnText: { color: DESIGN_TOKENS.COLOR_DANGER, fontSize: 13, fontWeight: '600' },
  infoCard: {
    backgroundColor: '#0d1a29', borderRadius: 16, borderWidth: 1,
    borderColor: '#1e3a5c', padding: 16, marginTop: 8,
  },
  infoTitle: { color: '#63b3ed', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoText: { color: SUB, fontSize: 12, lineHeight: 18 },
});
