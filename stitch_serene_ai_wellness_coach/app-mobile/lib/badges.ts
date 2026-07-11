import AsyncStorage from '@react-native-async-storage/async-storage';

const BADGES_KEY = 'serene.badges';
const ACTIVITY_KEY = 'serene.activity.';

export type BadgeId =
  | 'premier_pas'
  | 'habitude'
  | 'mentaliste'
  | 'flamme'
  | 'infatigable'
  | 'explorateur'
  | 'journaliste'
  | 'matinal'
  | 'nocturne'
  | 'centenaire';

export type BadgeDefinition = {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt?: string;
};

export type BadgeState = Record<BadgeId, { earned: boolean; earnedAt?: string }>;

const BADGE_DEFS: Omit<BadgeDefinition, 'earned' | 'earnedAt'>[] = [
  { id: 'premier_pas', name: 'Premier pas', description: 'Complétez votre première session', icon: 'footsteps-outline' },
  { id: 'habitude', name: 'Habitué', description: 'Complétez 7 sessions', icon: 'repeat-outline' },
  { id: 'mentaliste', name: 'Mentaliste', description: 'Complétez 30 sessions', icon: 'brain-outline' },
  { id: 'flamme', name: 'Flamme', description: 'Série de 7 jours', icon: 'flame-outline' },
  { id: 'infatigable', name: 'Infatigable', description: 'Série de 30 jours', icon: 'rocket-outline' },
  { id: 'explorateur', name: 'Explorateur', description: 'Essayez les 5 techniques', icon: 'compass-outline' },
  { id: 'journaliste', name: 'Journaliste', description: '10 entrées de journal', icon: 'book-outline' },
  { id: 'matinal', name: 'Matinal', description: 'Humeur avant 9h, 5 fois', icon: 'sunrise-outline' },
  { id: 'nocturne', name: 'Nocturne', description: 'Session après 22h', icon: 'moon-outline' },
  { id: 'centenaire', name: 'Centenaire', description: 'Série de 100 jours', icon: 'trophy-outline' },
];

async function getState(): Promise<BadgeState> {
  try {
    const raw = await AsyncStorage.getItem(BADGES_KEY);
    return raw ? JSON.parse(raw) : ({} as BadgeState);
  } catch {
    return {} as BadgeState;
  }
}

async function saveState(state: BadgeState): Promise<void> {
  await AsyncStorage.setItem(BADGES_KEY, JSON.stringify(state));
}

async function getSessionsCount(): Promise<number> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const sessionKeys = allKeys.filter((k) => k.startsWith('serene.session.'));
    return sessionKeys.length;
  } catch {
    return 0;
  }
}

async function getActivityDays(): Promise<string[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const activityKeys = allKeys.filter((k) => k.startsWith(ACTIVITY_KEY));
    return activityKeys.map((k) => k.replace(ACTIVITY_KEY, ''));
  } catch {
    return [];
  }
}

async function getJournalCount(): Promise<number> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const journalKeys = allKeys.filter((k) => k.startsWith('serene.journal.'));
    return journalKeys.length;
  } catch {
    return 0;
  }
}

async function getStreak(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem('serene.streak');
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function getTechniquesUsed(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem('serene.techniques_used');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

async function getMorningMoodCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem('serene.morning_mood_count');
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function getNightSessionsCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem('serene.night_sessions_count');
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function checkBadges(): Promise<BadgeId[]> {
  const state = await getState();
  const newlyEarned: BadgeId[] = [];

  const sessionsCount = await getSessionsCount();
  const streak = await getStreak();
  const techniquesUsed = await getTechniquesUsed();
  const journalCount = await getJournalCount();
  const morningMoodCount = await getMorningMoodCount();
  const nightSessionsCount = await getNightSessionsCount();

  const conditions: Record<BadgeId, boolean> = {
    premier_pas: sessionsCount >= 1,
    habitude: sessionsCount >= 7,
    mentaliste: sessionsCount >= 30,
    flamme: streak >= 7,
    infatigable: streak >= 30,
    explorateur: techniquesUsed.size >= 5,
    journaliste: journalCount >= 10,
    matinal: morningMoodCount >= 5,
    nocturne: nightSessionsCount >= 1,
    centenaire: streak >= 100,
  };

  for (const [id, met] of Object.entries(conditions) as [BadgeId, boolean][]) {
    if (met && !state[id]?.earned) {
      newlyEarned.push(id);
    }
  }

  if (newlyEarned.length > 0) {
    for (const id of newlyEarned) {
      state[id] = { earned: true, earnedAt: new Date().toISOString() };
    }
    await saveState(state);
  }

  return newlyEarned;
}

export async function getEarnedBadges(): Promise<BadgeState> {
  const state = await getState();
  const earned: BadgeState = {} as BadgeState;
  for (const [id, val] of Object.entries(state)) {
    if (val.earned) earned[id as BadgeId] = val;
  }
  return earned;
}

export async function getAllBadges(): Promise<BadgeDefinition[]> {
  const state = await getState();
  return BADGE_DEFS.map((def) => ({
    ...def,
    earned: state[def.id]?.earned ?? false,
    earnedAt: state[def.id]?.earnedAt,
  }));
}

export async function earnBadge(badgeId: BadgeId): Promise<void> {
  const state = await getState();
  state[badgeId] = { earned: true, earnedAt: new Date().toISOString() };
  await saveState(state);
}

export async function markDayActivity(types: string[]): Promise<void> {
  const today = new Date();
  const key = `${ACTIVITY_KEY}${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const merged = [...new Set([...existing, ...types])];
    await AsyncStorage.setItem(key, JSON.stringify(merged));
  } catch {
    await AsyncStorage.setItem(key, JSON.stringify(types));
  }
}

export async function incrementMorningMood(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('serene.morning_mood_count');
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    await AsyncStorage.setItem('serene.morning_mood_count', String(count + 1));
  } catch {
    await AsyncStorage.setItem('serene.morning_mood_count', '1');
  }
}

export async function incrementNightSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('serene.night_sessions_count');
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    await AsyncStorage.setItem('serene.night_sessions_count', String(count + 1));
  } catch {
    await AsyncStorage.setItem('serene.night_sessions_count', '1');
  }
}

export async function addTechniqueUsed(technique: string): Promise<void> {
  try {
    const current = await getTechniquesUsed();
    current.add(technique);
    await AsyncStorage.setItem('serene.techniques_used', JSON.stringify([...current]));
  } catch {
    await AsyncStorage.setItem('serene.techniques_used', JSON.stringify([technique]));
  }
}
