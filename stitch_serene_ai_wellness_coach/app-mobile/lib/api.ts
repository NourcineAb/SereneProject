/** Thin typed client for the Serene FastAPI backend. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const TOKEN_KEY = 'serene.token';

let cachedToken: string | null = null;

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

/** Abort a request after this many ms so the UI never hangs on a dead network. */
const REQUEST_TIMEOUT_MS = 12000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await loadToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Network timeout — could not reach ${BASE}`);
    }
    throw new Error(`Network error — could not reach ${BASE}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────
export type Token = { access_token: string; token_type: string };
export type User = { id: number; email: string; name: string; is_premium: boolean };
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
  role: 'user' | 'assistant';
  content: string;
  technique: string | null;
  created_at: string;
};

// ── Endpoints ──────────────────────────────────────────────────────────────
export const api = {
  register: (email: string, password: string, name: string) =>
    request<Token>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request<Token>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<User>('/auth/me'),
  chat: (message: string, session_id?: number) =>
    request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }),
  logMood: (score: number, label: string, note?: string) =>
    request('/mood', { method: 'POST', body: JSON.stringify({ score, label, note }) }),
  progress: () => request<Progress>('/progress'),
  setPremium: (is_premium: boolean) =>
    request<User>('/billing/premium', { method: 'POST', body: JSON.stringify({ is_premium }) }),
  registerPush: (expo_push_token: string) =>
    request<void>('/push/register', { method: 'POST', body: JSON.stringify({ expo_push_token }) }),
  listSessions: () =>
    request<Session[]>('/chat/sessions'),
  sessionMessages: (id: number) =>
    request<Message[]>(`/chat/sessions/${id}/messages`),
};
