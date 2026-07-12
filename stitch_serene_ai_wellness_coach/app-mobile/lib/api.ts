/** Thin typed client for the Serene FastAPI backend. */
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8081";
const TOKEN_KEY = "serene.token";
const REFRESH_KEY = "serene.refresh_token";

let cachedToken: string | null = null;
let cachedRefresh: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function setRefreshToken(token: string | null) {
  cachedRefresh = token;
  if (token) await AsyncStorage.setItem(REFRESH_KEY, token);
  else await AsyncStorage.removeItem(REFRESH_KEY);
}

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function loadRefreshToken(): Promise<string | null> {
  if (cachedRefresh) return cachedRefresh;
  cachedRefresh = await AsyncStorage.getItem(REFRESH_KEY);
  return cachedRefresh;
}

/** Abort a request after this many ms so the UI never hangs on a dead network. */
const REQUEST_TIMEOUT_MS = 12000;

async function doFetch(
  path: string,
  options: RequestInit,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Network timeout — could not reach ${BASE}`);
    }
    throw new Error(`Network error — could not reach ${BASE}`);
  }
}

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    await setToken(data.access_token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await loadToken();
  let res = await doFetch(path, options, token);

  // On 401, attempt a single refresh + retry (skip if this IS the refresh endpoint).
  if (
    res.status === 401 &&
    !path.includes("/auth/refresh") &&
    !path.includes("/auth/login")
  ) {
    if (!refreshPromise) refreshPromise = tryRefreshToken();
    const newToken = await refreshPromise;
    refreshPromise = null;
    if (newToken && newToken !== token) {
      res = await doFetch(path, options, newToken);
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────
export type Token = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
};
export type User = {
  id: number;
  email: string;
  name: string;
  is_premium: boolean;
};
export type ChatResponse = {
  session_id: number;
  reply: string;
  technique: string | null;
  paywall: boolean;
  sessions_used: number;
  sessions_limit: number;
};
export type Progress = {
  streak_days: number;
  sessions_this_week: number;
  sessions_limit: number;
  avg_mood: number;
  mood_trend: number[];
  anxiety_change_pct: number;
  is_premium: boolean;
};
export type Session = {
  id: number;
  title: string;
  created_at: string;
};
export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  technique: string | null;
  created_at: string;
};

export type JournalEntry = {
  id: number;
  mood_score: number;
  content: string;
  technique: string | null;
  created_at: string;
};

export type WeeklySummary = {
  total_entries: number;
  average_mood: number;
  most_used_technique: string | null;
  entries_by_day: Record<string, number>;
};

export type ExportData = {
  profile: Record<string, unknown>;
  sessions: Array<{
    id: number;
    title: string;
    created_at: string;
    messages: Array<Record<string, unknown>>;
  }>;
  mood_logs: Array<{
    id: number;
    score: number;
    label: string;
    note: string | null;
    created_at: string;
  }>;
};

export type ChallengeData = {
  id: number;
  title: string;
  description: string;
  duration_days: number;
  target_sessions: number;
  target_streak: number;
  created_at: string;
  participant_count: number;
};

export type UserChallengeData = {
  id: number;
  challenge_id: number;
  started_at: string;
  completed: boolean;
  completed_at: string | null;
  current_sessions: number;
  current_streak: number;
  challenge: ChallengeData | null;
};

export type WeeklyReport = {
  avg_mood: number;
  total_sessions: number;
  most_used_technique: string | null;
  streak_days: number;
  mood_distribution: {
    calme: number;
    joyeux: number;
    neutre: number;
    anxieux: number;
    fatigue: number;
  };
  sessions_per_day: number[];
  technique_usage: Record<string, number>;
  insights: {
    mood_trend: "improved" | "declined" | "stable";
    best_day: string;
    recommendation: string;
  };
};

// ── Endpoints ──────────────────────────────────────────────────────────────
export const api = {
  register: (email: string, password: string, name: string) =>
    request<Token>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  socialLogin: (provider: string, token: string, email: string, name: string) =>
    request<Token>("/auth/social-login", {
      method: "POST",
      body: JSON.stringify({ provider, token, email, name }),
    }),
  me: () => request<User>("/auth/me"),
  updateProfile: (name: string) =>
    request<User>("/auth/me", {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ message: string }>("/auth/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    }),
  chat: (message: string, session_id?: number) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id }),
    }),
  logMood: (score: number, label: string, note?: string) =>
    request("/mood", {
      method: "POST",
      body: JSON.stringify({ score, label, note }),
    }),
  progress: () => request<Progress>("/progress"),
  setPremium: (is_premium: boolean) =>
    request<User>("/billing/premium", {
      method: "POST",
      body: JSON.stringify({ is_premium }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  registerPush: (expo_push_token: string) =>
    request<void>("/push/register", {
      method: "POST",
      body: JSON.stringify({ expo_push_token }),
    }),
  listSessions: () => request<Session[]>("/chat/sessions"),
  sessionMessages: (id: number) =>
    request<Message[]>(`/chat/sessions/${id}/messages`),
  journalList: (date?: string) =>
    request<JournalEntry[]>(`/journal${date ? `?date=${date}` : ""}`),
  journalCreate: (mood_score: number, content: string, technique?: string) =>
    request<JournalEntry>("/journal", {
      method: "POST",
      body: JSON.stringify({ mood_score, content, technique }),
    }),
  journalUpdate: (id: number, mood_score: number, content: string, technique?: string) =>
    request<JournalEntry>(`/journal/${id}`, {
      method: "PUT",
      body: JSON.stringify({ mood_score, content, technique }),
    }),
  journalDelete: (id: number) =>
    request<void>(`/journal/${id}`, { method: "DELETE" }),
  journalWeeklySummary: () => request<WeeklySummary>("/journal/weekly-summary"),
  journalExport: () =>
    request<
      Array<{
        id: number;
        mood_score: number;
        content: string;
        technique: string | null;
        created_at: string;
      }>
    >("/journal/export"),
  exportData: () => request<ExportData>("/auth/me/export"),
  deleteAccount: () => request<void>("/auth/me", { method: "DELETE" }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>("/auth/password-reset/complete", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  weeklyReport: () => request<WeeklyReport>("/report/weekly"),
  monthlyReport: () =>
    request<{
      avg_mood: number;
      total_sessions: number;
      total_journal_entries: number;
      mood_distribution: Record<string, number>;
      sessions_per_week: number[];
      top_techniques: { name: string; count: number }[];
      streak_record: number;
      improvements: { mood_change_pct: number; sessions_change_pct: number };
      ai_summary: string;
    }>("/report/monthly"),
  communityChallenges: () => request<ChallengeData[]>("/community/challenges"),
  communityJoinChallenge: (id: number) =>
    request<UserChallengeData>(`/community/challenges/${id}/join`, {
      method: "POST",
    }),
  communityLeaveChallenge: (id: number) =>
    request<void>(`/community/challenges/${id}/leave`, {
      method: "POST",
    }),
  communityMyChallenges: () =>
    request<UserChallengeData[]>("/community/challenges/my"),
  communityChallengeProgress: (id: number) =>
    request<UserChallengeData>(`/community/challenges/${id}/progress`, {
      method: "POST",
    }),
  communityStats: () =>
    request<{
      active_users: number;
      total_sessions: number;
      calm_hours: number;
    }>("/community/stats"),
};
