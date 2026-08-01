import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { type Language } from './i18n';

const LAST_ACTIVE_KEY = 'serene.last_active';
const NOTIFICATION_SCHEDULED_KEY = 'serene.reengagement.scheduled';

export async function getLastActiveDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export async function updateLastActiveDate(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export async function getDaysInactive(): Promise<number> {
  const lastActive = await getLastActiveDate();
  if (!lastActive) return 999;
  const last = new Date(lastActive);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function shouldShowReengagement(): Promise<boolean> {
  const days = await getDaysInactive();
  return days >= 3;
}

const INACTIVITY_MESSAGES: Record<Language, { short: string; medium: string; long: string }> = {
  fr: {
    short: 'On vous a manqué ! Une petite session de 2 min peut faire la différence.',
    medium: 'Ça fait une semaine. Votre bien-être vous attend, sans pression.',
    long: 'On est là quand vous êtes prêt. Même 1 minute compte.',
  },
  en: {
    short: 'We missed you! A quick 2-min session can make a difference.',
    medium: 'It\'s been a week. Your wellness is waiting, no pressure.',
    long: 'We\'re here when you\'re ready. Even 1 minute counts.',
  },
  ar: {
    short: 'اشتقنا إليك! جلسة سريعة من دقيقتين يمكن أن تحدث فرقاً.',
    medium: 'مر أسبوع. رعايتك تنتظرك، بلا ضغط.',
    long: 'نحن هنا عندما تكون مستعداً. حتى دقيقة واحدة مهمة.',
  },
};

const INACTIVITY_TITLES: Record<Language, string> = {
  fr: 'Serene vous pense',
  en: 'Serene is thinking of you',
  ar: 'Serene يفكر فيك',
};

export function getReengagementMessage(days: number): string {
  // Default to French; actual call site uses async getLocalizedReengagementMessage
  if (days >= 14) return INACTIVITY_MESSAGES.fr.long;
  if (days >= 7) return INACTIVITY_MESSAGES.fr.medium;
  return INACTIVITY_MESSAGES.fr.short;
}

async function getLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem('serene.setting.language');
    if (stored === 'en' || stored === 'ar') return stored;
  } catch { /* ignore */ }
  return 'fr';
}

export async function showReengagementNotification(): Promise<void> {
  try {
    const alreadyScheduled = await AsyncStorage.getItem(NOTIFICATION_SCHEDULED_KEY);
    if (alreadyScheduled) return;

    const days = await getDaysInactive();
    if (days < 3) return;

    const lang = await getLanguage();
    const messages = INACTIVITY_MESSAGES[lang] ?? INACTIVITY_MESSAGES.fr;
    const title = INACTIVITY_TITLES[lang] ?? INACTIVITY_TITLES.fr;

    let message: string;
    if (days >= 14) message = messages.long;
    else if (days >= 7) message = messages.medium;
    else message = messages.short;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        sound: true,
      },
      trigger: null,
    });

    await AsyncStorage.setItem(NOTIFICATION_SCHEDULED_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function trackMoodActivity(): Promise<void> {
  return updateLastActiveDate();
}

export function trackChatSession(): Promise<void> {
  return updateLastActiveDate();
}

export function trackExerciseCompletion(): Promise<void> {
  return updateLastActiveDate();
}
