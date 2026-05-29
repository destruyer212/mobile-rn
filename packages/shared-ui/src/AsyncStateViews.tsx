import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppColors } from './colors';

export type LoadingBlockProps = {
  message?: string;
  /** compact = inline row; full = centered block */
  variant?: 'compact' | 'full';
};

/** Indicador de carga reutilizable (rúbrica: retroalimentación visual). */
export function LoadingBlock({ message = 'Cargando datos...', variant = 'full' }: LoadingBlockProps) {
  if (variant === 'compact') {
    return (
      <View style={styles.compactRow}>
        <ActivityIndicator color={AppColors.accent} />
        <Text style={styles.compactText}>{message}</Text>
      </View>
    );
  }
  return (
    <View style={styles.full}>
      <ActivityIndicator size="large" color={AppColors.accent} />
      <Text style={styles.fullText}>{message}</Text>
    </View>
  );
}

export type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

/** Mensaje de error visible para el usuario. */
export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message.trim()) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>No se pudieron cargar los datos</Text>
      <Text style={styles.errorBody}>{message}</Text>
    </View>
  );
}

export type EmptyStateProps = {
  title: string;
  description?: string;
};

/** Estado vacío cuando la API respondió sin registros. */
export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDesc}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  fullText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  compactText: { color: '#374151', fontSize: 13 },
  errorBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: { color: '#991B1B', fontWeight: '700', fontSize: 13 },
  errorBody: { marginTop: 4, color: '#B91C1C', fontSize: 12 },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyTitle: { color: '#374151', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  emptyDesc: { marginTop: 6, color: '#6B7280', fontSize: 12, textAlign: 'center' },
});
