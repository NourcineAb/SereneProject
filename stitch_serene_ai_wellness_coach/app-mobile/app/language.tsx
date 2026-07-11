import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../lib/i18n';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

const LANGUAGES = [
  { code: 'fr' as const, label: 'Français', flag: '🇫🇷', native: 'Français' },
  { code: 'en' as const, label: 'English', flag: '🇬🇧', native: 'English' },
  { code: 'ar' as const, label: 'العربية', flag: '🇸🇦', native: 'العربية' },
];

export default function LanguageScreen() {
  const colors = useColors();
  const type = useType();
  const { language, setLanguage, t } = useI18n();
  const [currentLang, setCurrentLang] = useState(language);

  const handleSelect = async (code: 'fr' | 'en' | 'ar') => {
    await setLanguage(code);
    setCurrentLang(code);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel={t('misc.back')}
          accessibilityRole="button"
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainerLow }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary }]}>{t('language.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.options}>
        {LANGUAGES.map((lang) => {
          const selected = currentLang === lang.code;
          return (
            <Pressable
              key={lang.code}
              onPress={() => handleSelect(lang.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.option,
                selected
                  ? { borderColor: colors.primary, backgroundColor: colors.surfaceContainerLow }
                  : { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant },
                pressed && styles.optionPressed,
              ]}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    type.titleMd,
                    { color: selected ? colors.primary : colors.onSurface },
                  ]}
                >
                  {lang.native}
                </Text>
                {lang.code !== language && (
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                    {lang.label}
                  </Text>
                )}
              </View>
              {selected && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.section }]}>
        {t('language.restartNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.containerMobile,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.section,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    gap: 14,
  },
  optionPressed: {
    opacity: 0.7,
  },
  flag: {
    fontSize: 28,
  },
});
