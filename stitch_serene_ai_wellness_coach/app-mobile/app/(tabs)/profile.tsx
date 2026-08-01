import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useColors, useType } from '../../lib/theme-provider';
import { Card, PillButton } from '../../components/ui';
import { radius, spacing } from '../../theme/serene';

export default function Profile() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api.exportData();
      const summary = t("settings.exportSummary", {
        name: data.profile.name,
        email: data.profile.email,
        sessions: String(data.sessions.length),
        moods: String(data.mood_logs.length),
      });
      Alert.alert(t("settings.exportTitle"), summary);
    } catch (e: any) {
      Alert.alert(t("settings.errorTitle"), e.message ?? t("settings.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t("settings.deleteTitle"),
      t("settings.deleteMsg"),
      [
        { text: t("settings.deleteCancel"), style: 'cancel' },
        {
          text: t("settings.deleteConfirm"),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount();
              await signOut();
              router.replace('/login');
            } catch (e: any) {
              Alert.alert(t("settings.errorTitle"), e.message ?? t("settings.deleteError"));
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View />
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityLabel={t('profile.settings')}
          accessibilityRole="button"
          style={[styles.settingsBtn, { backgroundColor: colors.surfaceContainerLow }]}
        >
          <Ionicons name="settings-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={[styles.avatar, { backgroundColor: colors.primaryFixed }]}>
          <Ionicons name="person" size={40} color={colors.primary} />
        </View>
        <Text style={[type.headlineLg, { color: colors.primary }]}>{user?.name}</Text>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>{user?.email}</Text>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ionicons name={user?.is_premium ? 'star' : 'star-outline'} size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>
            {user?.is_premium ? t('profile.pro') : t('profile.plan')}
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
            {user?.is_premium ? t('profile.unlimited') : t('profile.sessionsWeek')}
          </Text>
        </View>
        {!user?.is_premium && <PillButton label={t('profile.upgrade')} variant="tonal" onPress={() => router.push('/paywall')} />}
      </Card>

      {/* RGPD section */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('profile.gdpr')}</Text>
        <PillButton
          label={exporting ? t('profile.exporting') : t('profile.export')}
          variant="outline"
          onPress={handleExport}
          loading={exporting}
        />
        <PillButton label={t('profile.delete')} variant="outline" onPress={handleDelete} />
      </View>

      {/* More / navigation hub */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>Naviguer</Text>
        <Card style={{ gap: 4 }}>
          {[
            { label: t('profile.settings') ?? 'Paramètres', icon: 'settings-outline', href: '/settings' },
            { label: 'Langue', icon: 'language-outline', href: '/language' },
            { label: 'Notifications', icon: 'notifications-outline', href: '/notifications-prefs' },
            { label: 'Communauté', icon: 'people-outline', href: '/community' },
            { label: 'Défis', icon: 'trophy-outline', href: '/challenges' },
            { label: 'Badges', icon: 'medal-outline', href: '/badges' },
            { label: 'Calendrier', icon: 'calendar-outline', href: '/calendar' },
            { label: 'Aide', icon: 'help-circle-outline', href: '/help' },
            { label: 'Mentions légales', icon: 'document-text-outline', href: '/legal' },
          ].map((item, i, arr) => (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as any)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={[
                styles.menuRow,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
              ]}
            >
              <Ionicons name={item.icon as any} size={22} color={colors.primary} />
              <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1, marginLeft: 12 }]}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </Pressable>
          ))}
        </Card>
      </View>

      <PillButton label={t('profile.logout')} variant="outline" onPress={() => { signOut(); router.replace('/login'); }} />

      <Text style={[type.labelSm, { color: colors.outline, textAlign: 'center', lineHeight: 18 }]}>
        {t('profile.disclaimer')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
});
