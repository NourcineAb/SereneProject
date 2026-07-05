/**
 * Onboarding — shown once on first launch before login/register.
 * Collects: name, goal, preferred daily reminder time.
 * Stores choices in AsyncStorage so they survive app restarts and can be read
 * by the home screen and push scheduler.
 * Does NOT require authentication — it leads into the login/register flow.
 */
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
import { PillButton } from '../components/ui';
import { colors, ONBOARDING_GOALS, radius, spacing, type } from '../theme/serene';
import { scheduleLocalDailyReminder } from '../lib/push';

export const ONBOARDING_DONE_KEY = 'serene.onboarding_done';
export const ONBOARDING_NAME_KEY = 'serene.onboarding_name';
export const ONBOARDING_GOAL_KEY = 'serene.onboarding_goal';

const STEPS = ['welcome', 'goal', 'reminder', 'done'] as const;
type Step = (typeof STEPS)[number];

const REMINDER_HOURS = [7, 8, 9, 12, 18, 20, 21, 22];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<string | null>(null);
  const [reminderHour, setReminderHour] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionTo = (next: Step) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    // Delay the state update to mid-fade so the new content fades in
    setTimeout(() => setStep(next), 160);
  };

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    if (name.trim()) await AsyncStorage.setItem(ONBOARDING_NAME_KEY, name.trim());
    if (goal) await AsyncStorage.setItem(ONBOARDING_GOAL_KEY, goal);
    if (reminderHour !== null) {
      await scheduleLocalDailyReminder(reminderHour);
    }
    router.replace('/login');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Step dots */}
      <View style={styles.dots}>
        {STEPS.slice(0, 3).map((s, i) => (
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
          <WelcomeStep name={name} setName={setName} onNext={() => transitionTo('goal')} />
        )}
        {step === 'goal' && (
          <GoalStep selected={goal} setSelected={setGoal} onNext={() => transitionTo('reminder')} />
        )}
        {step === 'reminder' && (
          <ReminderStep
            selected={reminderHour}
            setSelected={setReminderHour}
            onNext={() => transitionTo('done')}
            onSkip={() => transitionTo('done')}
          />
        )}
        {step === 'done' && <DoneStep name={name} onFinish={finish} />}
      </Animated.View>
    </View>
  );
}

// ─── Step sub-components ─────────────────────────────────────────────────────

function WelcomeStep({
  name,
  setName,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.heroIcon}>
        <Ionicons name="leaf" size={44} color={colors.onPrimary} />
      </View>
      <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center' }]}>
        Bienvenue dans{'\n'}Serene
      </Text>
      <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }]}>
        Votre refuge contre le stress du quotidien. Commençons par faire connaissance.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Votre prénom"
        placeholderTextColor={colors.outline}
        value={name}
        onChangeText={setName}
        autoFocus
        accessibilityLabel="Votre prénom"
      />
      <PillButton
        label={name.trim() ? `Bonjour, ${name.trim()} !` : 'Continuer'}
        onPress={onNext}
        style={{ marginTop: spacing.gutter }}
        accessibilityLabel="Passer à l'étape suivante"
      />
    </View>
  );
}

function GoalStep({
  selected,
  setSelected,
  onNext,
}: {
  selected: string | null;
  setSelected: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
        Qu'est-ce qui vous amène ?
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }]}>
        Choisissez votre objectif principal.
      </Text>
      <View style={styles.goalGrid}>
        {ONBOARDING_GOALS.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setSelected(g.id)}
            style={[
              styles.goalCard,
              selected === g.id && { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
            ]}
            accessibilityLabel={g.label}
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
              {g.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <PillButton
        label="Continuer"
        onPress={onNext}
        disabled={!selected}
        style={{ marginTop: spacing.gutter }}
        accessibilityLabel="Continuer vers l'étape suivante"
      />
    </ScrollView>
  );
}

function ReminderStep({
  selected,
  setSelected,
  onNext,
  onSkip,
}: {
  selected: number | null;
  setSelected: (v: number) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
        À quelle heure vous rappeler ?
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }]}>
        Un petit rappel quotidien aide à garder la régularité.
      </Text>
      <View style={styles.timeGrid}>
        {REMINDER_HOURS.map((h) => (
          <Pressable
            key={h}
            onPress={() => setSelected(h)}
            style={[
              styles.timeChip,
              selected === h && { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
            ]}
            accessibilityLabel={`Rappel à ${h}h`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === h }}
          >
            <Text
              style={[type.bodyMd, { color: selected === h ? colors.primary : colors.onSurface }]}
            >
              {h}h00
            </Text>
          </Pressable>
        ))}
      </View>
      <PillButton
        label="Activer le rappel"
        onPress={onNext}
        disabled={selected === null}
        style={{ marginTop: spacing.gutter }}
        accessibilityLabel="Activer le rappel quotidien"
      />
      <Pressable onPress={onSkip} style={{ marginTop: 16 }} accessibilityRole="button">
        <Text style={[type.bodyMd, { color: colors.outline, textAlign: 'center' }]}>
          Pas maintenant
        </Text>
      </Pressable>
    </View>
  );
}

function DoneStep({ name, onFinish }: { name: string; onFinish: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  // Bounce-in the checkmark icon
  Animated.spring(scaleAnim, {
    toValue: 1,
    friction: 5,
    tension: 80,
    useNativeDriver: true,
  }).start();

  return (
    <View style={[styles.stepContainer, { justifyContent: 'center' }]}>
      <Animated.View style={[styles.doneIcon, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark" size={48} color={colors.onPrimary} />
      </Animated.View>
      <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', marginTop: 24 }]}>
        {name.trim() ? `Prêt(e), ${name.trim()} !` : 'Tout est prêt !'}
      </Text>
      <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }]}>
        Créez votre compte pour commencer votre premier exercice guidé.
      </Text>
      <PillButton
        label="Créer mon compte"
        onPress={onFinish}
        style={{ marginTop: spacing.section }}
        accessibilityLabel="Créer un compte et commencer"
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 22,
    color: colors.onSurface,
    fontFamily: type.bodyMd.fontFamily,
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
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 8,
  },
  timeGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
  },
  timeChip: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  doneIcon: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
