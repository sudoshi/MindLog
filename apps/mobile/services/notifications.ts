// =============================================================================
// MindLog Mobile — Push notification service
// Handles: permission request, Expo push token registration, local notification
// scheduling for daily check-in reminders, and incoming notification routing.
// =============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from './auth';

// ---------------------------------------------------------------------------
// Notification handler — behaviour while app is foregrounded
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

// ---------------------------------------------------------------------------
// Permission + token
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
  // Simulators don't support push tokens — return null silently
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MindLog',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2a9d8f',
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Check-in Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: '#2a9d8f',
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenData.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save push token to backend
// ---------------------------------------------------------------------------

export async function savePushTokenToServer(token: string): Promise<void> {
  try {
    await apiFetch('/notifications/prefs', {
      method: 'PUT',
      body: JSON.stringify({ push_token: token }),
    });
  } catch {
    // Non-critical — will retry on next app launch
  }
}

// ---------------------------------------------------------------------------
// Register + save (call once after successful login)
// ---------------------------------------------------------------------------

export async function setupPushNotifications(): Promise<void> {
  const token = await registerForPushNotifications();
  if (token) {
    await savePushTokenToServer(token);
  }
}

// ---------------------------------------------------------------------------
// Local notifications — daily check-in reminder
// ---------------------------------------------------------------------------

const CHECKIN_REMINDER_ID = 'daily_checkin_reminder';

export async function scheduleDailyCheckinReminder(
  hour: number,
  minute: number,
): Promise<void> {
  // Cancel existing reminder before rescheduling
  await cancelDailyCheckinReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: CHECKIN_REMINDER_ID,
    content: {
      title: 'Daily Check-in',
      body: "How are you feeling today? Tap to complete your check-in.",
      data: { screen: '/(tabs)' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelDailyCheckinReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(CHECKIN_REMINDER_ID);
}

export async function getScheduledCheckinTime(): Promise<{
  hour: number;
  minute: number;
} | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminder = scheduled.find((n) => n.identifier === CHECKIN_REMINDER_ID);
  if (!reminder) return null;

  const trigger = reminder.trigger as { hour?: number; minute?: number } | null;
  if (trigger?.hour !== undefined && trigger?.minute !== undefined) {
    return { hour: trigger.hour, minute: trigger.minute };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notification tap handler — deep-link into the app
// ---------------------------------------------------------------------------

export function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;

  const screen = data?.['screen'] as string | undefined;
  if (screen) {
    // Use setTimeout to ensure navigation is ready
    setTimeout(() => {
      router.push(screen as Parameters<typeof router.push>[0]);
    }, 100);
  }
}

// ---------------------------------------------------------------------------
// Notification content helpers
// ---------------------------------------------------------------------------

export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
