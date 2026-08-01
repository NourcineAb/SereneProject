// Dynamic Expo config. Extends app.json and conditionally enables the AdMob
// native config plugin ONLY when `react-native-google-mobile-ads` is installed
// (it's an optional dependency that requires a custom dev build). This keeps
// `expo start` / `expo export` working out-of-the-box in Expo Go and on web.
const base = require('./app.json');

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

let adsPlugin = null;
try {
  require.resolve('react-native-google-mobile-ads');
  adsPlugin = [
    'react-native-google-mobile-ads',
    {
      androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || TEST_ANDROID_APP_ID,
      iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || TEST_IOS_APP_ID,
    },
  ];
} catch {
  // Package not installed → skip the plugin (mock/no-op ads in Expo Go & web).
}

module.exports = () => {
  const expo = { ...base.expo };
  expo.plugins = [...(expo.plugins || []), ...(adsPlugin ? [adsPlugin] : [])];
  return { expo };
};
