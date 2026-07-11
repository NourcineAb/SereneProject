import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

const STEPS = [
  { count: 5, sense: 'VOIR', icon: 'eye-outline' as const, prompt: 'Nommez 5 choses que vous pouvez VOIR' },
  { count: 4, sense: 'TOUCHER', icon: 'hand-left-outline' as const, prompt: 'Nommez 4 choses que vous pouvez TOUCHER' },
  { count: 3, sense: 'ENTENDRE', icon: 'ear-outline' as const, prompt: 'Nommez 3 choses que vous pouvez ENTENDRE' },
  { count: 2, sense: 'SENTIR', icon: 'flower-outline' as const, prompt: 'Nommez 2 choses que vous pouvez SENTIR (odeur)' },
  { count: 1, sense: 'GOÛTER', icon: 'chatbubble-ellipses-outline' as const, prompt: 'Nommez 1 chose que vous pouvez GOÛTER' },
];

const STEP_DURATION = 30;

export default function Grounding() {
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(STEP_DURATION);
  const [inputs, setInputs] = useState<string[]>(Array(STEPS.length).fill(''));
  const [completed, setCompleted] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
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
    if (completed || step >= STEPS.length) return;

    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    ]).start();

    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: STEP_DURATION * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    setCount(STEP_DURATION);
    const tick = setInterval(() => setCount((c) => (c > 1 ? c - 1 : c)), 1000);
    const next = setTimeout(() => {
      if (step < STEPS.length - 1) {
        setStep((s) => s + 1);
      } else {
        setCompleted(true);
      }
    }, STEP_DURATION * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(next);
      scaleAnim.stopAnimation();
      progressAnim.stopAnimation();
    };
  }, [step, completed]);

  const handleNext = () => {
    scaleAnim.stopAnimation();
    progressAnim.stopAnimation();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setCompleted(true);
    }
  };

  if (completed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <Animated.View
          style={[styles.completedBox, { opacity: completedOpacity, transform: [{ scale: completedScale }] }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Exercice d'ancrage terminé. Bravo !"
        >
          <View style={[styles.completedIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Exercice terminé !
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Vous avez ancré vos sens en 5 étapes. Bravo.
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

  const currentStep = STEPS[step];

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
        <Text style={[type.headlineLg, { color: colors.primary }]}>Ancrage 5-4-3-2-1</Text>
        <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.section }]}>
          Connectez-vous à vos sens
        </Text>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {STEPS.map((s, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i < step && { backgroundColor: colors.primary },
                i === step && { backgroundColor: colors.primaryFixed, borderColor: colors.primary, borderWidth: 2 },
              ]}
            />
          ))}
        </View>

        {/* Orb with icon */}
        <View
          style={styles.orbWrap}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Étape ${step + 1} sur 5: ${currentStep.prompt}, ${count} secondes restantes`}
        >
          <View style={[styles.glow, { transform: [{ scale: scaleAnim }], backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale: scaleAnim }], backgroundColor: colors.primary }]}>
            <Ionicons name={currentStep.icon} size={48} color={colors.onPrimary} />
          </Animated.View>
        </View>

        {/* Timer */}
        <View style={styles.timerRow}>
          <View style={[styles.timerCircle, { backgroundColor: colors.primaryFixed, borderColor: colors.primary }]}>
            <Text style={[type.displayLg, { color: colors.primary, fontSize: 24 }]}>{count}</Text>
            <Text style={[type.labelSm, { color: colors.outline, fontSize: 11 }]}>secondes</Text>
          </View>
        </View>

        {/* Step prompt */}
        <Text
          style={[type.titleMd, { color: colors.onSurface, textAlign: 'center', marginBottom: 12 }]}
          accessibilityLiveRegion="polite"
        >
          {currentStep.prompt}
        </Text>

        {/* Input */}
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.base, borderWidth: 1, borderColor: colors.outlineVariant, color: colors.onSurface }]}
          placeholder={`Ce que je ${currentStep.sense.toLowerCase()}...`}
          placeholderTextColor={colors.outline}
          value={inputs[step]}
          onChangeText={(t) => {
            const next = [...inputs];
            next[step] = t;
            setInputs(next);
          }}
          multiline
          numberOfLines={3}
          accessibilityLabel={`Entrez ce que vous pouvez ${currentStep.sense.toLowerCase()}`}
        />
      </View>

      <View style={{ padding: spacing.containerMobile, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <PillButton
          label={step < STEPS.length - 1 ? 'Étape suivante' : 'Terminer'}
          onPress={handleNext}
          accessibilityLabel={step < STEPS.length - 1 ? 'Passer à l\'étape suivante' : 'Terminer l\'exercice'}
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
  progressDots: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.section,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  orbWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.gutter,
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: radius.full,
    opacity: 0.1,
  },
  orb: {
    width: 180,
    height: 180,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...softGlow,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.gutter,
  },
  timerCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  input: {
    width: '100%',
    minHeight: 80,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    textAlignVertical: 'top',
    ...softGlow,
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
