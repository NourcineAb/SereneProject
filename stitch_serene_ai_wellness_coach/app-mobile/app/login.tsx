import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useColors, useType } from '../lib/theme-provider';
import { useI18n } from '../lib/i18n';
import { PillButton } from '../components/ui';
import { radius, spacing } from '../theme/serene';
import { isAppleAvailable, signInWithApple, useGoogleAuth } from '../lib/social-auth';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const colors = useColors();
  const type = useType();
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appleEnabled, setAppleEnabled] = useState(false);
  const { requestReady: googleReady, promptAsync: googleSignIn } = useGoogleAuth();
  const [socialBusy, setSocialBusy] = useState(false);

  useEffect(() => {
    isAppleAvailable().then(setAppleEnabled);
  }, []);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await signUp(email.trim(), password, name.trim() || 'Friend');
      else await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const handleAppleLogin = async () => {
    setError(null);
    setSocialBusy(true);
    try {
      const result = await signInWithApple();
      if (result) router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? t('error.generic'));
    } finally {
      setSocialBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSocialBusy(true);
    try {
      const result = await googleSignIn();
      if (result) router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? t('error.generic'));
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.brand}>
        <Ionicons name="leaf" size={36} color={colors.primary} />
        <Text style={[type.displayLg, { color: colors.primary }]}>Serene</Text>
      </View>
      <Text style={[type.headlineLg, { color: colors.primary, marginBottom: 4 }]}>
        {mode === 'register' ? t('auth.welcome') : t('auth.welcomeBack')}
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, marginBottom: spacing.section }]}>
        {t('auth.subtitle')}
      </Text>

      {mode === 'register' && (
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface, fontFamily: type.bodyMd.fontFamily }]}
          placeholder={t('auth.firstName')}
          placeholderTextColor={colors.outline}
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface, fontFamily: type.bodyMd.fontFamily }]}
        placeholder={t('auth.email')}
        placeholderTextColor={colors.outline}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface, fontFamily: type.bodyMd.fontFamily }]}
        placeholder={t('auth.password')}
        placeholderTextColor={colors.outline}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={{ color: colors.error, marginBottom: 12 }}>{error}</Text>}

      <PillButton
        label={mode === 'register' ? t('auth.createAccount') : t('auth.signIn')}
        onPress={submit}
        loading={busy}
        style={{ marginTop: 8 }}
      />
      <Text
        onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
        style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 20 }]}
        accessibilityRole="button"
        accessibilityLabel={mode === 'register' ? t('auth.hasAccount') : t('auth.noAccount')}
      >
        {mode === 'register' ? t('auth.hasAccount') : t('auth.noAccount')}
      </Text>

      {mode === 'login' && (
        <Text
          onPress={() => router.push('/forgot-password')}
          style={[type.bodyMd, { color: colors.outline, textAlign: 'center', marginTop: 12 }]}
          accessibilityRole="button"
        >
          {t('auth.forgotPassword')}
        </Text>
      )}

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.outlineVariant }]} />
        <Text style={[type.bodyMd, { color: colors.outline }]}>{t('auth.orContinueWith')}</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.outlineVariant }]} />
      </View>

      {appleEnabled && (
        <Pressable
          onPress={handleAppleLogin}
          disabled={socialBusy}
          accessibilityRole="button"
          accessibilityLabel={t('auth.appleSignIn')}
          style={({ pressed }) => [
            styles.socialBtn,
            styles.appleBtn,
            pressed && { opacity: 0.7 },
            socialBusy && { opacity: 0.5 },
          ]}
        >
          <Ionicons name="logo-apple" size={22} color="#000000" />
          <Text style={[styles.appleBtnText, { fontFamily: type.titleMd.fontFamily }]}>{t('auth.appleSignIn')}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={handleGoogleLogin}
        disabled={socialBusy || !googleReady}
        accessibilityRole="button"
        accessibilityLabel={t('auth.googleSignIn')}
        style={({ pressed }) => [
          styles.socialBtn,
          { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1.5, borderColor: colors.outlineVariant },
          pressed && { opacity: 0.7 },
          socialBusy && { opacity: 0.5 },
        ]}
      >
        <Ionicons name="logo-google" size={22} color="#4285F4" />
        <Text style={[styles.googleBtnText, { color: colors.onSurface, fontFamily: type.titleMd.fontFamily }]}>{t('auth.googleSignIn')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.containerMobile,
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.section },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 22,
    marginBottom: 14,
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginBottom: 12,
    gap: 12,
  },
  appleBtn: {
    backgroundColor: '#000000',
  },
  appleBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  googleBtnText: {
    fontSize: 16,
  },
});
