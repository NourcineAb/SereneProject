import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Language } from './i18n';

let Sharing: any = null;
let isAvailable = false;

try {
  const mod = require('expo-sharing');
  Sharing = mod;
  isAvailable = true;
} catch {
  isAvailable = false;
}

export function isShareAvailable(): boolean {
  return isAvailable;
}

async function getLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem('serene.setting.language');
    if (stored === 'en' || stored === 'ar') return stored;
  } catch { /* ignore */ }
  return 'fr';
}

const SHARE_STRINGS: Record<Language, {
  unavailableTitle: string;
  unavailableMsg: string;
  progressMessage: string;
  progressTitle: string;
  badgeMessage: string;
  badgeTitle: string;
  reportMessage: string;
  reportTitle: string;
  noTechnique: string;
}> = {
  fr: {
    unavailableTitle: 'Partage non disponible',
    unavailableMsg: 'Le partage n\'est pas disponible sur cet appareil.',
    progressMessage: 'Je suis en série de {streak} jours sur Serene! {emoji}\n\n{sessions} sessions cette semaine · Humeur: {mood}/10',
    progressTitle: 'Partager votre progression',
    badgeMessage: 'J\'ai obtenu le badge "{name}" sur Serene! {description} 🏆',
    badgeTitle: 'Partager votre récompense',
    reportMessage: 'Mon rapport hebdomadaire Serene:\n\n{count} sessions · Humeur moy: {mood}/10 {emoji}\nTechnique la plus utilisée: {technique}',
    reportTitle: 'Partager le rapport',
    noTechnique: 'Aucune technique spécifique',
  },
  en: {
    unavailableTitle: 'Sharing unavailable',
    unavailableMsg: 'Sharing is not available on this device.',
    progressMessage: 'I\'m on a {streak}-day streak on Serene! {emoji}\n\n{sessions} sessions this week · Mood: {mood}/10',
    progressTitle: 'Share your progress',
    badgeMessage: 'I earned the "{name}" badge on Serene! {description} 🏆',
    badgeTitle: 'Share your achievement',
    reportMessage: 'My weekly Serene report:\n\n{count} sessions · Avg mood: {mood}/10 {emoji}\nMost used technique: {technique}',
    reportTitle: 'Share report',
    noTechnique: 'No specific technique',
  },
  ar: {
    unavailableTitle: 'المشاركة غير متاحة',
    unavailableMsg: 'المشاركة غير متاحة على هذا الجهاز.',
    progressMessage: 'أنا في سلسلة من {streak} أيام على Serene! {emoji}\n\n{sessions} جلسات هذا الأسبوع · المزاج: {mood}/10',
    progressTitle: 'شارك تقدمك',
    badgeMessage: 'حصلت على شارة "{name}" على Serene! {description} 🏆',
    badgeTitle: 'شارك إنجازك',
    reportMessage: 'تقريري الأسبوعي Serene:\n\n{count} جلسات · متوسط المزاج: {mood}/10 {emoji}\nالتقنية الأكثر استخداماً: {technique}',
    reportTitle: 'مشاركة التقرير',
    noTechnique: 'لا توجد تقنية محددة',
  },
};

function showUnavailable(strings: { unavailableTitle: string; unavailableMsg: string }) {
  Alert.alert(strings.unavailableTitle, strings.unavailableMsg);
}

export async function shareProgress(stats: {
  streak: number;
  sessionsThisWeek: number;
  moodScore: number;
}): Promise<void> {
  if (!isAvailable || !Sharing?.shareAsync) {
    const lang = await getLanguage();
    showUnavailable(SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr);
    return;
  }

  const lang = await getLanguage();
  const strings = SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr;
  const moodEmoji =
    stats.moodScore >= 8 ? '😊' : stats.moodScore >= 6 ? '🙂' : stats.moodScore >= 4 ? '😐' : '😔';
  const message = strings.progressMessage
    .replace('{streak}', String(stats.streak))
    .replace('{emoji}', moodEmoji)
    .replace('{sessions}', String(stats.sessionsThisWeek))
    .replace('{mood}', String(stats.moodScore));

  try {
    await Sharing.shareAsync('https://serene.app', {
      message,
      dialogTitle: strings.progressTitle,
    });
  } catch {
    showUnavailable(strings);
  }
}

export async function shareBadge(badge: { name: string; description: string }): Promise<void> {
  if (!isAvailable || !Sharing?.shareAsync) {
    const lang = await getLanguage();
    showUnavailable(SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr);
    return;
  }

  const lang = await getLanguage();
  const strings = SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr;
  const message = strings.badgeMessage
    .replace('{name}', badge.name)
    .replace('{description}', badge.description);

  try {
    await Sharing.shareAsync('https://serene.app', {
      message,
      dialogTitle: strings.badgeTitle,
    });
  } catch {
    showUnavailable(strings);
  }
}

export async function shareWeeklyReport(report: {
  totalSessions: number;
  averageMood: number;
  mostUsedTechnique: string | null;
}): Promise<void> {
  if (!isAvailable || !Sharing?.shareAsync) {
    const lang = await getLanguage();
    showUnavailable(SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr);
    return;
  }

  const lang = await getLanguage();
  const strings = SHARE_STRINGS[lang] ?? SHARE_STRINGS.fr;
  const moodEmoji =
    report.averageMood >= 8 ? '😊' : report.averageMood >= 6 ? '🙂' : report.averageMood >= 4 ? '😐' : '😔';
  const technique = report.mostUsedTechnique ?? strings.noTechnique;
  const message = strings.reportMessage
    .replace('{count}', String(report.totalSessions))
    .replace('{mood}', report.averageMood.toFixed(1))
    .replace('{emoji}', moodEmoji)
    .replace('{technique}', technique);

  try {
    await Sharing.shareAsync('https://serene.app', {
      message,
      dialogTitle: strings.reportTitle,
    });
  } catch {
    showUnavailable(strings);
  }
}
