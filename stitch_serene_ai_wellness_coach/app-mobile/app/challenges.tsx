import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ChallengeData,
  UserChallengeData,
  getChallenges,
  getMyChallenges,
  joinChallenge,
  updateChallengeProgress,
} from '../lib/community';
import { Card, PillButton } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';
import { api } from '../lib/api';

const CHALLENGE_ICONS: Record<number, string> = {
  1: 'flame-outline',
  2: 'heart-outline',
  3: 'compass-outline',
  4: 'trophy-outline',
  5: 'rocket-outline',
};

const CHALLENGE_COLORS: Record<number, string> = {
  1: '#e76f51',
  2: '#2a9d8f',
  3: '#264653',
  4: '#e9c46a',
  5: '#f4a261',
};

function getIcon(challengeId: number): string {
  return CHALLENGE_ICONS[challengeId] ?? 'star-outline';
}

function getColor(challengeId: number, colors: any): string {
  return CHALLENGE_COLORS[challengeId] ?? colors.primary;
}

export default function ChallengesScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [myChallenges, setMyChallenges] = useState<UserChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ch, my] = await Promise.all([getChallenges(), getMyChallenges()]);
      setChallenges(ch);
      setMyChallenges(my);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const myChallengeIds = new Set(myChallenges.map((uc) => uc.challenge_id));

  const handleJoin = async (challengeId: number) => {
    setJoiningId(challengeId);
    try {
      await joinChallenge(challengeId);
      await loadData();
    } catch {
      Alert.alert(t('settings.errorTitle'), t('error.joinChallenge'));
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeave = async (challengeId: number) => {
    try {
      await api.communityLeaveChallenge(challengeId);
      await loadData();
    } catch {
      Alert.alert(t('settings.errorTitle'), 'Impossible de quitter le défi.');
    }
  };

  const handleProgress = async (challengeId: number) => {
    try {
      await updateChallengeProgress(challengeId);
      await loadData();
    } catch {
      /* ignore */
    }
  };

  const myChallengesWithProgress = myChallenges.filter((uc) => !uc.completed && uc.challenge);

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
        <Text style={[type.headlineLg, { color: colors.primary }]}>Defis</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Defis disponibles */}
      <View style={{ gap: 12 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>Defis disponibles</Text>
        {challenges.map((ch) => {
          const joined = myChallengeIds.has(ch.id);
          const uc = myChallenges.find((u) => u.challenge_id === ch.id && !u.completed);
          const progress = uc
            ? ch.target_sessions > 0
              ? uc.current_sessions / ch.target_sessions
              : 0
            : 0;
          const color = getColor(ch.id, colors);

          return (
            <Card key={ch.id} style={{ gap: 12 }}>
              <View style={styles.challengeHeader}>
                <View style={[styles.challengeIcon, { backgroundColor: color + '20' }]}>
                  <Ionicons
                    name={getIcon(ch.id) as any}
                    size={24}
                    color={color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.titleMd, { color: colors.onSurface }]}>{ch.title}</Text>
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                    {ch.duration_days} jours
                    {ch.target_sessions > 0 ? ` \u00b7 ${ch.target_sessions} sessions` : ''}
                    {ch.target_streak > 0 ? ` \u00b7 ${ch.target_streak} jours de serie` : ''}
                  </Text>
                </View>
                {joined && uc && (
                  <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                    <Text style={[type.labelSm, { color }]}>En cours</Text>
                  </View>
                )}
              </View>
              <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, lineHeight: 22 }]}>
                {ch.description}
              </Text>
              {joined && uc && (
                <View style={{ gap: 6 }}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainer }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(progress * 100, 100)}%`,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                    {uc.current_sessions}/{ch.target_sessions} sessions
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <PillButton
                      label="Progresser"
                      variant="tonal"
                      onPress={() => handleProgress(ch.id)}
                      style={{ flex: 1 }}
                    />
                    <PillButton
                      label="Quitter"
                      variant="outline"
                      onPress={() => handleLeave(ch.id)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              )}
              {!joined && (
                <PillButton
                  label={joiningId === ch.id ? '...' : 'Rejoindre'}
                  variant="tonal"
                  disabled={joiningId === ch.id}
                  onPress={() => handleJoin(ch.id)}
                  style={{ alignSelf: 'flex-start' }}
                />
              )}
            </Card>
          );
        })}
        {challenges.length === 0 && !loading && (
          <Card>
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              Aucun defi disponible pour le moment.
            </Text>
          </Card>
        )}
      </View>

      {/* Mes defis */}
      {myChallengesWithProgress.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>Mes defis</Text>
          {myChallengesWithProgress.map((uc) => {
            const ch = uc.challenge!;
            const progress =
              ch.target_sessions > 0 ? uc.current_sessions / ch.target_sessions : 0;
            const color = getColor(ch.id, colors);
            return (
              <Card key={uc.id} style={{ gap: 10 }}>
                <View style={styles.challengeHeader}>
                  <View style={[styles.challengeIcon, { backgroundColor: color + '20' }]}>
                    <Ionicons name={getIcon(ch.id) as any} size={20} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.titleMd, { color: colors.onSurface }]}>{ch.title}</Text>
                    <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                      {uc.current_sessions}/{ch.target_sessions} sessions
                    </Text>
                  </View>
                  {progress >= 1 && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainer }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(progress * 100, 100)}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Completed challenges */}
      {myChallenges.filter((uc) => uc.completed).length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>Defis completes</Text>
          {myChallenges
            .filter((uc) => uc.completed)
            .map((uc) => {
              const ch = uc.challenge;
              const color = ch ? getColor(ch.id, colors) : colors.primary;
              return (
                <Card key={uc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surfaceContainerLow }}>
                  <Ionicons name="trophy" size={24} color={color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.titleMd, { color: colors.onSurface }]}>
                      {ch?.title ?? 'Defi'}
                    </Text>
                    <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                      Termine ! Bravo.
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                </Card>
              );
            })}
        </View>
      )}

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  challengeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.full,
  },
});
