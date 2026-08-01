/**
 * AdBanner — renders a native AdMob adaptive banner for non-premium users.
 *
 * Renders null when:
 * - isPremium is true (premium users never see ads)
 * - adsEnabled() is false (wrong MONETIZATION mode, Expo Go, web, no native module)
 *
 * The native BannerAd component is accessed through lib/ads.ts — this file
 * never imports react-native-google-mobile-ads directly.
 */

import { Platform, View } from 'react-native';
import { adsEnabled, getBannerUnitId } from '../lib/ads';
import { colors } from '../theme/serene';

interface AdBannerProps {
  isPremium: boolean;
}

export function AdBanner({ isPremium }: AdBannerProps) {
  if (isPremium || !adsEnabled() || Platform.OS === 'web') {
    return null;
  }

  // Lazily resolve the native component at render time so the module absence
  // (Expo Go, web) never causes an error — same guard as lib/ads.ts.
  let BannerAd: React.ComponentType<{
    unitId: string;
    size: string;
    requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
    onAdFailedToLoad?: (error: unknown) => void;
  }> | null = null;

  let BannerAdSize: { ADAPTIVE_BANNER: string } | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = require('react-native-google-mobile-ads');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    BannerAd = mod.BannerAd;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    BannerAdSize = mod.BannerAdSize;
  } catch {
    return null;
  }

  if (!BannerAd || !BannerAdSize) return null;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.surfaceContainerLowest,
        borderTopWidth: 1,
        borderTopColor: colors.surfaceVariant,
      }}
    >
      <BannerAd
        unitId={getBannerUnitId()}
        size={BannerAdSize.ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => {
          // Silently ignore load failures — the container collapses naturally
          // if the BannerAd renders nothing.
        }}
      />
    </View>
  );
}
