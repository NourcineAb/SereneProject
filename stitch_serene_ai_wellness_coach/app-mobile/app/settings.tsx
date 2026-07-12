import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useTheme, useType } from "../lib/theme-provider";
import { Card, PillButton } from "../components/ui";
import { radius, spacing } from "../theme/serene";

const KEYS = {
  PUSH_ENABLED: "serene.setting.push_enabled",
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, refresh } = useAuth();
  const { t, language } = useI18n();

  const LANGUAGES = [
    { code: 'fr' as const, label: 'Français', flag: '🇫🇷' },
    { code: 'en' as const, label: 'English', flag: '🇬🇧' },
    { code: 'ar' as const, label: 'العربية', flag: '🇸🇦' },
  ];
  const currentLang = LANGUAGES.find((l) => l.code === language);
  const { theme, isDark, toggleDarkMode, textSize, setTextSize: setThemeTextSize } = useTheme();
  const { colors } = theme;
  const type = useType();

  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const pe = await AsyncStorage.getItem(KEYS.PUSH_ENABLED);
        if (pe) setPushEnabled(pe === "true");
      } catch {
        // defaults
      }
    })();
  }, []);

  const togglePush = async (v: boolean) => {
    setPushEnabled(v);
    await AsyncStorage.setItem(KEYS.PUSH_ENABLED, String(v));
  };

  const cycleTextSize = async () => {
    const order: Array<'small' | 'medium' | 'large'> = ["small", "medium", "large"];
    const next = order[(order.indexOf(textSize) + 1) % order.length];
    await setThemeTextSize(next);
  };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await api.requestPasswordReset(user?.email ?? "");
      await refresh();
      setEditName(false);
    } catch {
      setEditName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 6) {
      Alert.alert(
        t("settings.errorTitle"),
        t("settings.errorPasswordShort"),
      );
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert(t("settings.errorTitle"), t("settings.errorPasswordMismatch"));
      return;
    }
    setSavingPw(true);
    try {
      await api.requestPasswordReset(user?.email ?? "");
      Alert.alert(
        t("settings.emailSent"),
        t("settings.emailSentMsg"),
      );
      setShowChangePassword(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      Alert.alert(
        t("settings.errorTitle"),
        e.message ?? t("settings.errorPasswordChange"),
      );
    } finally {
      setSavingPw(false);
    }
  };

  const escapeCsv = (val: string | number | null | undefined) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const [data, journalEntries] = await Promise.all([
        api.exportData(),
        api.journalList().catch(() => []),
      ]);

      const lines: string[] = [];
      const nl = "\r\n";

      // ── Profile section ──
      lines.push("=== PROFIL ===");
      lines.push("Nom,Email,Date de naissance");
      lines.push(
        [
          escapeCsv(data.profile.name),
          escapeCsv(data.profile.email),
          escapeCsv(data.profile.birth_date as string | undefined),
        ].join(","),
      );
      lines.push("");

      // ── Mood logs ──
      lines.push("=== HUMEURS ===");
      lines.push("ID,Score,Label,Note,Date");
      for (const m of data.mood_logs) {
        lines.push(
          [m.id, m.score, escapeCsv(m.label), escapeCsv(m.note), escapeCsv(m.created_at)].join(","),
        );
      }
      lines.push("");

      // ── Journal entries ──
      lines.push("=== JOURNAL ===");
      lines.push("ID,ScoreHumeur,Contenu,Technique,Date");
      for (const j of journalEntries) {
        lines.push(
          [j.id, j.mood_score, escapeCsv(j.content), escapeCsv(j.technique), escapeCsv(j.created_at)].join(","),
        );
      }
      lines.push("");

      // ── Sessions ──
      lines.push("=== SESSIONS COACHING ===");
      lines.push("ID,Titre,NombreMessages,Date");
      for (const s of data.sessions) {
        lines.push(
          [s.id, escapeCsv(s.title), s.messages.length, escapeCsv(s.created_at)].join(","),
        );
      }

      const csvContent = lines.join(nl);
      const now = new Date().toISOString().slice(0, 10);
      const filename = `serene_export_${now}.csv`;

      downloadBlob(csvContent, filename, "text/csv;charset=utf-8");

      const summary = t("settings.exportSummary", {
        name: data.profile.name,
        email: data.profile.email,
        sessions: String(data.sessions.length),
        moods: String(data.mood_logs.length),
      });
      Alert.alert(t("settings.exportTitle"), summary + "\n\nFichier : " + filename);
    } catch (e: any) {
      Alert.alert(t("settings.errorTitle"), e.message ?? t("settings.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteTitle"),
      t("settings.deleteMsg"),
      [
        { text: t("settings.deleteCancel"), style: "cancel" },
        {
          text: t("settings.deleteConfirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteAccount();
              await signOut();
              router.replace("/login");
            } catch (e: any) {
              Alert.alert(
                t("settings.errorTitle"),
                e.message ?? t("settings.deleteError"),
              );
            }
          },
        },
      ],
    );
  };

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
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t("settings.backLabel")}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary }]}>
          {t('settings.title')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Compte ─────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('settings.account')}</Text>

        <Card>
          {/* Name */}
          <View style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.name')}
            </Text>
            {editName ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TextInput
                  style={[
                    styles.inlineInput,
                    {
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: colors.primary,
                      color: colors.onSurface,
                      fontFamily: type.bodyMd.fontFamily,
                    },
                  ]}
                  value={nameValue}
                  onChangeText={setNameValue}
                  placeholderTextColor={colors.outline}
                />
                <Pressable
                  onPress={handleSaveName}
                  accessibilityLabel={t("settings.saveLabel")}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setEditName(false)}
                  accessibilityLabel={t("settings.cancelLabel")}
                >
                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={colors.outline}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditName(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
                  {user?.name}
                </Text>
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={colors.outline}
                />
              </Pressable>
            )}
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          {/* Email */}
          <View style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.email')}
            </Text>
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
              {user?.email}
            </Text>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          {/* Change password */}
          <Pressable
            onPress={() => setShowChangePassword(!showChangePassword)}
            style={styles.settingRow}
          >
            <Text style={[type.bodyMd, { color: colors.primary, flex: 1 }]}>
              {t('settings.changePassword')}
            </Text>
            <Ionicons
              name={showChangePassword ? "chevron-up" : "chevron-forward"}
              size={20}
              color={colors.primary}
            />
          </Pressable>

          {showChangePassword && (
            <View style={{ gap: 10, paddingTop: 12 }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                    fontFamily: type.bodyMd.fontFamily,
                  },
                ]}
                placeholder={t('settings.currentPassword')}
                placeholderTextColor={colors.outline}
                secureTextEntry
                value={currentPw}
                onChangeText={setCurrentPw}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                    fontFamily: type.bodyMd.fontFamily,
                  },
                ]}
                placeholder={t('settings.newPassword')}
                placeholderTextColor={colors.outline}
                secureTextEntry
                value={newPw}
                onChangeText={setNewPw}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                    fontFamily: type.bodyMd.fontFamily,
                  },
                ]}
                placeholder={t('settings.confirmPassword')}
                placeholderTextColor={colors.outline}
                secureTextEntry
                value={confirmPw}
                onChangeText={setConfirmPw}
              />
              <PillButton
                label={savingPw ? t('settings.sending') : t('settings.change')}
                onPress={handleChangePassword}
                loading={savingPw}
                variant="tonal"
              />
            </View>
          )}
        </Card>
      </View>

      {/* ── Notifications ──────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>
          {t('settings.notifications')}
        </Text>
        <Card>
          <View style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.pushNotifications')}
            </Text>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{
                true: colors.primaryFixed,
                false: colors.surfaceContainerHigh,
              }}
              thumbColor={pushEnabled ? colors.primary : colors.outline}
            />
          </View>
        </Card>
      </View>

      {/* ── Langue ─────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('language.title')}</Text>
        <Card>
          <Pressable
            onPress={() => router.push("/language" as any)}
            style={styles.settingRow}
          >
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('language.title')}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
                {currentLang?.flag} {currentLang?.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </View>
          </Pressable>
        </Card>
      </View>

      {/* ── Apparence ─────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('settings.appearance')}</Text>
        <Card>
          <View style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.darkMode')}
            </Text>
            <Switch
              value={isDark}
              onValueChange={() => toggleDarkMode()}
              trackColor={{
                true: colors.primaryFixed,
                false: colors.surfaceContainerHigh,
              }}
              thumbColor={isDark ? colors.primary : colors.outline}
            />
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          <Pressable onPress={cycleTextSize} style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.textSize')}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
                {textSize === "small"
                  ? t('settings.small')
                  : textSize === "medium"
                    ? t('settings.medium')
                    : t('settings.large')}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.outline}
              />
            </View>
          </Pressable>
        </Card>
      </View>

      {/* ── A propos ──────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>
          {t('settings.about')}
        </Text>
        <Card>
          <View style={styles.settingRow}>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>
              {t('settings.version')}
            </Text>
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
              1.0.0
            </Text>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          <Pressable
            onPress={() => router.push("/help" as any)}
            style={styles.settingRow}
          >
            <Ionicons
              name="help-circle-outline"
              size={22}
              color={colors.onSurface}
            />
            <Text
              style={[
                type.bodyMd,
                { color: colors.onSurface, flex: 1, marginLeft: 10 },
              ]}
            >
              {t('settings.help')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.outline} />
          </Pressable>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          <Pressable
            onPress={() => {
              Alert.alert(
                t("settings.supportTitle"),
                t("settings.supportContactMsg"),
                [{ text: t("settings.supportOk") }],
              );
            }}
            style={styles.settingRow}
          >
            <Ionicons name="mail-outline" size={22} color={colors.onSurface} />
            <Text
              style={[
                type.bodyMd,
                { color: colors.onSurface, flex: 1, marginLeft: 10 },
              ]}
            >
              {t('settings.support')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.outline} />
          </Pressable>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          />

          <View style={{ paddingVertical: 4 }}>
            <Text
              style={[type.labelSm, { color: colors.outline, lineHeight: 18 }]}
            >
              {t('settings.disclaimer')}
            </Text>
          </View>
        </Card>
      </View>

      {/* Logout */}
      <PillButton
        label={t('settings.logout')}
        variant="outline"
        onPress={() => {
          signOut();
          router.replace("/login");
        }}
      />

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 18,
    fontSize: 15,
  },
  inlineInput: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    width: 140,
  },
});
