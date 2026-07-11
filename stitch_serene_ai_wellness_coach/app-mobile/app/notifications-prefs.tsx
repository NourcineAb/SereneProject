import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { useI18n } from '../lib/i18n';
import { radius, spacing } from '../theme/serene';

const KEYS = {
  WEEKLY_REPORT: 'serene.notif.weekly_report',
  NEW_EXERCISE: 'serene.notif.new_exercise',
  QUIET_HOURS: 'serene.notif.quiet_hours',
  QUIET_START: 'serene.notif.quiet_start',
  QUIET_END: 'serene.notif.quiet_end',
};

export default function NotificationPrefsScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [weeklyReport, setWeeklyReport] = useState(true);
  const [newExercise, setNewExercise] = useState(false);
  const [quietHours, setQuietHours] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);

  useEffect(() => {
    (async () => {
      try {
        const entries = await AsyncStorage.multiGet([
          KEYS.WEEKLY_REPORT,
          KEYS.NEW_EXERCISE,
          KEYS.QUIET_HOURS,
          KEYS.QUIET_START,
          KEYS.QUIET_END,
        ]);
        const map = Object.fromEntries(entries.filter((e): e is [string, string] => e[1] !== null));
        if (map[KEYS.WEEKLY_REPORT] !== undefined) setWeeklyReport(map[KEYS.WEEKLY_REPORT] === 'true');
        if (map[KEYS.NEW_EXERCISE] !== undefined) setNewExercise(map[KEYS.NEW_EXERCISE] === 'true');
        if (map[KEYS.QUIET_HOURS] !== undefined) setQuietHours(map[KEYS.QUIET_HOURS] === 'true');
        if (map[KEYS.QUIET_START]) setQuietStart(parseInt(map[KEYS.QUIET_START], 10));
        if (map[KEYS.QUIET_END]) setQuietEnd(parseInt(map[KEYS.QUIET_END], 10));
      } catch {
        // defaults
      }
    })();
  }, []);

  const update = async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  };

  const toggleWeekly = async (v: boolean) => {
    setWeeklyReport(v);
    await update(KEYS.WEEKLY_REPORT, String(v));
  };

  const toggleExercise = async (v: boolean) => {
    setNewExercise(v);
    await update(KEYS.NEW_EXERCISE, String(v));
  };

  const toggleQuiet = async (v: boolean) => {
    setQuietHours(v);
    await update(KEYS.QUIET_HOURS, String(v));
  };

  const setQuietS = async (h: number) => {
    setQuietStart(h);
    await update(KEYS.QUIET_START, String(h));
  };

  const setQuietE = async (h: number) => {
    setQuietEnd(h);
    await update(KEYS.QUIET_END, String(h));
  };

  const QUIET_HOURS = [20, 21, 22, 23];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.containerMobile,
        paddingTop: insets.top + 16,
        gap: spacing.section,
      }}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel={t('misc.back')} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary }]}>{t('notifications.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Other notifications */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('notifications.other')}</Text>
        <Card>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyMd, { color: colors.onSurface }]}>{t('notifications.weeklyReport')}</Text>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
                {t('notifications.weeklyReportSub')}
              </Text>
            </View>
            <Switch
              value={weeklyReport}
              onValueChange={toggleWeekly}
              trackColor={{ true: colors.primaryFixed, false: colors.surfaceContainerHigh }}
              thumbColor={weeklyReport ? colors.primary : colors.outline}
            />
          </View>

          <View style={[styles.preview, { backgroundColor: colors.surfaceContainerLow }]}>
            <Ionicons name="document-text-outline" size={16} color={colors.outline} />
            <Text style={[type.labelSm, { color: colors.outline, flex: 1, lineHeight: 18 }]}>
              {weeklyReport ? t('notifications.weeklyPreviewOn') : t('notifications.weeklyPreviewOff')}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.surfaceContainerHigh }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyMd, { color: colors.onSurface }]}>{t('notifications.newExercises')}</Text>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
                {t('notifications.newExercisesSub')}
              </Text>
            </View>
            <Switch
              value={newExercise}
              onValueChange={toggleExercise}
              trackColor={{ true: colors.primaryFixed, false: colors.surfaceContainerHigh }}
              thumbColor={newExercise ? colors.primary : colors.outline}
            />
          </View>

          <View style={[styles.preview, { backgroundColor: colors.surfaceContainerLow }]}>
            <Ionicons name="fitness-outline" size={16} color={colors.outline} />
            <Text style={[type.labelSm, { color: colors.outline, flex: 1, lineHeight: 18 }]}>
              {newExercise ? t('notifications.exercisePreviewOn') : t('notifications.exercisePreviewOff')}
            </Text>
          </View>
        </Card>
      </View>

      {/* Quiet hours */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('notifications.quietLabel')}</Text>
        <Card>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyMd, { color: colors.onSurface }]}>{t('notifications.quietHours')}</Text>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
                {t('notifications.quietHoursSub')}
              </Text>
            </View>
            <Switch
              value={quietHours}
              onValueChange={toggleQuiet}
              trackColor={{ true: colors.primaryFixed, false: colors.surfaceContainerHigh }}
              thumbColor={quietHours ? colors.primary : colors.outline}
            />
          </View>

          {quietHours && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.surfaceContainerHigh }]} />
              <View style={styles.settingRow}>
                <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>{t('notifications.start')}</Text>
              </View>
              <View style={styles.hourRow}>
                {QUIET_HOURS.map((h) => (
                  <Pressable
                    key={`s-${h}`}
                    onPress={() => setQuietS(h)}
                    style={[
                      styles.hourBtn,
                      quietStart === h ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceContainerLow },
                    ]}
                    accessibilityLabel={`${h}h`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: quietStart === h }}
                  >
                    <Text
                      style={[
                        type.labelSm,
                        { color: quietStart === h ? colors.onPrimary : colors.onSurface },
                      ]}
                    >
                      {h}h
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.settingRow}>
                <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>{t('notifications.end')}</Text>
              </View>
              <View style={styles.hourRow}>
                {[6, 7, 8, 9, 10].map((h) => (
                  <Pressable
                    key={`e-${h}`}
                    onPress={() => setQuietE(h)}
                    style={[
                      styles.hourBtn,
                      quietEnd === h ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceContainerLow },
                    ]}
                    accessibilityLabel={`${h}h`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: quietEnd === h }}
                  >
                    <Text
                      style={[
                        type.labelSm,
                        { color: quietEnd === h ? colors.onPrimary : colors.onSurface },
                      ]}
                    >
                      {h}h
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Card>
      </View>

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  hourRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  hourBtn: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    borderRadius: radius.base,
    padding: 10,
  },
});
