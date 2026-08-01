import { useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, useType } from '../lib/theme-provider';
import { useI18n } from '../lib/i18n';
import { PillButton } from '../components/ui';
import { ONBOARDING_GOALS, radius, spacing } from '../theme/serene';

export const ONBOARDING_DONE_KEY = 'serene.onboarding_done';
export const ONBOARDING_NAME_KEY = 'serene.onboarding_name';
export const ONBOARDING_GOAL_KEY = 'serene.onboarding_goal';

const STEPS = ['welcome', 'goal', 'done'] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const type = useType();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionTo = (next: Step) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(next), 160);
  };

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    if (name.trim()) await AsyncStorage.setItem(ONBOARDING_NAME_KEY, name.trim());
    if (goal) await AsyncStorage.setItem(ONBOARDING_GOAL_KEY, goal);
    router.replace('/login');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.dot,
              { backgroundColor: STEPS.indexOf(step) >= i ? colors.primary : colors.outlineVariant },
            ]}
          />
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 'welcome' && (
          <WelcomeStep colors={colors} t={t} name={name} setName={setName} onNext={() => transitionTo('goal')} />
        )}
        {step === 'goal' && (
          <GoalStep colors={colors} t={t} selected={goal} setSelected={setGoal} onNext={() => transitionTo('done')} />
        )}
        {step === 'done' && <DoneStep colors={colors} t={t} name={name} onFinish={finish} />}
      </Animated.View>
    </View>
  );
}

function WelcomeStep({
  colors,
  t,
  name,
  setName,
  onNext,
}: {
  colors: ReturnType<typeof useColors>;
  t: (key: string, params?: Record<string, string>) => string;
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  const type = useType();
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
        <Ionicons name="leaf" size={44} color={colors.onPrimary} />
      </View>
      <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center' }]}>
        {t('onboarding.welcome')}
      </Text>
      <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }]}>
        {t('onboarding.welcomeSub')}
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface, fontFamily: type.bodyMd.fontFamily }]}
        placeholder={t('onboarding.namePlaceholder')}
        placeholderTextColor={colors.outline}
        value={name}
        onChangeText={setName}
        autoFocus
        accessibilityLabel={t('onboarding.namePlaceholder')}
      />
      <PillButton
        label={name.trim() ? `Bonjour, ${name.trim()} !` : t('onboarding.continue')}
        onPress={onNext}
        style={{ marginTop: spacing.gutter }}
      />
    </View>
  );
}

function GoalStep({
  colors,
  t,
  selected,
  setSelected,
  onNext,
}: {
  colors: ReturnType<typeof useColors>;
  t: (key: string, params?: Record<string, string>) => string;
  selected: string | null;
  setSelected: (v: string) => void;
  onNext: () => void;
}) {
  const type = useType();
  const goalLabels: Record<string, string> = {
    stress: t('onboarding.stress'),
    sleep: t('onboarding.sleep'),
    anxiety: t('onboarding.anxiety'),
    focus: t('onboarding.focus'),
    general: t('onboarding.general'),
  };
  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
        {t('onboarding.goal')}
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }]}>
        {t('onboarding.goalSub')}
      </Text>
      <View style={styles.goalGrid}>
        {ONBOARDING_GOALS.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setSelected(g.id)}
            style={[
              styles.goalCard,
              { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant },
              selected === g.id && { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
            ]}
            accessibilityLabel={goalLabels[g.id] ?? g.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === g.id }}
          >
            <Ionicons
              name={g.icon as any}
              size={28}
              color={selected === g.id ? colors.primary : colors.secondary}
            />
            <Text
              style={[type.bodyMd, { color: selected === g.id ? colors.primary : colors.onSurface, textAlign: 'center' }]}
            >
              {goalLabels[g.id] ?? g.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <PillButton
        label={t('onboarding.continue')}
        onPress={onNext}
        disabled={!selected}
        style={{ marginTop: spacing.gutter }}
      />
    </ScrollView>
  );
}

function DoneStep({ colors, t, name, onFinish }: { colors: ReturnType<typeof useColors>; t: (key: string, params?: Record<string, string>) => string; name: string; onFinish: () => void }) {
  const type = useType();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  Animated.spring(scaleAnim, {
    toValue: 1,
    friction: 5,
    tension: 80,
    useNativeDriver: true,
  }).start();

  const doneTitle = name.trim()
    ? t('onboarding.done', { name: name.trim() })
    : t('onboarding.doneDefault');

  return (
    <View style={[styles.stepContainer, { justifyContent: 'center' }]}>
      <Animated.View style={[styles.doneIcon, { backgroundColor: colors.primary, transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark" size={48} color={colors.onPrimary} />
      </Animated.View>
      <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', marginTop: 24 }]}>
        {doneTitle}
      </Text>
      <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }]}>
        {t('onboarding.doneSub')}
      </Text>
      <PillButton
        label={t('onboarding.createAccount')}
        onPress={onFinish}
        style={{ marginTop: spacing.section }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.containerMobile,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  stepContainer: {
    flex: 1,
    paddingTop: spacing.section,
    gap: spacing.gutter,
    alignItems: 'center',
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 22,
    fontSize: 16,
    marginTop: spacing.gutter,
  },
  goalGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  goalCard: {
    width: '44%',
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 8,
  },
  doneIcon: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
