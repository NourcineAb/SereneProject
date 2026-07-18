import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider } from '../lib/i18n';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { AuthProvider } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme-provider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initAds } from '../lib/ads';
import { colors } from '../theme/serene';

function ThemedApp() {
  const { theme, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="change-password" options={{ presentation: 'card' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="breathing" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pmr" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="weekly-report" options={{ presentation: 'card' }} />
        <Stack.Screen name="monthly-report" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card' }} />
        <Stack.Screen name="notifications-prefs" options={{ presentation: 'card' }} />
        <Stack.Screen name="language" options={{ presentation: 'card' }} />
        <Stack.Screen name="community" options={{ presentation: 'card' }} />
        <Stack.Screen name="badges" options={{ presentation: 'card' }} />
        <Stack.Screen name="challenges" options={{ presentation: 'card' }} />
        <Stack.Screen name="calendar" options={{ presentation: 'card' }} />
        <Stack.Screen name="correlation" options={{ presentation: 'card' }} />
        <Stack.Screen name="journal" options={{ presentation: 'card' }} />
        <Stack.Screen name="ambient" options={{ presentation: 'card' }} />
        <Stack.Screen name="exercises" options={{ presentation: 'card' }} />
        <Stack.Screen name="meditation" options={{ presentation: 'card' }} />
        <Stack.Screen name="grounding" options={{ presentation: 'card' }} />
        <Stack.Screen name="reframing" options={{ presentation: 'card' }} />
        <Stack.Screen name="help" options={{ presentation: 'card' }} />
        <Stack.Screen name="legal" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Quicksand_600SemiBold: require('../assets/fonts/Quicksand_600SemiBold.ttf'),
    Quicksand_700Bold: require('../assets/fonts/Quicksand_700Bold.ttf'),
    PlusJakartaSans_400Regular: require('../assets/fonts/PlusJakartaSans_400Regular.ttf'),
    PlusJakartaSans_600SemiBold: require('../assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
    Ionicons: require('../assets/fonts/Ionicons.ttf'),
  });

  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = loaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (ready) void initAds();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = Linking.parse(url);
      if (parsed.path) router.navigate(parsed.path as any);
    });
    return () => sub.remove();
  }, [ready]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <I18nProvider>
              <ThemedApp />
            </I18nProvider>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
