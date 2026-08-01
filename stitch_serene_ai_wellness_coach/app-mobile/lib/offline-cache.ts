import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'serene.cache.';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

async function storeCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL_MS): Promise<void> {
  const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
  await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
}

async function readCache<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
  if (!raw) return null;
  try {
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > entry.ttl) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return entry.data;
  } catch {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return null;
  }
}

let netInfoAvailable: boolean | null = null;

async function loadNetInfo(): Promise<boolean> {
  if (netInfoAvailable !== null) return netInfoAvailable;
  try {
    const mod = require('@react-native-community/netinfo');
    netInfoAvailable = true;
    const state = await mod.default.fetch();
    return state.isConnected ?? true;
  } catch {
    netInfoAvailable = false;
    return true;
  }
}

export async function isOnline(): Promise<boolean> {
  return loadNetInfo();
}

export async function cacheMoodLogs(logs: any[]): Promise<void> {
  await storeCache('mood_logs', logs);
}

export async function getCachedMoodLogs(): Promise<any[] | null> {
  return readCache<any[]>('mood_logs');
}

export async function cacheSessions(sessions: any[]): Promise<void> {
  await storeCache('sessions', sessions);
}

export async function getCachedSessions(): Promise<any[] | null> {
  return readCache<any[]>('sessions');
}

export async function cacheProgress(progress: any): Promise<void> {
  await storeCache('progress', progress);
}

export async function getCachedProgress(): Promise<any | null> {
  return readCache<any>('progress');
}

export async function cacheJournalEntries(entries: any[], date: string): Promise<void> {
  await storeCache(`journal_${date}`, entries);
}

export async function getCachedJournalEntries(date: string): Promise<any[] | null> {
  return readCache<any[]>(`journal_${date}`);
}

export async function withOfflineFallback<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  storeFn: (data: T) => Promise<void>,
): Promise<T> {
  const online = await isOnline();
  if (online) {
    try {
      const data = await fetchFn();
      await storeFn(data);
      return data;
    } catch {
      const cached = await readCache<T>(cacheKey);
      if (cached !== null) return cached;
      throw new Error('Network error and no cached data available');
    }
  }

  const cached = await readCache<T>(cacheKey);
  if (cached !== null) return cached;
  throw new Error('No internet connection and no cached data available');
}
