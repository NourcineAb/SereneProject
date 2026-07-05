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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push tokens are not available on simulators or the web
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

/**
 * Schedules (or replaces) a daily local check-in notification at the given hour.
 * Safe to call multiple times — cancels the previous serene.daily trigger first.
 * No-op on web. Never throws.
 */
export async function scheduleLocalDailyReminder(hour: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Cancel any previously scheduled daily reminder before re-scheduling.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = scheduled.find((n) => n.identifier === 'serene.daily');
    if (existing) await Notifications.cancelScheduledNotificationAsync('serene.daily');

    const MESSAGES = [
      'Un moment de calme vous attend. 🌿',
      'Votre session du jour est prête. Respirons ensemble.',
      'Un instant pour vous. Votre Serene du jour.',
      'Prenez soin de vous — 5 minutes suffisent.',
    ];
    const body = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

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
