// =============================================================================
// MindLog Mobile — Health Data Service
// Wraps HealthKit (iOS) and Google Health Connect (Android) to:
//  1. Request platform-appropriate permissions
//  2. Fetch yesterday's and today's passive health data
//  3. POST to /api/v1/health-data/sync
//
// Both native modules (react-native-health / react-native-health-connect)
// gracefully degrade — if unavailable the service returns empty data without
// crashing.  Permissions are stored in SecureStore; re-requested every 30 days
// if declined.
// =============================================================================

import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from './auth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERM_GRANTED_KEY  = 'ml_health_perm_granted';
const PERM_DECLINED_KEY = 'ml_health_perm_declined_at';
const PERM_RETRY_DAYS   = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthSnapshot {
  snapshot_date:   string;       // YYYY-MM-DD
  source:          'healthkit' | 'health_connect';
  step_count?:     number | null;
  active_calories?:number | null;
  resting_hr?:     number | null;
  hrv_ms?:         number | null;
  sleep_hours?:    number | null;
  sleep_deep_pct?: number | null;
  sleep_rem_pct?:  number | null;
  o2_saturation?:  number | null;
}

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

async function wasRecentlyDeclined(): Promise<boolean> {
  const ts = await SecureStore.getItemAsync(PERM_DECLINED_KEY);
  if (!ts) return false;
  const declinedAt = new Date(ts);
  const daysSince  = (Date.now() - declinedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < PERM_RETRY_DAYS;
}

async function markDeclined(): Promise<void> {
  await SecureStore.setItemAsync(PERM_DECLINED_KEY, new Date().toISOString());
}

async function markGranted(): Promise<void> {
  await SecureStore.setItemAsync(PERM_GRANTED_KEY, 'true');
}

export async function getHealthPermissionGranted(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(PERM_GRANTED_KEY);
  return val === 'true';
}

// ---------------------------------------------------------------------------
// iOS — HealthKit via react-native-health
// ---------------------------------------------------------------------------

async function requestHealthKitPermissions(): Promise<boolean> {
  try {
    // Dynamic import so the module can be absent on Android or non-bare builds
    const { default: AppleHealthKit, Permissions } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('react-native-health') as {
        default: { initHealthKit: (opts: unknown, cb: (err: unknown) => void) => void };
        Permissions: Record<string, string>;
      };

    const options = {
      permissions: {
        read: [
          Permissions.Steps,
          Permissions.ActiveEnergyBurned,
          Permissions.HeartRate,
          Permissions.HeartRateVariability,
          Permissions.SleepAnalysis,
          Permissions.OxygenSaturation,
        ],
        write: [],
      },
    };

    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(options, (err) => {
        if (err) {
          console.warn('[healthData] HealthKit init error:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch {
    return false; // Module not available
  }
}

async function fetchHealthKitSnapshot(date: Date): Promise<Partial<HealthSnapshot>> {
  try {
    const AppleHealthKit =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('react-native-health') as { default: unknown }).default as Record<string, unknown>;

    const dateStr  = date.toISOString().substring(0, 10);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const opts = { startDate: startOfDay.toISOString(), endDate: endOfDay.toISOString() };

    const get = <T>(fn: string, options: unknown): Promise<T | null> =>
      new Promise((resolve) => {
        (AppleHealthKit[fn] as (o: unknown, cb: (err: unknown, r: T) => void) => void)(
          options,
          (err, result) => resolve(err ? null : result),
        );
      });

    const [steps, calories, hrData, hrvData, o2Data] = await Promise.all([
      get<{ value: number }>('getStepCount', opts),
      get<{ value: number }>('getActiveEnergyBurned', opts),
      get<Array<{ value: number }>>('getHeartRateSamples', opts),
      get<Array<{ value: number }>>('getHeartRateVariabilitySamples', opts),
      get<Array<{ value: number }>>('getOxygenSaturationSamples', opts),
    ]);

    const avgHR  = hrData?.length  ? hrData.reduce((s, x) => s + x.value, 0) / hrData.length   : null;
    const avgHRV = hrvData?.length ? hrvData.reduce((s, x) => s + x.value, 0) / hrvData.length : null;
    const avgO2  = o2Data?.length  ? o2Data.reduce((s, x) => s + x.value * 100, 0) / o2Data.length : null;

    return {
      snapshot_date:   dateStr,
      source:          'healthkit',
      step_count:      steps?.value != null ? Math.round(steps.value) : null,
      active_calories: calories?.value != null ? Math.round(calories.value) : null,
      resting_hr:      avgHR != null ? Math.round(avgHR) : null,
      hrv_ms:          avgHRV != null ? Math.round(avgHRV * 10) / 10 : null,
      o2_saturation:   avgO2 != null ? Math.round(avgO2 * 10) / 10 : null,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Android — Health Connect via react-native-health-connect
// ---------------------------------------------------------------------------

async function requestHealthConnectPermissions(): Promise<boolean> {
  try {
    const { initialize, requestPermission } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('react-native-health-connect') as {
        initialize: () => Promise<boolean>;
        requestPermission: (perms: unknown[]) => Promise<unknown[]>;
      };

    const ok = await initialize();
    if (!ok) return false;

    await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'HeartRateVariabilitySdnn' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
    ]);

    return true;
  } catch {
    return false;
  }
}

async function fetchHealthConnectSnapshot(date: Date): Promise<Partial<HealthSnapshot>> {
  try {
    const { readRecords } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('react-native-health-connect') as {
        readRecords: <T>(type: string, opts: unknown) => Promise<{ records: T[] }>;
      };

    const dateStr   = date.toISOString().substring(0, 10);
    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(23, 59, 59, 999);
    const timeRange = { operator: 'between', startTime: startTime.toISOString(), endTime: endTime.toISOString() };

    const [steps, calories, rhr, hrv, sleep, o2] = await Promise.all([
      readRecords<{ count: number }>('Steps', { timeRangeFilter: timeRange }),
      readRecords<{ energy: { inCalories: number } }>('ActiveCaloriesBurned', { timeRangeFilter: timeRange }),
      readRecords<{ beatsPerMinute: number }>('RestingHeartRate', { timeRangeFilter: timeRange }),
      readRecords<{ heartRateVariabilityMillis: number }>('HeartRateVariabilitySdnn', { timeRangeFilter: timeRange }),
      readRecords<{ stages: Array<{ stage: number; startTime: string; endTime: string }> }>('SleepSession', { timeRangeFilter: timeRange }),
      readRecords<{ percentage: { value: number } }>('OxygenSaturation', { timeRangeFilter: timeRange }),
    ]);

    const totalSteps    = steps.records.reduce((s, r) => s + r.count, 0);
    const totalCal      = calories.records.reduce((s, r) => s + r.energy.inCalories, 0);
    const avgRHR        = rhr.records.length ? rhr.records.reduce((s, r) => s + r.beatsPerMinute, 0) / rhr.records.length : null;
    const avgHRV        = hrv.records.length ? hrv.records.reduce((s, r) => s + r.heartRateVariabilityMillis, 0) / hrv.records.length : null;
    const avgO2         = o2.records.length  ? o2.records.reduce((s, r) => s + r.percentage.value, 0) / o2.records.length : null;

    // Sleep: stage 4 = deep, stage 5 = REM (Health Connect stage codes)
    const totalSleepMs  = sleep.records.reduce((sum, sess) => {
      return sum + sess.stages.reduce((s, st) => {
        const start = new Date(st.startTime).getTime();
        const end   = new Date(st.endTime).getTime();
        return s + (end - start);
      }, 0);
    }, 0);
    const deepSleepMs   = sleep.records.reduce((sum, sess) => {
      return sum + sess.stages.filter((st) => st.stage === 4).reduce((s, st) => {
        return s + (new Date(st.endTime).getTime() - new Date(st.startTime).getTime());
      }, 0);
    }, 0);
    const remSleepMs    = sleep.records.reduce((sum, sess) => {
      return sum + sess.stages.filter((st) => st.stage === 5).reduce((s, st) => {
        return s + (new Date(st.endTime).getTime() - new Date(st.startTime).getTime());
      }, 0);
    }, 0);
    const sleepHours    = totalSleepMs > 0 ? Math.round((totalSleepMs / 3600000) * 10) / 10 : null;
    const deepPct       = totalSleepMs > 0 ? Math.round((deepSleepMs / totalSleepMs) * 1000) / 10 : null;
    const remPct        = totalSleepMs > 0 ? Math.round((remSleepMs  / totalSleepMs) * 1000) / 10 : null;

    return {
      snapshot_date:   dateStr,
      source:          'health_connect',
      step_count:      totalSteps > 0 ? totalSteps : null,
      active_calories: totalCal > 0 ? Math.round(totalCal) : null,
      resting_hr:      avgRHR != null ? Math.round(avgRHR) : null,
      hrv_ms:          avgHRV != null ? Math.round(avgHRV * 10) / 10 : null,
      sleep_hours:     sleepHours,
      sleep_deep_pct:  deepPct,
      sleep_rem_pct:   remPct,
      o2_saturation:   avgO2 != null ? Math.round(avgO2 * 10) / 10 : null,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request platform health permissions.
 * Shows OS permission dialog; stores result in SecureStore.
 * Returns true if permission was granted.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (await wasRecentlyDeclined()) return false;

  let granted = false;
  if (Platform.OS === 'ios') {
    granted = await requestHealthKitPermissions();
  } else if (Platform.OS === 'android') {
    granted = await requestHealthConnectPermissions();
  }

  if (granted) {
    await markGranted();
  } else {
    await markDeclined();
  }
  return granted;
}

/**
 * Fetch today's and yesterday's health data, then sync to API.
 * Safe to call repeatedly — the API deduplicates via UNIQUE constraint.
 */
export async function syncHealthData(): Promise<void> {
  const granted = await getHealthPermissionGranted();
  if (!granted) return;

  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const snapshots: HealthSnapshot[] = [];

  if (Platform.OS === 'ios') {
    const [t, y] = await Promise.all([
      fetchHealthKitSnapshot(today),
      fetchHealthKitSnapshot(yesterday),
    ]);
    if (Object.keys(t).length > 1) snapshots.push(t as HealthSnapshot);
    if (Object.keys(y).length > 1) snapshots.push(y as HealthSnapshot);
  } else if (Platform.OS === 'android') {
    const [t, y] = await Promise.all([
      fetchHealthConnectSnapshot(today),
      fetchHealthConnectSnapshot(yesterday),
    ]);
    if (Object.keys(t).length > 1) snapshots.push(t as HealthSnapshot);
    if (Object.keys(y).length > 1) snapshots.push(y as HealthSnapshot);
  }

  if (snapshots.length === 0) return;

  try {
    await apiFetch('/health-data/sync', {
      method: 'POST',
      body:   JSON.stringify({ snapshots }),
    });
  } catch {
    // Silent — sync failure should never surface as an error to the user
  }
}

/**
 * Register an AppState listener that syncs health data when the app
 * returns to the foreground.  Returns an unsubscribe function.
 */
export function registerForegroundSync(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void syncHealthData();
    }
  });
  return () => sub.remove();
}
