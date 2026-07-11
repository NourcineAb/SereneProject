import AsyncStorage from '@react-native-async-storage/async-storage';

const WIDGET_KEY = 'serene.widget.data';

export type WidgetData = {
  streak: number;
  sessionsToday: number;
  moodScore: number | null;
  nextReminder: string;
  isPremium: boolean;
};

export async function getWidgetData(): Promise<WidgetData> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  return {
    streak: 0,
    sessionsToday: 0,
    moodScore: null,
    nextReminder: '09:00',
    isPremium: false,
  };
}

export async function updateWidgetData(patch: Partial<WidgetData>): Promise<void> {
  const current = await getWidgetData();
  const merged = { ...current, ...patch };
  await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(merged));
}

export async function refreshWidgetOnMoodLog(score: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await updateWidgetData({ moodScore: score });
  try {
    const logKey = `serene.widget.mood.${today}`;
    await AsyncStorage.setItem(logKey, String(score));
  } catch {
    /* ignore */
  }
}

export async function refreshWidgetOnSessionComplete(isPremium: boolean): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const countKey = `serene.widget.sessions_today.${today}`;
    const raw = await AsyncStorage.getItem(countKey);
    const count = raw ? parseInt(raw, 10) + 1 : 1;
    await AsyncStorage.setItem(countKey, String(count));
    await updateWidgetData({ sessionsToday: count, isPremium });
  } catch {
    await updateWidgetData({ sessionsToday: 1, isPremium });
  }
}

export async function refreshWidgetOnForeground(isPremium: boolean): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const today = new Date().toISOString().slice(0, 10);

    let sessionsToday = 0;
    for (const k of allKeys) {
      if (k === `serene.widget.sessions_today.${today}`) {
        const val = await AsyncStorage.getItem(k);
        sessionsToday = val ? parseInt(val, 10) || 0 : 0;
      }
    }

    let moodScore: number | null = null;
    const moodKey = `serene.widget.mood.${today}`;
    if (allKeys.includes(moodKey)) {
      const val = await AsyncStorage.getItem(moodKey);
      moodScore = val ? parseInt(val, 10) : null;
    }

    const streakRaw = await AsyncStorage.getItem('serene.streak');
    const streak = streakRaw ? parseInt(streakRaw, 10) || 0 : 0;

    const hour = new Date().getHours();
    let nextReminder = '09:00';
    if (hour < 9) nextReminder = '09:00';
    else if (hour < 13) nextReminder = '13:00';
    else if (hour < 18) nextReminder = '18:00';
    else nextReminder = '21:00';

    await AsyncStorage.setItem(
      WIDGET_KEY,
      JSON.stringify({ streak, sessionsToday, moodScore, nextReminder, isPremium }),
    );
  } catch {
    /* ignore */
  }
}
