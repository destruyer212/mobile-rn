import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { ensureAndroidTrackingSurvivalPrerequisites } from '../core/permissions/trackingSurvivalHelper';
import { AppColors } from '../theme/colors';
import { isForegroundTimerRunning } from '../services/trackingService';
import { BACKGROUND_LOCATION_TASK } from '../tasks/backgroundLocationTask';

export function WorkerDiagnosticsScreen() {
  const [loading, setLoading] = useState(true);
  const [gps, setGps] = useState('...');
  const [fg, setFg] = useState('...');
  const [bg, setBg] = useState('...');
  const [bgTask, setBgTask] = useState('...');
  const [last, setLast] = useState('--');
  const [coords, setCoords] = useState('--');

  function permissionLabel(status: Location.PermissionStatus): string {
    if (status === Location.PermissionStatus.GRANTED) return 'Concedido';
    if (status === Location.PermissionStatus.DENIED) return 'Denegado';
    if (status === Location.PermissionStatus.UNDETERMINED) return 'No determinado';
    return status;
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const gpsEnabled = await Location.hasServicesEnabledAsync();
      const fgPerm = await Location.getForegroundPermissionsAsync();
      let bgPerm = fgPerm;
      try {
        bgPerm = await Location.getBackgroundPermissionsAsync();
      } catch {
        // API no disponible en algunas plataformas / versiones
        bgPerm = fgPerm;
      }
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      const timer = isForegroundTimerRunning();
      let pos = '--';
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        pos = `${current.coords.latitude.toFixed(6)}, ${current.coords.longitude.toFixed(6)}`;
      } catch {
        pos = '--';
      }

      setGps(gpsEnabled ? 'Activo' : 'Apagado');
      setFg(permissionLabel(fgPerm.status));
      setBg(permissionLabel(bgPerm.status));
      setBgTask(started ? 'Activo (tarea)' : timer ? 'Activo (primer plano)' : 'Detenido');
      setCoords(pos);
      setLast(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Estado del sistema</Text>
          <Pressable onPress={() => void refresh()} style={styles.refresh} disabled={loading}>
            {loading ? <ActivityIndicator /> : <Text style={styles.refreshText}>Actualizar</Text>}
          </Pressable>
        </View>
        <Text style={styles.line}>
          <Text style={styles.k}>Servicio GPS: </Text>
          {gps}
        </Text>
        <Text style={styles.line}>
          <Text style={styles.k}>Permiso en uso: </Text>
          {fg}
        </Text>
        <Text style={styles.line}>
          <Text style={styles.k}>Permiso segundo plano: </Text>
          {bg}
        </Text>
        <Text style={styles.line}>
          <Text style={styles.k}>Seguimiento: </Text>
          {bgTask}
        </Text>
        <Text style={styles.line}>
          <Text style={styles.k}>Ultimas coordenadas: </Text>
          {coords}
        </Text>
        <Text style={styles.muted}>Ultima lectura: {last}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => void ensureAndroidTrackingSurvivalPrerequisites()}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Supervivencia Android</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openSettings()} style={styles.actionBtnGhost}>
            <Text style={styles.actionBtnGhostText}>Abrir ajustes</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>
        En Android, el seguimiento estable requiere excluir la app del ahorro de bateria y conceder ubicacion "Siempre" cuando el sistema lo solicite.
        {Platform.OS !== 'android' ? ' En esta plataforma, algunos checks no aplican.' : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: AppColors.surface },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: AppColors.navy },
  refresh: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 12 },
  refreshText: { fontWeight: '700', color: AppColors.navy },
  line: { marginTop: 8, fontSize: 14, color: '#111827' },
  k: { fontWeight: '700', color: '#374151' },
  muted: { marginTop: 12, fontSize: 12, color: '#6B7280' },
  actions: { marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: {
    backgroundColor: 'rgba(0,194,168,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionBtnText: { color: AppColors.navy, fontWeight: '800', fontSize: 12 },
  actionBtnGhost: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  actionBtnGhostText: { color: '#374151', fontWeight: '700', fontSize: 12 },
  hint: { marginTop: 16, fontSize: 13, color: '#4B5563', lineHeight: 18 },
});
