// =============================================================================
// MindLog Mobile — Root layout
// Phase 2: bootstraps auth state from SecureStore, wraps app in
// WatermelonDB provider, kicks off background sync on mount.
// =============================================================================

import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { database } from '../db/index';
import { getAccessToken, getStoredUser } from '../services/auth';
import { backgroundSync } from '../db/sync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      const [token, user] = await Promise.all([getAccessToken(), getStoredUser()]);

      if (!token || !user) {
        // No session — send to onboarding
        router.replace('/onboarding');
      } else {
        // Valid session — kick off background sync
        backgroundSync();
      }

      setReady(true);
      void SplashScreen.hideAsync();
    };

    void bootstrap();
  }, []);

  if (!ready) return null;

  return (
    <DatabaseProvider database={database}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="mfa" options={{ headerShown: false }} />
        <Stack.Screen name="checkin" options={{ headerShown: false }} />
        <Stack.Screen name="journal/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/biometric" options={{ headerShown: false }} />
        <Stack.Screen name="settings/consent" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </DatabaseProvider>
  );
}
