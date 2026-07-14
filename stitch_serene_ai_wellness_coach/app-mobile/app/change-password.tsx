import { useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme-provider';
import { PillButton } from '../components/ui';

export default function ChangePassword() {
  const { theme: t } = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;

    if (score <= 1) return { score, label: 'Faible', color: t.colors.error };
    if (score <= 3) return { score, label: 'Moyen', color: t.colors.secondary };
    return { score, label: 'Fort', color: t.colors.primary };
  };

  const strength = passwordStrength(newPassword);

  const save = async () => {
    setError(null);
    setSuccess(false);

    if (!currentPassword) {
      setError('Veuillez saisir votre mot de passe actuel.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Le nouveau mot de passe doit être différent de l\'actuel.');
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setBusy(false);
    }
  };

  const strengthBarWidth = Math.max(1, (strength.score / 5) * 100);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={28} color={t.colors.primary} />
        </Pressable>
        <Text style={[t.type.headlineLg, { color: t.colors.primary }]}>
          Changer le mot de passe
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.fields}>
        <Text style={[t.type.labelSm, { color: t.colors.onSurfaceVariant, marginBottom: 6 }]}>
          Mot de passe actuel
        </Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { color: t.colors.onSurface, borderColor: t.colors.outlineVariant, backgroundColor: t.colors.surfaceContainerLowest }]}
            placeholder="Saisissez votre mot de passe actuel"
            placeholderTextColor={t.colors.outline}
            secureTextEntry={!showCurrent}
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <Pressable onPress={() => setShowCurrent(!showCurrent)} hitSlop={8} style={styles.eye}>
            <Ionicons
              name={showCurrent ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={t.colors.outline}
            />
          </Pressable>
        </View>

        <Text style={[t.type.labelSm, { color: t.colors.onSurfaceVariant, marginTop: 18, marginBottom: 6 }]}>
          Nouveau mot de passe
        </Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { color: t.colors.onSurface, borderColor: t.colors.outlineVariant, backgroundColor: t.colors.surfaceContainerLowest }]}
            placeholder="Minimum 8 caractères"
            placeholderTextColor={t.colors.outline}
            secureTextEntry={!showNew}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Pressable onPress={() => setShowNew(!showNew)} hitSlop={8} style={styles.eye}>
            <Ionicons
              name={showNew ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={t.colors.outline}
            />
          </Pressable>
        </View>

        {newPassword.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={[styles.strengthBar, { backgroundColor: t.colors.outlineVariant }]}>
              <View
                style={[
                  styles.strengthFill,
                  { width: `${strengthBarWidth}%` as any, backgroundColor: strength.color },
                ]}
              />
            </View>
            <Text style={[t.type.labelSm, { color: strength.color }]}>
              {strength.label}
            </Text>
          </View>
        )}

        <Text style={[t.type.labelSm, { color: t.colors.onSurfaceVariant, marginTop: 18, marginBottom: 6 }]}>
          Confirmer le mot de passe
        </Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { color: t.colors.onSurface, borderColor: t.colors.outlineVariant, backgroundColor: t.colors.surfaceContainerLowest }]}
            placeholder="Retapez le nouveau mot de passe"
            placeholderTextColor={t.colors.outline}
            secureTextEntry={!showConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8} style={styles.eye}>
            <Ionicons
              name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={t.colors.outline}
            />
          </Pressable>
        </View>
      </View>

      {error && (
        <View style={[styles.message, { backgroundColor: t.colors.errorContainer }]}>
          <Ionicons name="alert-circle-outline" size={18} color={t.colors.error} />
          <Text style={[t.type.bodyMd, { color: t.colors.onErrorContainer, flex: 1 }]}>
            {error}
          </Text>
        </View>
      )}

      {success && (
        <View style={[styles.message, { backgroundColor: t.colors.surfaceContainer }]}>
          <Ionicons name="checkmark-circle-outline" size={18} color={t.colors.primary} />
          <Text style={[t.type.bodyMd, { color: t.colors.primary, flex: 1 }]}>
            Mot de passe modifié avec succès.
          </Text>
        </View>
      )}

      <PillButton
        label="Enregistrer"
        onPress={save}
        loading={busy}
        style={{ marginTop: 28 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  fields: {},
  inputWrap: {
    position: 'relative',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 22,
    paddingRight: 48,
    fontSize: 16,
  },
  eye: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  strengthBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 3,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
});
