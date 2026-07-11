import { Component, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme/serene';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // In production, send to Sentry / crashlytics here.
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[type.headlineLg, { color: colors.error, marginTop: 12 }]}>
            Oups, une erreur est survenue
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }]}>
            {this.state.error?.message ?? "Quelque chose s'est mal passé."}
          </Text>
          <Text
            style={[type.bodyMd, { color: colors.secondary, marginTop: 20 }]}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            Réessayer
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerMobile,
  },
});
