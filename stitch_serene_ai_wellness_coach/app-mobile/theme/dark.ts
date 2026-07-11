/**
 * Serene Dark Theme — dark counterpart to serene.ts.
 * Deep forest tones on dark backgrounds, muted accents, inverted surfaces.
 */
export const colors = {
  surface: '#1a2e25',
  surfaceDim: '#121f19',
  surfaceContainerLowest: '#0f1a14',
  surfaceContainerLow: '#1c3028',
  surfaceContainer: '#213a2f',
  surfaceContainerHigh: '#264335',
  surfaceContainerHighest: '#2b4c3c',
  surfaceVariant: '#2b4c3c',
  onSurface: '#e0f5e8',
  onSurfaceVariant: '#b8ccc2',
  inverseSurface: '#e0f5e8',
  outline: '#8a9e94',
  outlineVariant: '#3d5248',
  primary: '#6bc4a0',
  onPrimary: '#0a3a27',
  primaryContainer: '#3b7d5c',
  onPrimaryContainer: '#c6f0da',
  primaryFixed: '#b1f0ce',
  primaryFixedDim: '#95d4b3',
  secondary: '#9ab88e',
  secondaryContainer: '#3a5530',
  onSecondaryContainer: '#c6e4b5',
  tertiary: '#b8b5b0',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  background: '#1a2e25',
  onBackground: '#e0f5e8',
} as const;

export const radius = {
  sm: 8,
  base: 16,
  md: 24,
  lg: 32,
  xl: 48,
  full: 9999,
} as const;

export const spacing = {
  unit: 8,
  gutter: 16,
  containerMobile: 24,
  section: 40,
} as const;

export const fonts = {
  display: 'Quicksand_700Bold',
  headline: 'Quicksand_600SemiBold',
  title: 'PlusJakartaSans_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  label: 'PlusJakartaSans_600SemiBold',
} as const;

export const type = {
  displayLg: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  headlineLg: { fontFamily: fonts.headline, fontSize: 26, lineHeight: 32 },
  titleMd: { fontFamily: fonts.title, fontSize: 20, lineHeight: 28 },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  labelSm: { fontFamily: fonts.label, fontSize: 13, lineHeight: 16, letterSpacing: 0.65 },
} as const;

/** Ambient "soft glow" used for floating cards/buttons — darker shadow for dark mode. */
export const softGlow = {
  shadowColor: '#0a0a0a',
  shadowOpacity: 0.35,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 6,
};

export const MOODS = [
  { label: 'Calme', icon: 'happy-outline', score: 9 },
  { label: 'Joyeux', icon: 'happy-outline', score: 8 },
  { label: 'Neutre', icon: 'remove-circle-outline', score: 6 },
  { label: 'Anxieux', icon: 'sad-outline', score: 3 },
  { label: 'Fatigué', icon: 'sad-outline', score: 4 },
] as const;

/** Free-tier session cap shown in the UI (mirrors backend default). */
export const FREE_SESSION_LIMIT = 3;

/** Onboarding "what brings you here" options. */
export const ONBOARDING_GOALS = [
  { id: 'stress', label: 'Gérer mon stress', icon: 'thunderstorm-outline' },
  { id: 'sleep', label: 'Mieux dormir', icon: 'moon-outline' },
  { id: 'anxiety', label: "Réduire l'anxiété", icon: 'heart-outline' },
  { id: 'focus', label: 'Mieux me concentrer', icon: 'bulb-outline' },
  { id: 'general', label: 'Prendre soin de moi', icon: 'leaf-outline' },
] as const;
