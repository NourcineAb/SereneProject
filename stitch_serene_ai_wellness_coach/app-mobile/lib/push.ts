/**
 * Expo push notifications helpers.
 * - registerForPushNotificationsAsync: requests permission and returns the
 *   Expo push token (null on simulators, web, or if permission denied).
 * - syncPushToken: gets the token and POSTs it to POST /push/register.
 *   Fire-and-forget — never throws / never blocks the caller.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Language } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS === 'web') {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

export async function syncPushToken(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    await api.registerPush(token);
  } catch {
    // Never surface push errors to the UI
  }
}

const DAILY_MESSAGES: Record<Language, string[]> = {
  fr: [
    'Un moment de calme vous attend. 🌿',
    'Votre session du jour est prête. Respirons ensemble.',
    'Un instant pour vous. Votre Serene du jour.',
    'Prenez soin de vous — 5 minutes suffisent.',
  ],
  en: [
    'A moment of calm awaits you. 🌿',
    'Your session for today is ready. Let\'s breathe together.',
    'A moment for you. Your daily Serene.',
    'Take care of yourself — 5 minutes is enough.',
  ],
  ar: [
    'لحظة من الهدوء تنتظرك. 🌿',
    'جلستك اليوم جاهزة. دعنا نتنفس معاً.',
    'لحظة لك. جلسة Serene اليومية.',
    'اعتني بنفسك — 5 دقائق كافية.',
  ],
};

/**
 * Schedules (or replaces) a daily local check-in notification at the given hour.
 * Safe to call multiple times — cancels the previous serene.daily trigger first.
 * No-op on web. Never throws.
 */
export async function scheduleLocalDailyReminder(hour: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = scheduled.find((n) => n.identifier === 'serene.daily');
    if (existing) await Notifications.cancelScheduledNotificationAsync('serene.daily');

    const storedLang = await AsyncStorage.getItem('serene.setting.language');
    const lang: Language = storedLang === 'en' || storedLang === 'ar' ? storedLang : 'fr';
    const messages = DAILY_MESSAGES[lang] ?? DAILY_MESSAGES.fr;
    const body = messages[Math.floor(Math.random() * messages.length)];

    await Notifications.scheduleNotificationAsync({
      identifier: 'serene.daily',
      content: {
        title: 'Serene',
        body,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
  } catch {
    // Non-fatal
  }
}
