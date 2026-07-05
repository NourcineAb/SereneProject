import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { colors } from '../theme/serene';
import { ONBOARDING_DONE_KEY } from './onboarding';

export default function Index() {
  const { user, loading } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY)
      .then((v) => setOnboardingDone(v === '1'))
      .catch(() => setOnboardingDone(false))
      .finally(() => setOnboardingChecked(true));
  }, []);

  if (loading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (user) return <Redirect href="/(tabs)" />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!onboardingDone) return <Redirect href={'/onboarding' as any} />;
  return <Redirect href="/login" />;
}
