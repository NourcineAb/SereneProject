import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ChallengeData, UserChallengeData } from './api';

export type { ChallengeData, UserChallengeData };

const COMMUNITY_KEY = 'serene.community.challenges';

async function cacheChallenges(challenges: ChallengeData[]): Promise<void> {
  try {
    await AsyncStorage.setItem(COMMUNITY_KEY, JSON.stringify(challenges));
  } catch {
    /* ignore */
  }
}

async function getCachedChallenges(): Promise<ChallengeData[]> {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getChallenges(): Promise<ChallengeData[]> {
  try {
    const data = await api.communityChallenges();
    await cacheChallenges(data);
    return data;
  } catch {
    return getCachedChallenges();
  }
}

export async function joinChallenge(challengeId: number): Promise<UserChallengeData> {
  return api.communityJoinChallenge(challengeId);
}

export async function getMyChallenges(): Promise<UserChallengeData[]> {
  try {
    return await api.communityMyChallenges();
  } catch {
    return [];
  }
}

export async function updateChallengeProgress(challengeId: number): Promise<UserChallengeData> {
  return api.communityChallengeProgress(challengeId);
}

export async function checkChallengeCompletion(challengeId: number): Promise<boolean> {
  try {
    const myChallenges = await getMyChallenges();
    const uc = myChallenges.find((c) => c.challenge_id === challengeId);
    if (!uc) return false;
    return uc.completed;
  } catch {
    return false;
  }
}

export type CommunityStats = {
  active_users: number;
  total_sessions: number;
  calm_hours: number;
};

const STATS_KEY = 'serene.community.stats';

export async function getCommunityStats(): Promise<CommunityStats | null> {
  try {
    const data = await api.communityStats();
    try {
      await AsyncStorage.setItem(STATS_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    return data;
  } catch {
    try {
      const raw = await AsyncStorage.getItem(STATS_KEY);
      return raw ? (JSON.parse(raw) as CommunityStats) : null;
    } catch {
      return null;
    }
  }
}
