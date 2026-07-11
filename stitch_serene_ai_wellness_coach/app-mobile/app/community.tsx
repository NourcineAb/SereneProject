import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getChallenges, ChallengeData } from '../lib/community';
import { Card, PillButton } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

const MOCK_STATS = {
  active_users: 12847,
  total_sessions: 98234,
  shared_calm_hours: 15672,
};

export default function CommunityScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      getChallenges()
        .then((ch) => {
          if (active) setChallenges(ch);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const isPremium = user?.is_premium ?? false;

  if (!isPremium && !loading) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.containerMobile,
          paddingTop: insets.top + 16,
          gap: spacing.section,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
        }}
      >
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={[styles.paywallIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="lock-closed" size={32} color={colors.primary} />
          </View>
          <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
            {t('community.paywallTitle')}
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            {t('community.paywallDesc')}
          </Text>
          <PillButton label={t('community.discoverPro')} onPress={() => router.push('/paywall')} />
          <Text
            onPress={() => router.back()}
            style={[type.bodyMd, { color: colors.outline, textAlign: 'center' }]}
          >
            {t('misc.back')}
          </Text>
        </View>
      </ScrollView>
    );
  }

  const topChallenges = [...challenges]
    .sort((a, b) => b.participant_count - a.participant_count)
    .slice(0, 3);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.containerMobile,
        paddingTop: insets.top + 16,
        gap: spacing.section,
      }}
    >
      <View style={styles.headerRow}>
        <Ionicons
          name="chevron-back"
          size={28}
          color={colors.primary}
          onPress={() => router.back()}
        />
        <Text style={[type.headlineLg, { color: colors.primary }]}>{t('community.title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Statistiques mondiales */}
      <Card style={{ gap: 14 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>{t('community.worldStats')}</Text>
        <View style={styles.statRow}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="people" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMd, { color: colors.onSurface }]}>
              {t('community.activeUsers', { count: MOCK_STATS.active_users.toLocaleString() })}
            </Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={[styles.statIcon, { backgroundColor: colors.secondaryContainer }]}>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMd, { color: colors.onSurface }]}>
              {t('community.totalSessions', { count: MOCK_STATS.total_sessions.toLocaleString() })}
            </Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="leaf" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMd, { color: colors.onSurface }]}>
              {t('community.calmHours', { count: MOCK_STATS.shared_calm_hours.toLocaleString() })}
            </Text>
          </View>
        </View>
      </Card>

      {/* Defis populaires */}
      {topChallenges.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>{t('community.popularChallenges')}</Text>
          {topChallenges.map((ch) => (
            <Card key={ch.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.challengeDot, { backgroundColor: colors.primaryFixed }]}>
                <Ionicons name="trophy" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.titleMd, { color: colors.onSurface }]}>{ch.title}</Text>
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                  {t('community.participants', { count: String(ch.participant_count) })}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Inspirations */}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={[type.titleMd, { color: colors.primary }]}>{t('community.inspirations')}</Text>
        </View>
        <View style={[styles.quoteCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.primaryFixedDim} />
          <Text
            style={[
              type.bodyLg,
              { color: colors.onSurface, fontStyle: 'italic', lineHeight: 28 },
            ]}
          >
            {getQuoteOfTheDay()}
          </Text>
        </View>
      </Card>

      {/* Vers les defis */}
      <View style={{ gap: 12 }}>
        <PillButton
          label={t('community.viewAll')}
          variant="tonal"
          onPress={() => router.push('/challenges')}
        />
      </View>

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

function getQuoteOfTheDay(): string {
  const QUOTES = [
    "La paix vient de l'interieur. Ne la cherchez pas a l'exterieur.",
    "Chaque respiration est une nouvelle chance de commencer.",
    "Le bien-etre n'est pas une destination, c'est un voyage.",
    "Prenez soin de votre esprit, il est votre refuge.",
    "La serenite est la beaute de l'ame.",
    "Ne vous comparez pas aux autres. Comparez-vous a la personne que vous etiez hier.",
    "La meditation n'est pas d'eviter la realite, mais de l'embrasser.",
    "Votre corps est votre temple. Gardez-le pur et il sera leSiege de votre ame.",
    "Le silence est un ami qui ne trahit jamais.",
    "La joie est dans l'homme, pas dans les circonstances.",
  ];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paywallIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeDot: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteCard: {
    borderRadius: radius.md,
    padding: 20,
    gap: 12,
  },
});
