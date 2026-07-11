import { Platform, Alert } from 'react-native';
import { api, setToken, setRefreshToken } from './api';

type SocialResult = {
  email: string;
  name: string;
  token: string;
} | null;

let AppleAuth: any = null;
let appleAuthLoaded = false;

async function loadAppleAuth() {
  if (appleAuthLoaded) return AppleAuth;
  appleAuthLoaded = true;
  try {
    AppleAuth = require('expo-apple-authentication');
  } catch {
    AppleAuth = null;
  }
  return AppleAuth;
}

let GoogleAuth: any = null;
let googleAuthLoaded = false;

async function loadGoogleAuth() {
  if (googleAuthLoaded) return GoogleAuth;
  googleAuthLoaded = true;
  try {
    GoogleAuth = require('expo-google-sign-in');
  } catch {
    GoogleAuth = null;
  }
  return GoogleAuth;
}

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const mod = await loadAppleAuth();
  if (!mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function isGoogleAvailable(): Promise<boolean> {
  const mod = await loadGoogleAuth();
  return mod !== null;
}

function showUnavailable(provider: string) {
  Alert.alert(
    'Connexion sociale indisponible',
    `La connexion avec ${provider} n'est pas disponible dans cet environnement.`,
    [{ text: 'OK' }],
  );
}

export async function signInWithApple(): Promise<SocialResult> {
  const mod = await loadAppleAuth();
  if (!mod) {
    showUnavailable('Apple');
    return null;
  }

  try {
    const available = await mod.isAvailableAsync();
    if (!available) {
      showUnavailable('Apple');
      return null;
    }

    const credential = await mod.signInAsync({
      requestedScopes: [mod.AppleAuthenticationScope.EMAIL, mod.AppleAuthenticationScope.FULL_NAME],
    });

    const email = credential.email ?? `${credential.user}@privaterelay.appleid.com`;
    const name = credential.fullName
      ? `${credential.fullName.givenName ?? ''} ${credential.fullName.familyName ?? ''}`.trim()
      : 'Utilisateur Apple';

    const response = await socialLogin('apple', credential.identityToken, email, name);
    return response;
  } catch (err: any) {
    if (err.code === 'ERR_REQUEST_CANCELED') return null;
    showUnavailable('Apple');
    return null;
  }
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const mod = await loadGoogleAuth();
  if (!mod) {
    showUnavailable('Google');
    return null;
  }

  try {
    await mod.initAsync({
      scopes: ['profile', 'email'],
    });

    const result = await mod.signInAsync();
    if (result.type !== 'success') return null;

    const { email, name } = result.user;
    const response = await socialLogin('google', result.authentication.idToken ?? result.authentication.accessToken, email, name);
    return response;
  } catch {
    showUnavailable('Google');
    return null;
  }
}

async function socialLogin(
  provider: string,
  token: string,
  email: string,
  name: string,
): Promise<SocialResult> {
  try {
    const data = await api.socialLogin(provider, token, email, name);
    await setToken(data.access_token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    return { email, name, token: data.access_token };
  } catch {
    Alert.alert(
      'Erreur de connexion',
      `Impossible de se connecter avec ${provider}. Veuillez réessayer.`,
      [{ text: 'OK' }],
    );
    return null;
  }
}
