/**
 * RevenueCat wiring — feature-flagged via EXPO_PUBLIC_REVENUECAT_KEY.
 *
 * When EXPO_PUBLIC_REVENUECAT_KEY is set (dev/prod builds with react-native-purchases
 * installed), real IAP flows are used.
 *
 * When the key is absent (Expo Go, web, CI), the mock falls back to calling
 * api.setPremium(true) directly so the app still runs everywhere.
 *
 * NOTE: react-native-purchases requires a custom dev build (EAS Build or bare
 * workflow). Do NOT add it as a direct dependency when running in Expo Go.
 * To enable: `npx expo install react-native-purchases` then set
 * EXPO_PUBLIC_REVENUECAT_KEY in your .env.
 */

import { api } from './api';

const REVENUECAT_ENABLED = Boolean(process.env.EXPO_PUBLIC_REVENUECAT_KEY);

// Lazily require react-native-purchases only when RevenueCat is enabled.
// The try/require pattern keeps Expo Go / web working without the native module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any | null {
  if (!REVENUECAT_ENABLED) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // react-native-purchases is an optional peer dep; module may not exist
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const Purchases = (require('react-native-purchases') as { default: any }).default;
    const key = process.env.EXPO_PUBLIC_REVENUECAT_KEY as string;
    Purchases.configure({ apiKey: key });
    return Purchases;
  } catch {
    return null;
  }
}

/**
 * Initiates the Serene Pro purchase flow.
 * - RevenueCat mode: presents the default offering and purchases the first package.
 * - Mock mode: directly marks the user as premium via the API.
 */
export async function purchaseSerenePro(): Promise<void> {
  const Purchases = getPurchases();
  if (Purchases) {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) throw new Error('No package available');
    await Purchases.purchasePackage(pkg);
    // The backend flips is_premium via the RevenueCat webhook; no extra call needed.
    return;
  }
  // Mock fallback
  await api.setPremium(true);
}

/**
 * Restores previous purchases (RevenueCat) or is a no-op in mock mode.
 */
export async function restorePurchases(): Promise<void> {
  const Purchases = getPurchases();
  if (Purchases) {
    await Purchases.restorePurchases();
    return;
  }
  // Mock: treat restore as a no-op (the API already has the correct state)
}
