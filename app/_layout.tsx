/**
 * Root Layout - ARI Application
 * 
 * ARCHITECTURAL OVERVIEW:
 * -----------------------
 * This is the root layout for the ARI application, containing:
 * 
 * 1. Control App (Master Node): The tab-based control interface
 * 2. Activation Screen (Companion Core): The voice activation interface
 * 
 * TRUST BOUNDARIES:
 * The ARIProvider manages state and enforces security policies.
 * All capability decisions are made through the context.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/lib/query-client';
import { ARIProvider } from '@/lib/ari-context';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(control)" options={{ headerShown: false }} />
      <Stack.Screen 
        name="activate" 
        options={{ 
          headerShown: false,
          presentation: 'fullScreenModal',
        }} 
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ARIProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </ARIProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
