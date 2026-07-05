import { useState } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { PillButton } from '../components/ui';
import { colors, radius, spacing, type } from '../theme/serene';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await signUp(email.trim(), password, name.trim() || 'Friend');
      else await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.brand}>
        <Ionicons name="leaf" size={36} color={colors.primary} />
        <Text style={[type.displayLg, { color: colors.primary }]}>Serene</Text>
      </View>
      <Text style={[type.headlineLg, { color: colors.primary, marginBottom: 4 }]}>
        {mode === 'register' ? 'Bienvenue' : 'Bon retour'}
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, marginBottom: spacing.section }]}>
        Votre refuge contre le stress du quotidien.
      </Text>

      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Votre prénom"
          placeholderTextColor={colors.outline}
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.outline}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor={colors.outline}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={{ color: colors.error, marginBottom: 12 }}>{error}</Text>}

      <PillButton
        label={mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
        onPress={submit}
        loading={busy}
        style={{ marginTop: 8 }}
      />
      <Text
        onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
        style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 20 }]}
        accessibilityRole="button"
        accessibilityLabel={mode === 'register' ? 'Déjà un compte ? Se connecter' : 'Nouveau ? Créer un compte'}
      >
        {mode === 'register' ? 'Déjà un compte ? Se connecter' : 'Nouveau ? Créer un compte'}
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.containerMobile,
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.section },
  input: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 22,
    marginBottom: 14,
    color: colors.onSurface,
    fontFamily: type.bodyMd.fontFamily,
    fontSize: 16,
  },
});
