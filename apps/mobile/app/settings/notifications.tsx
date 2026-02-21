// =============================================================================
// MindLog Mobile — Notifications settings screen
// =============================================================================

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DESIGN_TOKENS, API_PREFIX } from '@mindlog/shared';
import { apiFetch } from '../../services/auth';

interface NotifPrefs {
  daily_checkin_enabled: boolean;
  daily_checkin_time: string; // HH:MM
  weekly_report_enabled: boolean;
  alert_push_enabled: boolean;
}

const DEFAULTS: NotifPrefs = {
  daily_checkin_enabled: true,
  daily_checkin_time: '20:00',
  weekly_report_enabled: true,
  alert_push_enabled: true,
};

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/notifications/prefs');
        if (res.ok) {
          const json = (await res.json()) as { success: boolean; data: NotifPrefs };
          if (json.success) setPrefs(json.data);
        }
      } catch {
        // Use defaults silently
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const toggle = (key: keyof Pick<NotifPrefs, 'daily_checkin_enabled' | 'weekly_report_enabled' | 'alert_push_enabled'>) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/notifications/prefs', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert('Saved', 'Notification preferences updated.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.loading}>Loading…</Text>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily check-in reminder</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable reminder</Text>
                <Switch
                  value={prefs.daily_checkin_enabled}
                  onValueChange={() => toggle('daily_checkin_enabled')}
                  trackColor={{ true: DESIGN_TOKENS.COLOR_PRIMARY }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.rowLabel}>Reminder time</Text>
                <Text style={styles.rowValue}>{prefs.daily_checkin_time}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reports & alerts</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Weekly summary email</Text>
                <Switch
                  value={prefs.weekly_report_enabled}
                  onValueChange={() => toggle('weekly_report_enabled')}
                  trackColor={{ true: DESIGN_TOKENS.COLOR_PRIMARY }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.rowLabel}>Clinical alert push</Text>
                <Switch
                  value={prefs.alert_push_enabled}
                  onValueChange={() => toggle('alert_push_enabled')}
                  trackColor={{ true: DESIGN_TOKENS.COLOR_PRIMARY }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]}
              onPress={() => void save()}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save preferences'}</Text>
            </TouchableOpacity>
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
  rowLast: {},
  rowLabel: { color: TEXT, fontSize: 15, flex: 1 },
  rowValue: { color: SUB, fontSize: 15 },
  saveBtn: {
    backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY,
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: DESIGN_TOKENS.COLOR_PRIMARY_DARK },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
