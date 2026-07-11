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
    const uc = myChallenges.find((c) => c.challenge_id === challengeId && !c.completed);
    if (!uc) return false;
    return uc.completed;
  } catch {
    return false;
  }
}
