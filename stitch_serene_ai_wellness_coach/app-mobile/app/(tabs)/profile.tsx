import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { Card, PillButton } from '../../components/ui';
import { colors, radius, spacing, type } from '../../theme/serene';

export default function Profile() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
    >
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={colors.primary} />
        </View>
        <Text style={[type.headlineLg, { color: colors.primary }]}>{user?.name}</Text>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>{user?.email}</Text>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ionicons name={user?.is_premium ? 'star' : 'star-outline'} size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>
            {user?.is_premium ? 'Serene Pro' : 'Plan gratuit'}
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
            {user?.is_premium ? 'Sessions illimitées' : '3 sessions / semaine'}
          </Text>
        </View>
        {!user?.is_premium && <PillButton label="Upgrade" variant="tonal" onPress={() => router.push('/paywall')} />}
      </Card>

      <PillButton label="Se déconnecter" variant="outline" onPress={signOut} />

      <Text style={[type.labelSm, { color: colors.outline, textAlign: 'center', lineHeight: 18 }]}>
        Serene n'est pas un dispositif médical et ne remplace pas un professionnel de santé.{'\n'}
        En cas de crise : 3114 (FR) · 988 (US).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
