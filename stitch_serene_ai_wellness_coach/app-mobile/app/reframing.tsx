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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { adsEnabled, showInterstitial } from '../lib/ads';
import { PillButton } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

const STEPS = [
  {
    title: 'Qu\'est-ce qui vous stresse ?',
    icon: 'cloud-outline' as const,
    placeholder: 'Décrivez la situation ou la pensée qui vous stresse...',
    field: 'stressor' as const,
  },
  {
    title: 'Quelle est la pensée automatique ?',
    icon: 'flash-outline' as const,
    placeholder: 'Quelle pensée est apparue spontanément ?',
    field: 'automatic' as const,
  },
  {
    title: 'Cherchez des preuves pour et contre',
    icon: 'scale-outline' as const,
    placeholderPro: 'Preuves en faveur de cette pensée...',
    placeholderContre: 'Preuves contre cette pensée...',
    field: 'evidence' as const,
  },
  {
    title: 'Quelle serait une pensée plus équilibrée ?',
    icon: 'sunny-outline' as const,
    placeholder: 'Formulez une pensée plus nuancée et bienveillante...',
    field: 'reframe' as const,
  },
];

export default function Reframing() {
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    stressor: '',
    automatic: '',
    evidencePro: '',
    evidenceContre: '',
    reframe: '',
  });
  const [completed, setCompleted] = useState(false);
  const cardAnim = useRef(new Animated.Value(0)).current;
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
    if (completed) return;
    cardAnim.setValue(0);
    Animated.spring(cardAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, [step, completed]);

  const updateField = (field: string, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      try {
        const entry = {
          date: new Date().toISOString(),
          stressor: data.stressor,
          automatic: data.automatic,
          evidencePro: data.evidencePro,
          evidenceContre: data.evidenceContre,
          reframe: data.reframe,
        };
        const existing = await AsyncStorage.getItem('reframing_entries');
        const entries = existing ? JSON.parse(existing) : [];
        entries.push(entry);
        await AsyncStorage.setItem('reframing_entries', JSON.stringify(entries));
      } catch {}
      setCompleted(true);
    }
  };

  const canProceed = () => {
    if (step === 0) return data.stressor.trim().length > 0;
    if (step === 1) return data.automatic.trim().length > 0;
    if (step === 2) return data.evidencePro.trim().length > 0 || data.evidenceContre.trim().length > 0;
    if (step === 3) return data.reframe.trim().length > 0;
    return false;
  };

  if (completed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <Animated.View
          style={[styles.completedBox, { opacity: completedOpacity, transform: [{ scale: completedScale }] }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Réévaluation cognitive terminée. Bravo !"
        >
          <View style={[styles.completedIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Exercice terminé !
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Vous avez réévalué votre pensée. Votre nouvelle perspective a été sauvegardée.
          </Text>
          <Text style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 4 }]}>
            {data.reframe}
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

  const current = STEPS[step];
  const cardTranslate = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

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
        <Text style={[type.headlineLg, { color: colors.primary }]}>Réévaluation cognitive</Text>
        <Text style={[type.bodyMd, { color: colors.outline, marginBottom: spacing.gutter }]}>
          Examinez et reformulez vos pensées
        </Text>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {STEPS.map((_, i) => (
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

        <Text style={[type.labelSm, { color: colors.outline, fontSize: 12, marginBottom: spacing.gutter }]}>
          Étape {step + 1} sur {STEPS.length}
        </Text>

        {/* Animated card */}
        <Animated.View
          style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardTranslate }], backgroundColor: colors.surfaceContainerLowest }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Étape ${step + 1}: ${current.title}`}
        >
          <View style={[styles.cardIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name={current.icon} size={36} color={colors.primary} />
          </View>
          <Text style={[type.titleMd, { color: colors.onSurface, textAlign: 'center', marginBottom: 16 }]}>
            {current.title}
          </Text>

          {step === 2 ? (
            <View style={{ gap: 12, width: '100%' }}>
              <View>
                <Text style={[type.labelSm, { color: colors.primary, marginBottom: 6, fontSize: 13 }]}>Pour cette pensée</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, color: colors.onSurface }]}
                  placeholder={current.placeholderPro}
                  placeholderTextColor={colors.outline}
                  value={data.evidencePro}
                  onChangeText={(t) => updateField('evidencePro', t)}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel="Entrez les preuves en faveur de cette pensée"
                />
              </View>
              <View>
                <Text style={[type.labelSm, { color: colors.primary, marginBottom: 6, fontSize: 13 }]}>Contre cette pensée</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, color: colors.onSurface }]}
                  placeholder={current.placeholderContre}
                  placeholderTextColor={colors.outline}
                  value={data.evidenceContre}
                  onChangeText={(t) => updateField('evidenceContre', t)}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel="Entrez les preuves contre cette pensée"
                />
              </View>
            </View>
          ) : (
            <TextInput
              style={[styles.input, { width: '100%', backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, color: colors.onSurface }]}
              placeholder={current.placeholder}
              placeholderTextColor={colors.outline}
              value={(data as any)[current.field]}
              onChangeText={(t) => updateField(current.field, t)}
              multiline
              numberOfLines={4}
              accessibilityLabel={`Entrez ${current.title.toLowerCase()}`}
            />
          )}
        </Animated.View>
      </View>

      <View style={{ padding: spacing.containerMobile, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <PillButton
          label={step < STEPS.length - 1 ? 'Étape suivante' : 'Sauvegarder'}
          onPress={handleNext}
          disabled={!canProceed()}
          accessibilityLabel={step < STEPS.length - 1 ? 'Passer à l\'étape suivante' : 'Sauvegarder et terminer'}
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
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  card: {
    width: '100%',
    borderRadius: radius.md,
    padding: 24,
    alignItems: 'center',
    marginTop: spacing.section,
    ...softGlow,
  },
  cardIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  input: {
    width: '100%',
    minHeight: 80,
    borderRadius: radius.base,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    textAlignVertical: 'top',
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
