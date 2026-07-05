import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { adsEnabled, showInterstitial } from '../lib/ads';
import { PillButton } from '../components/ui';
import { colors, radius, softGlow, spacing, type } from '../theme/serene';

const PHASES = [
  { label: 'Inspirer', seconds: 4, scale: 1.25 },
  { label: 'Retenir', seconds: 4, scale: 1.25 },
  { label: 'Expirer', seconds: 4, scale: 0.85 },
  { label: 'Retenir', seconds: 4, scale: 0.85 },
];

const MAX_ROUNDS = 4;

const PHASE_ICONS: Record<string, string> = {
  'Inspirer': 'arrow-up',
  'Retenir': 'pause',
  'Expirer': 'arrow-down',
};

export default function Breathing() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState(4);
  const [round, setRound] = useState(1);
  const [completed, setCompleted] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const completedScale = useRef(new Animated.Value(0.6)).current;
  const completedOpacity = useRef(new Animated.Value(0)).current;

  const stopExercise = async () => {
    if (!user?.is_premium && adsEnabled()) {
      await showInterstitial();
    }
    router.back();
  };

  // Trigger "round complete" celebration when all rounds done
  useEffect(() => {
    if (completed) {
      Animated.parallel([
        Animated.spring(completedScale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.timing(completedOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [completed]);

  useEffect(() => {
    if (completed) return;
    const p = PHASES[phase];
    Animated.timing(scale, {
      toValue: p.scale,
      duration: p.seconds * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();

    setCount(p.seconds);
    const tick = setInterval(() => setCount((c) => (c > 1 ? c - 1 : c)), 1000);
    const next = setTimeout(() => {
      setPhase((prev) => {
        const np = (prev + 1) % PHASES.length;
        if (np === 0) {
          setRound((r) => {
            if (r + 1 > MAX_ROUNDS) {
              setCompleted(true);
              return r + 1;
            }
            return r + 1;
          });
        }
        return np;
      });
    }, p.seconds * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [phase, completed]);

  if (completed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        <Animated.View
          style={[
            styles.completedBox,
            {
              opacity: completedOpacity,
              transform: [{ scale: completedScale }],
            },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Exercice terminé. Bravo !"
        >
          <View style={styles.completedIcon}>
            <Ionicons name="checkmark-circle" size={56} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Exercice terminé !
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Vous avez complété {MAX_ROUNDS} cycles de respiration au carré. Bravo.
          </Text>
          <Text style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 4 }]}>
            Prenez un instant pour noter comment vous vous sentez.
          </Text>
        </Animated.View>
        <View style={{ padding: spacing.containerMobile, gap: 12 }}>
          <PillButton
            label="Retourner à l'accueil"
            onPress={() => void stopExercise()}
            accessibilityLabel="Terminer et retourner à l'accueil"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="leaf" size={24} color={colors.primary} />
          <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Serene</Text>
        </View>
        <Pressable
          onPress={() => void stopExercise()}
          style={styles.close}
          accessibilityLabel="Arrêter l'exercice"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.outline} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Respiration au carré</Text>
        <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.section }]}>
          Trouvez votre équilibre intérieur
        </Text>

        {/* Breathing orb */}
        <View
          style={styles.orbWrap}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${PHASES[phase].label}, ${count} secondes`}
        >
          <Animated.View style={[styles.glow, { transform: [{ scale }] }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
            <Text style={[type.displayLg, { color: colors.onPrimary, fontSize: 22 }]}>
              {PHASES[phase].label}
            </Text>
            <Text style={[type.labelSm, { color: colors.onPrimary, opacity: 0.85, fontSize: 15 }]}>
              {count}s
            </Text>
          </Animated.View>
        </View>

        {/* Phase step indicators */}
        <View style={styles.steps}>
          {PHASES.map((p, i) => (
            <View key={i} style={{ alignItems: 'center', opacity: i === phase ? 1 : 0.4 }}>
              <View
                style={[
                  styles.stepDot,
                  i === phase && { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
                ]}
              >
                <Ionicons
                  name={(PHASE_ICONS[p.label] ?? 'pause') as any}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text style={[type.labelSm, { color: colors.outline, fontSize: 11 }]}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Round progress dots */}
        <View style={styles.roundDots}>
          {Array.from({ length: MAX_ROUNDS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.roundDot,
                i < round - 1 && { backgroundColor: colors.primary },
                i === round - 1 && { backgroundColor: colors.primaryFixedDim, borderColor: colors.primary, borderWidth: 2 },
              ]}
            />
          ))}
        </View>
        <Text style={[type.bodyMd, { color: colors.outline, marginTop: 4 }]}>
          Cycle {round} / {MAX_ROUNDS}
        </Text>
      </View>

      <View style={{ padding: spacing.containerMobile, paddingBottom: insets.bottom + 16 }}>
        <PillButton
          label="Arrêter l'exercice"
          variant="tonal"
          onPress={() => void stopExercise()}
          accessibilityLabel="Arrêter et retourner à l'écran précédent"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMobile,
    paddingVertical: 12,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
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
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.section,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    opacity: 0.1,
  },
  orb: {
    width: 220,
    height: 220,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...softGlow,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  stepDot: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roundDots: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.gutter,
  },
  roundDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...softGlow,
  },
});
