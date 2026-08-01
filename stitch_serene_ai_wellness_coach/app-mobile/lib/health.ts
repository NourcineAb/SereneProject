import AsyncStorage from '@react-native-async-storage/async-storage';

const HEALTH_ENABLED_KEY = 'serene.setting.health_integration';

let Health: any = null;
let isAvailable = false;

try {
  const mod = require('expo-health');
  Health = mod;
  isAvailable = true;
} catch {
  try {
    const mod = require('react-native-health');
    Health = mod;
    isAvailable = true;
  } catch {
    isAvailable = false;
  }
}

export function isHealthAvailable(): boolean {
  return isAvailable;
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!isAvailable) return false;
  try {
    const enabled = await AsyncStorage.getItem(HEALTH_ENABLED_KEY);
    if (enabled === 'false') return false;

    if (Health?.requestAuthorization) {
      const permissions = [
        { type: Health.Permissions?.Permissions?.WriteMoodCorrelation ?? 'MoodCorrelation', read: false, write: true },
        { type: Health.Permissions?.Permissions?.WriteWorkout ?? 'Workout', read: false, write: true },
        { type: Health.Permissions?.Permissions?.ReadStepCount ?? 'StepCount', read: true, write: false },
      ].filter((p) => p.type && p.type !== 'undefined');
      if (permissions.length > 0) {
        const granted = await Health.requestAuthorization(permissions);
        return granted;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function writeMoodToHealth(score: number, label: string): Promise<boolean> {
  if (!isAvailable) return false;
  try {
    const enabled = await AsyncStorage.getItem(HEALTH_ENABLED_KEY);
    if (enabled === 'false') return false;

    if (Health?.saveMoodSample) {
      await Health.saveMoodSample({
        mood: label,
        value: score,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
      return true;
    }

    if (Health?.saveCorrelation) {
      await Health.saveCorrelation({
        type: Health.Permissions?.Permissions?.WriteMoodCorrelation ?? 'MoodCorrelation',
        value: score,
        metadata: { label },
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function writeExerciseToHealth(type: string, durationMinutes: number): Promise<boolean> {
  if (!isAvailable) return false;
  try {
    const enabled = await AsyncStorage.getItem(HEALTH_ENABLED_KEY);
    if (enabled === 'false') return false;

    const start = new Date();
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    if (Health?.saveWorkout) {
      await Health.saveWorkout({
        activityType: type,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        duration: durationMinutes * 60,
      });
      return true;
    }

    if (Health?.saveCorrelation) {
      await Health.saveCorrelation({
        type: Health.Permissions?.Permissions?.WriteWorkout ?? 'Workout',
        value: durationMinutes * 60,
        metadata: { activityType: type },
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function readTodaySteps(): Promise<number | null> {
  if (!isAvailable) return null;
  try {
    const enabled = await AsyncStorage.getItem(HEALTH_ENABLED_KEY);
    if (enabled === 'false') return null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    if (Health?.getStepCount) {
      const steps = await Health.getStepCount({
        startDate: startOfDay.toISOString(),
        endDate: new Date().toISOString(),
      });
      return steps ?? null;
    }

    if (Health?.getSamples) {
      const samples = await Health.getSamples({
        type: Health.Permissions?.Permissions?.ReadStepCount ?? 'StepCount',
        startDate: startOfDay.toISOString(),
        endDate: new Date().toISOString(),
      });
      if (Array.isArray(samples) && samples.length > 0) {
        return samples.reduce((sum: number, s: any) => sum + (s.value ?? 0), 0);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function isHealthIntegrationEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(HEALTH_ENABLED_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

export async function setHealthIntegrationEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HEALTH_ENABLED_KEY, String(enabled));
}
