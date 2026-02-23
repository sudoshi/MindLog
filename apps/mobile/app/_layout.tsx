// =============================================================================
// MindLog Mobile — Root layout
// Bootstraps: auth state, WatermelonDB, push notifications, biometric lock.
// =============================================================================

import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import 'react-native-reanimated';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import { database } from '../db/index';
import { getAccessToken, getStoredUser, getIntakeComplete } from '../services/auth';
import { backgroundSync } from '../db/sync';
import {
  setupPushNotifications,
  handleNotificationResponse,
  clearBadge,
} from '../services/notifications';

SplashScreen.preventAutoHideAsync();

// How long (ms) the app can be in the background before requiring re-auth
const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Parse a mindlog://invite?token=xxx deep link and return the token
function extractInviteToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'invite') {
      return parsed.searchParams.get('token');
    }
  } catch {
    // URL() constructor may not handle custom schemes on all RN versions
    const match = url.match(/mindlog:\/\/invite\?.*token=([^&]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [intakeComplete, setIntakeComplete] = useState(true); // assume complete until loaded

  // Load custom fonts — Fraunces (serif display) + Figtree (sans-serif body).
  // Splash screen stays visible until both fonts and auth bootstrap are done.
  const [fontsLoaded, fontError] = useFonts({
    'Fraunces': Fraunces_400Regular,
    'Fraunces_Italic': Fraunces_400Regular_Italic,
    'Figtree': Figtree_400Regular,
    'Figtree_Medium': Figtree_500Medium,
    'Figtree_SemiBold': Figtree_600SemiBold,
    'Figtree_Bold': Figtree_700Bold,
  });

  // Track when app went to background so we can apply the lock timeout
  const backgroundedAt = useRef<number | null>(null);
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);
  const notificationReceivedListener = useRef<Notifications.EventSubscription | null>(null);

  // --------------------------------------------------------------------------
  // Biometric lock — called when app returns from background
  // --------------------------------------------------------------------------
  const challengeBiometric = useCallback(async () => {
    const biometricEnabled = await (async () => {
      try {
        const SecureStore = await import('expo-secure-store');
        const val = await SecureStore.getItemAsync('ml_biometric_enabled');
        return val === 'true';
      } catch {
        return false;
      }
    })();
    if (!biometricEnabled) return;

    const supported = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!supported || !enrolled) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock MindLog',
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
    });

    if (!result.success) {
      // Auth failed or cancelled — sign out for safety
      const { clearSession } = await import('../services/auth');
      await clearSession();
      router.replace('/onboarding');
    }
  }, []);

  // --------------------------------------------------------------------------
  // App state change handler
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
        await clearBadge();
      } else if (nextState === 'active') {
        // Clear badge on foreground
        await clearBadge();

        // Trigger biometric lock if timeout exceeded
        if (
          isAuthenticated &&
          backgroundedAt.current !== null &&
          Date.now() - backgroundedAt.current > BIOMETRIC_TIMEOUT_MS
        ) {
          backgroundedAt.current = null;
          await challengeBiometric();
        } else {
          backgroundedAt.current = null;
        }

        // Background sync on foreground
        if (isAuthenticated) {
          backgroundSync();
        }
      }
    };

    const subscription = AppState.addEventListener('change', (state) => {
      void handleAppStateChange(state);
    });
    return () => subscription.remove();
  }, [isAuthenticated, challengeBiometric]);

  // --------------------------------------------------------------------------
  // Push notification listeners
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Handle taps on notifications (foreground and background)
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
      });

    // Handle incoming notifications while app is foregrounded (optional UI)
    notificationReceivedListener.current =
      Notifications.addNotificationReceivedListener((_notification) => {
        // Could show an in-app banner here in a future phase
      });

    return () => {
      notificationResponseListener.current?.remove();
      notificationReceivedListener.current?.remove();
    };
  }, []);

  // --------------------------------------------------------------------------
  // Deep link handler — mindlog://invite?token=xxx
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleUrl = (url: string) => {
      const token = extractInviteToken(url);
      if (token) {
        router.replace(`/onboarding?token=${encodeURIComponent(token)}`);
      }
    };

    // Cold-start deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    }).catch(() => undefined);

    // Warm-start deep link
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // --------------------------------------------------------------------------
  // Bootstrap: auth check → push setup → sync
  // --------------------------------------------------------------------------
  useEffect(() => {
    const bootstrap = async () => {
      const [token, user, intakeDone] = await Promise.all([
        getAccessToken(),
        getStoredUser(),
        getIntakeComplete(),
      ]);

      if (token && user) {
        // Authenticated — set up notifications and sync
        setIsAuthenticated(true);
        setIntakeComplete(intakeDone);
        void setupPushNotifications();
        backgroundSync();
      }

      // Mark auth bootstrap done — splash hide is handled once fonts are also ready
      setReady(true);
    };

    void bootstrap();
  }, []);

  // --------------------------------------------------------------------------
  // Hide splash once BOTH auth bootstrap AND fonts are ready.
  // fontError is treated as "done" so a font load failure never blocks the app.
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (ready && (fontsLoaded || fontError)) {
      void SplashScreen.hideAsync();
    }
  }, [ready, fontsLoaded, fontError]);

  // --------------------------------------------------------------------------
  // Navigate to the correct initial screen once the Stack is mounted
  // (router.replace must not be called before ready=true or the Stack
  //  navigator will not yet be mounted and the call is silently dropped)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace('/onboarding');
    } else if (!intakeComplete) {
      // New patient: haven't completed the consent + intake wizard yet
      router.replace('/onboarding-consent');
    }
  }, [ready, isAuthenticated, intakeComplete]);

  if (!ready || (!fontsLoaded && !fontError)) return null;

  return (
    <DatabaseProvider database={database}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="mfa" options={{ headerShown: false }} />
        <Stack.Screen name="checkin" options={{ headerShown: false }} />
        <Stack.Screen name="medications" options={{ headerShown: false }} />
        <Stack.Screen name="journal/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/biometric" options={{ headerShown: false }} />
        <Stack.Screen name="settings/consent" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-consent" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-intake" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </DatabaseProvider>
  );
}
