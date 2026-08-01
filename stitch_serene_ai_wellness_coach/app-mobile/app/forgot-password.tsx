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
import { api } from '../lib/api';
import { PillButton } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

type Step = 'request' | 'reset';

export default function ForgotPassword() {
  const colors = useColors();
  const type = useType();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRequest = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.requestPasswordReset(email.trim());
      setSuccess('Si cet email est inscrit, vous recevrez un lien de réinitialisation.');
      setStep('reset');
    } catch (e: any) {
      setError(e.message ?? 'Une erreur est survenue');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.resetPassword(token.trim(), newPassword);
      setSuccess('Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.');
      setTimeout(() => router.replace('/login'), 2000);
    } catch (e: any) {
      setError(e.message ?? 'Une erreur est survenue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScreenHeader title="Mot de passe oublié" />

      <View style={styles.brand}>
        <Ionicons name="leaf" size={36} color={colors.primary} />
        <Text style={[type.displayLg, { color: colors.primary }]}>Serene</Text>
      </View>

      <Text style={[type.headlineLg, { color: colors.primary, marginBottom: 4 }]}>
        {step === 'request' ? 'Mot de passe oublié' : 'Nouveau mot de passe'}
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, marginBottom: spacing.section }]}>
        {step === 'request'
          ? 'Entrez votre email pour recevoir un lien de réinitialisation.'
          : 'Entrez le token reçu par email et votre nouveau mot de passe.'}
      </Text>

      {step === 'request' ? (
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }]}
          placeholder="Email"
          placeholderTextColor={colors.outline}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      ) : (
        <>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }]}
            placeholder="Token de réinitialisation"
            placeholderTextColor={colors.outline}
            autoCapitalize="none"
            value={token}
            onChangeText={setToken}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }]}
            placeholder="Nouveau mot de passe"
            placeholderTextColor={colors.outline}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
        </>
      )}

      {error && <Text style={{ color: colors.error, marginBottom: 12 }}>{error}</Text>}
      {success && <Text style={{ color: colors.primary, marginBottom: 12 }}>{success}</Text>}

      <PillButton
        label={step === 'request' ? 'Envoyer le lien' : 'Réinitialiser'}
        onPress={step === 'request' ? handleRequest : handleReset}
        loading={busy}
        style={{ marginTop: 8 }}
      />

      <Text
        onPress={() => router.back()}
        style={[type.bodyMd, { color: colors.secondary, textAlign: 'center', marginTop: 20 }]}
        accessibilityRole="button"
      >
        Retour à la connexion
      </Text>
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
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
  },
});
