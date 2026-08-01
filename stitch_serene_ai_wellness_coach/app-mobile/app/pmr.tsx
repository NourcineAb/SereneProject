import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { adsEnabled, showInterstitial } from '../lib/ads';
import { PillButton } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

const GROUPS = [
  { name: 'Pieds', icon: 'walk-outline' as const, tenseText: 'Contractez vos pieds... maintenez...', relaxText: 'Relâchez... ressentez la détente' },
  { name: 'Mollets', icon: 'body-outline' as const, tenseText: 'Contractez vos mollets... maintenez...', relaxText: 'Relâchez... laissez vos mollets se détendre' },
  { name: 'Cuisses', icon: 'body-outline' as const, tenseText: 'Contractez vos cuisses... maintenez...', relaxText: 'Relâchez... sentez la chaleur dans vos cuisses' },
  { name: 'Ventre', icon: 'fitness-outline' as const, tenseText: 'Contractez vos abdominaux... maintenez...', relaxText: 'Relâchez... respirez profondément' },
  { name: 'Mains / Bras', icon: 'body-outline' as const, tenseText: 'Serrez les poings, contractez vos bras... maintenez...', relaxText: 'Relâchez vos mains... sentez vos bras se détendre' },
  { name: 'Épaules / Visage', icon: 'accessibility-outline' as const, tenseText: 'Montez vos épaules vers vos oreilles... maintenez...', relaxText: 'Relâchez... détendez votre visage, votre mâchoire' },
];

const TENSE_SECONDS = 5;
const RELAX_SECONDS = 10;

export default function PMR() {
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [groupIndex, setGroupIndex] = useState(0);
  const [phase, setPhase] = useState<'tense' | 'relax'>('tense');
  const [count, setCount] = useState(TENSE_SECONDS);
  const [completed, setCompleted] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const completedScale = useRef(new Animated.Value(0.6)).current;
  const completedOpacity = useRef(new Animated.Value(0)).current;

  const stopExercise = async () => {
    if (!user?.is_premium && adsEnabled()) {
      await showInterstitial();
    }
    router.back();
  };

  useEffect(() => {
    if (completed) {
      Animated.parallel([
        Animated.spring(completedScale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.timing(completedOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [completed]);

  useEffect(() => {
    if (completed || groupIndex >= GROUPS.length) return;

    const targetScale = phase === 'tense' ? 1.2 : 1;
    const duration = (phase === 'tense' ? TENSE_SECONDS : RELAX_SECONDS) * 1000;

    Animated.timing(scaleAnim, {
      toValue: targetScale,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();

    const stepSeconds = phase === 'tense' ? TENSE_SECONDS : RELAX_SECONDS;
    setCount(stepSeconds);
    const tick = setInterval(() => setCount((c) => (c > 1 ? c - 1 : c)), 1000);
    const next = setTimeout(() => {
      if (phase === 'tense') {
        setPhase('relax');
      } else {
        setPhase('tense');
        setGroupIndex((g) => {
          if (g + 1 >= GROUPS.length) {
            setCompleted(true);
            return g + 1;
          }
          return g + 1;
        });
      }
    }, stepSeconds * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(next);
      scaleAnim.stopAnimation();
    };
  }, [groupIndex, phase, completed]);

  const handleNext = () => {
    scaleAnim.stopAnimation();
    if (phase === 'tense') {
      setPhase('relax');
      setCount(RELAX_SECONDS);
    } else {
      if (groupIndex + 1 >= GROUPS.length) {
        setCompleted(true);
      } else {
        setPhase('tense');
        setGroupIndex((g) => g + 1);
      }
    }
  };

  if (completed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <Animated.View
          style={[styles.completedBox, { opacity: completedOpacity, transform: [{ scale: completedScale }] }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Relaxation musculaire progressive terminée. Bravo !"
        >
          <View style={[styles.completedIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Exercice terminé !
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Vous avez travaillé les 6 groupes musculaires. Votre corps se détend.
          </Text>
          <Text style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 4 }]}>
            Prenez un instant pour noter comment vous vous sentez.
          </Text>
        </Animated.View>
        <View style={{ padding: spacing.containerMobile, gap: 12 }}>
          <PillButton
            label={t('exercise.backHome')}
            onPress={() => void stopExercise()}
            accessibilityLabel="Terminer et retourner à l'accueil"
          />
        </View>
      </View>
    );
  }

  const current = GROUPS[groupIndex];
  const totalSteps = GROUPS.length * 2;
  const completedSteps = groupIndex * 2 + (phase === 'relax' ? 1 : 0);
  const progress = completedSteps / totalSteps;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="leaf" size={24} color={colors.primary} />
          <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Serene</Text>
        </View>
        <Pressable
          onPress={() => void stopExercise()}
          style={[styles.close, { backgroundColor: colors.surfaceContainerHigh }]}
          accessibilityLabel="Arrêter l'exercice"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.outline} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Relaxation musculaire</Text>
        <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.gutter }]}>
          Contractez puis relâchez chaque groupe musculaire
        </Text>

        {/* Overall progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHigh }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[type.labelSm, { color: colors.outline, fontSize: 11, marginBottom: spacing.section }]}>
          Groupe {groupIndex + 1} / {GROUPS.length} — {phase === 'tense' ? 'Contraction' : 'Relâchement'}
        </Text>

        {/* Phase dots */}
        <View style={styles.phaseDots}>
          {GROUPS.map((g, i) => (
            <View
              key={i}
              style={[
                styles.phaseDot,
                i < groupIndex && { backgroundColor: colors.primary },
                i === groupIndex && { backgroundColor: colors.primaryFixed, borderColor: colors.primary, borderWidth: 2 },
              ]}
            >
              <Ionicons
                name={g.icon}
                size={14}
                color={i <= groupIndex ? colors.primary : colors.outline}
              />
            </View>
          ))}
        </View>

        {/* Orb with icon */}
        <View
          style={styles.orbWrap}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${current.name}: ${phase === 'tense' ? current.tenseText : current.relaxText}, ${count} secondes`}
        >
          <Animated.View style={[styles.glow, { transform: [{ scale: scaleAnim }], backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale: scaleAnim }], backgroundColor: colors.primary }]}>
            <Ionicons name={current.icon} size={48} color={colors.onPrimary} />
          </Animated.View>
        </View>

        {/* Timer */}
        <View style={[styles.timerCircle, { backgroundColor: colors.primaryFixed, borderColor: colors.primary }]}>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 24 }]}>{count}</Text>
          <Text style={[type.labelSm, { color: colors.outline, fontSize: 11 }]}>secondes</Text>
        </View>

        {/* Instruction */}
        <Text
          style={[type.titleMd, { color: colors.onSurface, textAlign: 'center', marginTop: spacing.gutter }]}
          accessibilityLiveRegion="polite"
        >
          {phase === 'tense' ? current.tenseText : current.relaxText}
        </Text>

        {/* Muscle group name */}
        <Text style={[type.bodyLg, { color: colors.secondary, marginTop: 8 }]}>
          {current.name}
        </Text>
      </View>

      <View style={{ padding: spacing.containerMobile, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <PillButton
          label={phase === 'tense' ? 'Passer au relâchement' : groupIndex < GROUPS.length - 1 ? 'Groupe suivant' : 'Terminer'}
          onPress={handleNext}
          accessibilityLabel={phase === 'tense' ? 'Passer au relâchement' : 'Passer au groupe musculaire suivant'}
        />
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
  container: { flex: 1 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMobile,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: radius.full,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  phaseDots: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.section,
  },
  phaseDot: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbWrap: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.gutter,
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
    ...softGlow,
  },
  timerCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
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
