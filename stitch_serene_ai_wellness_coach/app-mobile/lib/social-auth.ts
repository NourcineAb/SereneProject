import { Platform, Alert } from 'react-native';
import { useEffect, useRef, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import type { AuthSessionResult } from 'expo-auth-session';
import { api, setToken, setRefreshToken } from './api';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '138307752321-nqsfcrj9b03050ri77chij99gn2omnir.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '138307752321-2950shqa1moav11q3usskosj325psgkf';
const GOOGLE_ANDROID_CLIENT_ID = '138307752321-gp32eksta19nkemf7ld7r9mivpfu74pa.apps.googleusercontent.com';

type SocialResult = {
  email: string;
  name: string;
  token: string;
} | null;

type GoogleAuthResult = {
  requestReady: boolean;
  promptAsync: () => Promise<SocialResult>;
};

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

function showUnavailable(provider: string) {
  Alert.alert(
    'Connexion sociale indisponible',
    `La connexion avec ${provider} n'est pas disponible dans cet environnement.`,
    [{ text: 'OK' }],
  );
}

async function handleGoogleResult(response: AuthSessionResult): Promise<SocialResult> {
  if (response.type !== 'success') return null;

  try {
    const authentication = (response as any).authentication;
    const accessToken = authentication?.accessToken ?? response.params?.access_token;
    const idToken = authentication?.idToken ?? response.params?.id_token;
    const token = idToken ?? accessToken;

    if (!token) return null;

    const userInfoResponse = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = await userInfoResponse.json();

    const email = userInfo.email ?? '';
    const name = userInfo.name ?? 'Utilisateur Google';

    const data = await api.socialLogin('google', token, email, name);
    await setToken(data.access_token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    return { email, name, token: data.access_token };
  } catch {
    Alert.alert(
      'Erreur de connexion',
      'Impossible de se connecter avec Google. Veuillez réessayer.',
      [{ text: 'OK' }],
    );
    return null;
  }
}

export function useGoogleAuth(): GoogleAuthResult {
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  const resultRef = useRef<SocialResult>(null);

  useEffect(() => {
    if (response) {
      handleGoogleResult(response).then((r) => {
        resultRef.current = r;
      });
    }
  }, [response]);

  const signIn = useCallback(async (): Promise<SocialResult> => {
    if (!request) {
      showUnavailable('Google');
      return null;
    }
    try {
      const authResult = await promptAsync();
      if (authResult.type !== 'success') return null;
      return await handleGoogleResult(authResult);
    } catch {
      showUnavailable('Google');
      return null;
    }
  }, [request, promptAsync]);

  return { requestReady: request !== null, promptAsync: signIn };
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

    const data = await api.socialLogin('apple', credential.identityToken, email, name);
    await setToken(data.access_token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    return { email, name, token: data.access_token };
  } catch (err: any) {
    if (err.code === 'ERR_REQUEST_CANCELED') return null;
    showUnavailable('Apple');
    return null;
  }
}
