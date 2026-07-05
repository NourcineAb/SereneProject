/**
 * AdMob wiring — feature-flagged via EXPO_PUBLIC_MONETIZATION.
 *
 * When EXPO_PUBLIC_MONETIZATION is 'ads' or 'both' AND the native module
 * react-native-google-mobile-ads is present (custom dev build), real AdMob
 * ads are served.
 *
 * When the module is absent (Expo Go, web, CI) every function degrades
 * gracefully — nothing throws, nothing crashes.
 *
 * NOTE: react-native-google-mobile-ads requires a custom dev build (EAS Build
 * or bare workflow). Do NOT add it as a direct dependency when running in
 * Expo Go. To enable:
 *   1. `npx expo install react-native-google-mobile-ads`
 *   2. Set EXPO_PUBLIC_MONETIZATION=ads (or both) in your .env.
 *   3. Configure the plugin in app.json (already done with test IDs).
 */

import { Platform } from 'react-native';

/** Parsed monetization mode from env. Defaults to 'iap'. */
export const MONETIZATION: 'iap' | 'ads' | 'both' =
  (process.env.EXPO_PUBLIC_MONETIZATION as 'iap' | 'ads' | 'both') || 'iap';

// ---------------------------------------------------------------------------
// Optional native module loader — mirrors the purchases.ts pattern exactly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdsModule = any;

let _adsModule: AdsModule | null | undefined = undefined; // undefined = not yet resolved

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdsModule(): AdsModule | null {
  if (_adsModule !== undefined) return _adsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // react-native-google-mobile-ads is an optional peer dep; module may not exist
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    _adsModule = require('react-native-google-mobile-ads');
  } catch {
    _adsModule = null;
  }
  return _adsModule;
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Returns true when ads should actually be displayed:
 * - MONETIZATION is 'ads' or 'both'
 * - The native module loaded successfully
 * - Not running on web
 */
export function adsEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  if (MONETIZATION === 'iap') return false;
  return getAdsModule() !== null;
}

/**
 * Initialise the AdMob SDK. Call once after fonts/splash, fire-and-forget.
 * No-op when the native module is unavailable.
 */
export async function initAds(): Promise<void> {
  const mod = getAdsModule();
  if (!mod) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await mod.mobileAds().initialize();
  } catch {
    // Non-fatal — ads will simply not load.
  }
}

/**
 * Returns the AdMob banner unit ID to use.
 * Priority: env var → library TestIds.BANNER.
 */
export function getBannerUnitId(): string {
  const envId = process.env.EXPO_PUBLIC_ADMOB_BANNER_ID;
  if (envId) return envId;
  const mod = getAdsModule();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return mod?.TestIds?.BANNER ?? 'ca-app-pub-3940256099942544/6300978111';
}

/**
 * Returns the AdMob interstitial unit ID to use.
 * Priority: env var → library TestIds.INTERSTITIAL.
 */
export function getInterstitialUnitId(): string {
  const envId = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID;
  if (envId) return envId;
  const mod = getAdsModule();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return mod?.TestIds?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/1033173712';
}

/**
 * Loads and shows a full-screen interstitial ad.
 * Resolves immediately (never throws) when:
 * - ads are not enabled
 * - the native module is unavailable
 * - loading or showing fails for any reason
 */
export async function showInterstitial(): Promise<void> {
  if (!adsEnabled()) return;
  const mod = getAdsModule();
  if (!mod) return;
  try {
    const adUnitId = getInterstitialUnitId();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const interstitial = mod.InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      // Resolve on close or error — never block the caller indefinitely.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      interstitial.addAdEventListener('closed', done);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      interstitial.addAdEventListener('error', done);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      interstitial.addAdEventListener('loaded', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        interstitial.show().catch(done);
      });
      // Safety timeout: resolve after 8 s even if the ad never loads.
      setTimeout(done, 8000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      interstitial.load();
    });
  } catch {
    // Non-fatal — caller continues normally.
  }
}
