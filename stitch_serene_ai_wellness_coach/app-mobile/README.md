# Serene — Mobile app (Expo / React Native)

The Serene wellness client implementing the 5 Stitch screens with the Serene
design system: **Home / mood check**, **Chat (AI coach)**, **Breathing exercise**,
**Progress dashboard**, **Paywall**.

## Stack

- Expo SDK 52 + expo-router (file-based, typed routes)
- TypeScript, React Native StyleSheet (design tokens in `theme/serene.ts`)
- Fonts: Quicksand (display) + Plus Jakarta Sans (body) via `@expo-google-fonts`
- Auth token in AsyncStorage; typed API client in `lib/api.ts`

## Run

```bash
cd app-mobile
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your backend
npx expo start              # press i / a / w  (iOS sim / Android / web)
```

For a **physical device** (Expo Go): set `EXPO_PUBLIC_API_URL` to your machine's
LAN IP (e.g. `http://192.168.1.20:8081`) — `localhost` won't resolve on the phone.

### Web preview via Docker

```bash
docker build -t serene-mobile . && docker run -p 19006:19006 serene-mobile
# open http://localhost:19006
```

## Structure

```
app/
  _layout.tsx        root stack + fonts + AuthProvider
  index.tsx          auth gate → login or tabs
  login.tsx          register / login
  (tabs)/
    index.tsx        Home / mood check  (écran 1)
    chat.tsx         Chat with Serene   (écran 2)
    progress.tsx     Dashboard          (écran 4)
    profile.tsx      Profile + upgrade
  breathing.tsx      Box-breathing exercise (écran 3, modal)
  paywall.tsx        Serene Pro upgrade     (écran 5, modal)
lib/    api.ts (backend client) · auth.tsx (auth context)
theme/  serene.ts (design tokens)
components/ ui.tsx (PillButton, Card, Tag)
```

## Notes

- **Push notifications**: `expo-notifications` and `expo-device` are wired. On every
  successful sign-in / token refresh, `lib/push.ts` requests permission, obtains the Expo
  push token, and POSTs it to `POST /push/register`. Gracefully returns `null` on
  simulators and web — no crash, no UI impact.

- **RevenueCat (paywall)**: `lib/purchases.ts` wraps `react-native-purchases` behind a
  feature flag (`EXPO_PUBLIC_REVENUECAT_KEY`). When the key is absent the app falls back
  to the mock `/billing/premium` endpoint, so it keeps running in Expo Go and on the web.
  To enable real IAP in production:
  1. Run a custom dev build (EAS Build / bare workflow).
  2. `npx expo install react-native-purchases`
  3. Set `EXPO_PUBLIC_REVENUECAT_KEY=<your key>` in `.env`.
     The backend confirms entitlements via the RevenueCat webhook — no extra API call needed
     after a successful purchase.

- **Monetization (ads + IAP)**: controlled by `EXPO_PUBLIC_MONETIZATION` in `.env`:

  | Mode   | Behaviour                                             |
  | ------ | ----------------------------------------------------- |
  | `iap`  | RevenueCat paywall only — no ads (default)            |
  | `ads`  | AdMob banners + interstitials for all free users      |
  | `both` | AdMob for free users + RevenueCat upgrade removes ads |

  Ads use `react-native-google-mobile-ads` which requires a **custom dev build**
  (EAS Build / bare workflow — not compatible with Expo Go):

  ```bash
  npx expo install react-native-google-mobile-ads
  ```

  Google's public **test IDs** are shipped as defaults in `.env.example` and in
  `app.json` so the app compiles and runs out-of-the-box. Replace with your real
  AdMob App IDs and unit IDs in `.env` for production.

  **Premium users never see ads** — the `is_premium` flag from `lib/auth.tsx`
  (`user.is_premium`) suppresses every ad surface. Keep the backend
  `MONETIZATION_MODE` env var consistent with `EXPO_PUBLIC_MONETIZATION`:
  `ads` mode relaxes the weekly session gate so free users aren't double-gated.

- **Chat history hydration**: on mount `app/(tabs)/chat.tsx` fetches the most recent
  session (`GET /chat/sessions`) and loads its messages (`GET /chat/sessions/{id}/messages`)
  so the conversation resumes where it left off. Errors are caught silently (offline-safe).
  The welcome message is shown only when there is no prior history.

- **Technique deep-link**: when the coach returns `technique: "box_breathing"`, the chat
  shows a chip that opens the breathing screen.
