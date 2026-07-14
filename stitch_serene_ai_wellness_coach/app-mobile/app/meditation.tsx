import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { PillButton } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

type Duration = 3 | 5 | 10;
type Phase = 'inspire' | 'retiens' | 'expire' | 'retiens2';

const DURATIONS: Duration[] = [3, 5, 10];

const PHASES: { key: Phase; label: string; seconds: number; scale: number }[] = [
  { key: 'inspire', label: 'Inspirez...', seconds: 4, scale: 1.3 },
  { key: 'retiens', label: 'Retenez...', seconds: 4, scale: 1.3 },
  { key: 'expire', label: 'Expirez...', seconds: 6, scale: 0.85 },
  { key: 'retiens2', label: 'Retenez...', seconds: 2, scale: 0.85 },
];

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Meditation() {
  const colors = useColors();
  const type = useType();
  // Breathing background gradient — derived from theme tokens so it follows
  // light/dark mode (was previously hardcoded surface hex values).
  const bgColors = [
    colors.surfaceContainerLowest,
    colors.surfaceContainerLow,
    colors.surfaceContainer,
    colors.surfaceContainerHigh,
    colors.background,
  ];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [duration, setDuration] = useState<Duration>(5);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const scale = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;
  const completedScale = useRef(new Animated.Value(0.6)).current;
  const completedOpacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPremium = user?.is_premium ?? false;

  useEffect(() => {
    if (!isPremium) return;
        const loop = Animated.loop(
          Animated.sequence(
            bgColors.map((_, i) =>
              Animated.timing(bgAnim, {
                toValue: i / (bgColors.length - 1),
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [isPremium]);

  useEffect(() => {
    if (!started || completed) return;

    const p = PHASES[phaseIndex];
    Animated.timing(scale, {
      toValue: p.scale,
      duration: p.seconds * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();

    setCountdown(p.seconds);

    const tick = setInterval(() => {
      setCountdown((c) => (c > 1 ? c - 1 : c));
    }, 1000);

    const next = setTimeout(() => {
      setPhaseIndex((prev) => (prev + 1) % PHASES.length);
    }, p.seconds * 1000);

    timerRef.current = tick;
    phaseTimerRef.current = next;

    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [phaseIndex, started, completed]);

  const startSession = () => {
    setStarted(true);
    setPhaseIndex(0);
    setCountdown(PHASES[0].seconds);
  };

  const stopSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    setStarted(false);
    setCompleted(false);
    setPhaseIndex(0);
    scale.setValue(1);
    router.back();
  };

  // Session countdown timer
  useEffect(() => {
    if (!started || completed) return;
    let remaining = duration * 60;
    const sessionTick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(sessionTick);
        setCompleted(true);
        if (timerRef.current) clearInterval(timerRef.current);
        if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
        Animated.parallel([
          Animated.spring(completedScale, { toValue: 1, friction: 5, useNativeDriver: true }),
          Animated.timing(completedOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    }, 1000);
    return () => clearInterval(sessionTick);
  }, [started, completed, duration]);

  const bgColor = bgAnim.interpolate({
    inputRange: bgColors.map((_, i) => i / (bgColors.length - 1)),
    outputRange: bgColors,
  });

  if (!isPremium) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceContainerHigh }]} accessibilityLabel="Retour" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Méditation</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.premiumIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="lock-closed" size={36} color={colors.primary} />
          </View>
          <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
            Fonctionnalité Pro
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            La méditation guidée est réservée aux membres Pro. Passez à Pro pour y accéder.
          </Text>
          <PillButton label="Découvrir Pro" onPress={() => router.push('/paywall')} style={{ marginTop: 16 }} />
        </View>
      </View>
    );
  }

  if (completed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <Animated.View
          style={[styles.completedBox, { opacity: completedOpacity, transform: [{ scale: completedScale }] }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Méditation terminée"
        >
          <View style={[styles.completedIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Méditation terminée
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Vous avez médité pendant {duration} minute{duration > 1 ? 's' : ''}. Bravo pour cette pause de calme.
          </Text>
          <Text style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 4 }]}>
            Prenez un moment pour ressentir la sérénité.
          </Text>
        </Animated.View>
        <View style={{ padding: spacing.containerMobile, gap: 12 }}>
          <PillButton label="Terminer" onPress={stopSession} />
        </View>
      </View>
    );
  }

  if (!started) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceContainerHigh }]} accessibilityLabel="Retour" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Méditation</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
            Choisissez votre durée
          </Text>
          <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.section, textAlign: 'center' }]}>
            Installez-vous confortablement et fermez les yeux.
          </Text>
          <View style={styles.durRow}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDuration(d)}
                style={[
                  styles.durCard,
                  duration === d
                    ? { backgroundColor: colors.primaryFixed, borderColor: colors.primary }
                    : { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
                ]}
                accessibilityLabel={`${d} minutes`}
                accessibilityRole="button"
                accessibilityState={{ selected: duration === d }}
              >
                <Text style={[type.displayLg, { color: duration === d ? colors.primary : colors.onSurface, fontSize: 28 }]}>
                  {d}
                </Text>
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>min</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: spacing.section, width: '100%' }}>
            <PillButton label="Commencer" onPress={startSession} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top, backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="leaf" size={24} color={colors.primary} />
          <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Serene</Text>
        </View>
        <Pressable
          onPress={stopSession}
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainerHigh }]}
          accessibilityLabel="Arrêter la méditation"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.outline} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Méditation guidée</Text>
        <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.section }]}>
          {formatCountdown(countdown)} restant
        </Text>

        <View
          style={styles.orbWrap}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${PHASES[phaseIndex].label}, ${countdown} secondes`}
        >
          <Animated.View style={[styles.glow, { transform: [{ scale }], backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale }], backgroundColor: colors.primary }]}>
            <Text style={[type.headlineLg, { color: colors.onPrimary, fontSize: 20, textAlign: 'center' }]}>
              {PHASES[phaseIndex].label}
            </Text>
            <Text style={[type.labelSm, { color: colors.onPrimary, opacity: 0.85, fontSize: 15 }]}>
              {countdown}s
            </Text>
          </Animated.View>
        </View>

        <View style={styles.steps}>
          {PHASES.map((p, i) => (
            <View key={p.key} style={{ alignItems: 'center', opacity: i === phaseIndex ? 1 : 0.4 }}>
              <View
                style={[
                  styles.stepDot,
                  i === phaseIndex
                    ? { backgroundColor: colors.primaryFixed, borderColor: colors.primary }
                    : { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
                ]}
              >
                <Ionicons
                  name={p.key === 'inspire' ? 'arrow-up' : p.key === 'expire' ? 'arrow-down' : 'pause'}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text style={[type.labelSm, { color: colors.outline, fontSize: 10 }]} numberOfLines={1}>
                {p.label.replace('...', '')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: spacing.containerMobile, paddingBottom: insets.bottom + 16 }}>
        <PillButton
          label="Arrêter"
          variant="tonal"
          onPress={stopSession}
          accessibilityLabel="Arrêter et retourner"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMobile,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMobile,
  },
  orbWrap: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.section,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: radius.full,
    opacity: 0.1,
  },
  orb: {
    width: 200,
    height: 200,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...softGlow,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  stepDot: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  durRow: {
    flexDirection: 'row',
    gap: 16,
  },
  durCard: {
    width: 90,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  premiumIcon: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMobile,
    gap: spacing.gutter,
  },
  completedIcon: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...softGlow,
  },
});
