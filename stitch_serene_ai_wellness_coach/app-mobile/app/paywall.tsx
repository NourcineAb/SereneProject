/**
 * Paywall — high-conversion Serene Pro upgrade screen.
 *
 * Design decisions:
 * - Opens as a bottom-sheet-style modal (full-screen on Android, native modal on iOS).
 * - Leads with outcome/emotion ("stress du quotidien") before listing features.
 * - Social-proof stat ("rejoignez 10 000+ utilisateurs").
 * - Clear "7-day free trial" CTA with legal copy beneath.
 * - Crisis safety: never shown mid-crisis (the chat screen gates it only after
 *   a successful exchange, not when paywall:true fires with a crisis keyword).
 */
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { purchaseSerenePro } from '../lib/purchases';
import { MONETIZATION } from '../lib/ads';
import { PillButton } from '../components/ui';
import { colors, radius, softGlow, spacing, type } from '../theme/serene';

const ADS_MODE = MONETIZATION === 'ads' || MONETIZATION === 'both';

type Perk = { icon: string; title: string; sub: string };
const PERKS: Perk[] = ADS_MODE
  ? [
      { icon: 'ban-outline', title: 'Zéro publicité', sub: 'Expérience entièrement sereine' },
      { icon: 'infinite-outline', title: 'Sessions illimitées', sub: 'Chattez sans compter' },
      { icon: 'fitness-outline', title: '20+ exercices guidés', sub: 'Respiration, scan corporel, ancrage' },
      { icon: 'bar-chart-outline', title: 'Rapport IA hebdomadaire', sub: "Tendances d'humeur personnalisées" },
    ]
  : [
      { icon: 'infinite-outline', title: 'Sessions illimitées', sub: 'Chattez chaque jour sans limite' },
      { icon: 'fitness-outline', title: '20+ exercices guidés', sub: 'Respiration, scan corporel, ancrage' },
      { icon: 'bar-chart-outline', title: 'Rapport IA hebdomadaire', sub: "Tendances d'humeur personnalisées" },
      { icon: 'notifications-outline', title: 'Rappels personnalisés', sub: 'Votre habitude bien-être au quotidien' },
    ];

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const btnScale = useRef(new Animated.Value(1)).current;

  const animatePress = (pressed: boolean) => {
    Animated.spring(btnScale, {
      toValue: pressed ? 0.96 : 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const startTrial = async () => {
    setBusy(true);
    try {
      await purchaseSerenePro();
      await refresh();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Close */}
      <Pressable
        onPress={() => router.back()}
        style={styles.close}
        accessibilityLabel="Fermer"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={20} color={colors.outline} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero */}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={34} color={colors.onPrimary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, textAlign: 'center', fontSize: 28 }]}>
            Libérez votre sérénité
          </Text>
          <Text style={[type.bodyLg, { color: colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 12 }]}>
            {ADS_MODE
              ? 'Profitez de Serene sans interruption, en toute profondeur.'
              : 'Devenez la meilleure version de vous-même, un jour à la fois.'}
          </Text>
          {/* Social proof */}
          <View style={styles.socialProof}>
            <Ionicons name="people" size={16} color={colors.secondary} />
            <Text style={[type.labelSm, { color: colors.secondary }]}>
              Rejoignez 10 000+ utilisateurs qui gèrent leur stress au quotidien
            </Text>
          </View>
        </View>

        {/* Price */}
        <View style={[styles.priceBox, softGlow]}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[type.displayLg, { color: colors.onPrimary, fontSize: 40 }]}>4,99 €</Text>
              <Text style={[type.bodyMd, { color: colors.onPrimaryContainer }]}>/mois</Text>
            </View>
            <Text style={[type.labelSm, { color: colors.onPrimaryContainer, marginTop: 4 }]}>
              Essai gratuit 7 jours — annulable à tout moment
            </Text>
          </View>
        </View>

        {/* Perks */}
        <View style={{ gap: 14, marginTop: 4 }}>
          {PERKS.map((p) => (
            <View key={p.title} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Ionicons name={p.icon as any} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.titleMd, { color: colors.onSurface, fontSize: 16 }]}>{p.title}</Text>
                <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, fontSize: 14 }]}>{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={{ gap: 10, marginTop: spacing.section }}>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <PillButton
              label={busy ? 'Chargement...' : "Commencer l'essai gratuit"}
              onPress={startTrial}
              loading={busy}
              accessibilityLabel="Demarrer l'essai gratuit de 7 jours"
            />
          </Animated.View>

          <Text style={[type.labelSm, { color: colors.outline, textAlign: 'center', lineHeight: 18 }]}>
            Sans engagement · Sans carte requise · Résiliable depuis l'App Store à tout moment
          </Text>
        </View>

        {/* Crisis safety footer */}
        <View style={styles.crisis}>
          <Ionicons name="heart" size={14} color={colors.secondary} />
          <Text style={[type.labelSm, { color: colors.secondary, flex: 1, lineHeight: 18 }]}>
            En cas de crise, Serene reste toujours disponible gratuitement. 3114 (FR) · 988 (US/Canada).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  close: {
    alignSelf: 'flex-end',
    margin: spacing.gutter,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.containerMobile,
    paddingBottom: spacing.section,
    gap: spacing.gutter,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondaryContainer,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  priceBox: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.md,
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginVertical: 4,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.base,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  perkIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crisis: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.base,
    padding: 12,
    marginTop: 4,
  },
});
