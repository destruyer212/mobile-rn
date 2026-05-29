import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UPDATE_INTERVAL_SECONDS } from '@fleet/shared-config';
import { ensureLocationPermissionExplained } from '@fleet/shared-core';
import { ensureAndroidTrackingSurvivalPrerequisites } from '@fleet/shared-core';
import {
  notifyAdminsWorkerEvent,
  notifyAdminsWorkerStationary,
} from '@fleet/shared-core';
import { LocationRepository } from '@fleet/shared-data';
import { canUseSupabaseAuth } from '@fleet/shared-lib';
import type { WorkerStackParamList } from '../navigation/types';
import { getPendingTrackingQueueCount, startTracking, stopTracking } from '@fleet/shared-services';
import { isTrackingDesired, setTrackingDesired } from '@fleet/shared-services';
import { BACKGROUND_LOCATION_TASK } from '@fleet/shared-tracking-worker';
import { AppColors, ErrorBanner, LoadingBlock } from '@fleet/shared-ui';

type Props = NativeStackScreenProps<WorkerStackParamList, 'WorkerHome'>;

const repo = new LocationRepository();

export function WorkerHomeScreen({ navigation, route }: Props) {
  const { userId, username } = route.params;

  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastLat, setLastLat] = useState<number | null>(null);
  const [lastLng, setLastLng] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [backgroundActive, setBackgroundActive] = useState(false);
  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [serverSyncLoading, setServerSyncLoading] = useState(false);
  const [serverSyncError, setServerSyncError] = useState<string | null>(null);
  const appOpenNotifiedThisSession = useRef(false);
  const lastAppOpenPushUtc = useRef<Date | null>(null);
  const stationaryAnchor = useRef<{ lat: number; lng: number } | null>(null);
  const stationarySince = useRef<Date | null>(null);
  const stationaryNotified = useRef(false);

  const showInfo = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  const refreshBackgroundStatus = useCallback(async () => {
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setBackgroundActive(started);
      const bgPerm = await Location.getBackgroundPermissionsAsync();
      setBackgroundPermissionGranted(bgPerm.status === Location.PermissionStatus.GRANTED);
      const queued = await getPendingTrackingQueueCount();
      setPendingQueueCount(queued);
    } catch {
      setBackgroundActive(false);
    }
  }, []);

  const workerLabel = username.split('@')[0]?.trim() || 'Trabajador';

  const trySendAppOpenPush = useCallback(async (isResume: boolean) => {
    if (!canUseSupabaseAuth()) return;
    if (isResume) {
      const last = lastAppOpenPushUtc.current;
      if (last && Date.now() - last.getTime() < 12 * 60 * 1000) return;
    } else if (appOpenNotifiedThisSession.current) {
      return;
    }
    const outcome = await notifyAdminsWorkerEvent({
      workerName: workerLabel,
      event: 'app_open',
    });
    if (outcome === 'success') {
      appOpenNotifiedThisSession.current = true;
      lastAppOpenPushUtc.current = new Date();
    }
  }, [workerLabel]);

  /** Consumo API (Supabase): leer última ubicación reportada del trabajador en servidor. */
  useEffect(() => {
    if (!canUseSupabaseAuth()) return;
    let cancelled = false;
    void (async () => {
      setServerSyncLoading(true);
      setServerSyncError(null);
      try {
        const list = await repo.fetchWorkerLocations();
        const me = list.find((w) => w.userId === userId);
        if (cancelled) return;
        if (me) {
          setLastLat(me.latitude);
          setLastLng(me.longitude);
          setLastSentAt(me.updatedAt);
        }
      } catch (e) {
        if (!cancelled) setServerSyncError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setServerSyncLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    void (async () => {
      await trySendAppOpenPush(false);
      const desired = await isTrackingDesired(userId);
      await refreshBackgroundStatus();
      if (!desired) return;
      const allowed = await ensureLocationPermissionExplained({
        requireBackground: true,
      });
      if (!allowed) {
        showInfo('Activa ubicacion en segundo plano para continuar con seguimiento aun cerrando la app.');
        return;
      }
      const r = await startTracking({ userId, email: username });
      if (r.ok) {
        setTrackingEnabled(true);
        await refreshBackgroundStatus();
      }
    })();
  }, [userId, username, trySendAppOpenPush, showInfo, refreshBackgroundStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshBackgroundStatus();
    }, 12000);
    return () => clearInterval(timer);
  }, [refreshBackgroundStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void trySendAppOpenPush(true);
        void refreshBackgroundStatus();
      }
    });
    return () => sub.remove();
  }, [trySendAppOpenPush, refreshBackgroundStatus]);

  async function onToggle(value: boolean) {
    setStatusMessage(null);
    if (value) {
      const allowed = await ensureLocationPermissionExplained({
        requireBackground: true,
      });
      if (!allowed) {
        showInfo('Sin permiso de ubicacion no podemos compartir tu posicion.');
        return;
      }
      await ensureAndroidTrackingSurvivalPrerequisites();
      const r = await startTracking({ userId, email: username });
      if (!r.ok) {
        showInfo(r.message ?? 'No se pudo iniciar seguimiento.');
        setTrackingEnabled(false);
        setBackgroundActive(false);
        return;
      }
      setTrackingEnabled(true);
      await refreshBackgroundStatus();
      const outcome = await notifyAdminsWorkerEvent({
        workerName: workerLabel,
        event: 'tracking_on',
      });
      if (outcome === 'noAdminTokens') {
        showInfo('Seguimiento activo. Aun no hay dispositivo admin registrado para notificaciones.');
      } else if (outcome === 'fcmAllFailed') {
        showInfo('Seguimiento activo. El envio push a admins fallo, pero GPS sigue activo.');
      }
      showInfo(
        `Seguimiento activo. Segundo plano activo con notificacion del sistema.`,
      );
      return;
    }

    await stopTracking(userId);
    await notifyAdminsWorkerEvent({
      workerName: workerLabel,
      event: 'disconnect',
    });
    setTrackingEnabled(false);
    setBackgroundActive(false);
    setPendingQueueCount(0);
    showInfo('Seguimiento detenido.');
  }

  async function sendNow() {
    if (sending) return;
    if (!canUseSupabaseAuth()) {
      showInfo('Supabase no configurado.');
      return;
    }

    setSending(true);
    setStatusMessage(null);
    try {
      const allowed = await ensureLocationPermissionExplained({
        requireBackground: trackingEnabled,
      });
      if (!allowed) {
        showInfo('Permiso de ubicacion requerido.');
        return;
      }
      const serviceEnabled = await Location.hasServicesEnabledAsync();
      if (!serviceEnabled) {
        showInfo('Activa el GPS del telefono para enviar ubicacion.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await repo.upsertMyLocation({
        userId,
        email: username,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        isTracking: true,
      });
      setLastLat(position.coords.latitude);
      setLastLng(position.coords.longitude);
      setLastSentAt(new Date());

      const prev = stationaryAnchor.current;
      if (!prev) {
        stationaryAnchor.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        stationarySince.current = new Date();
        stationaryNotified.current = false;
      } else {
        const dLat = position.coords.latitude - prev.lat;
        const dLng = position.coords.longitude - prev.lng;
        const metersApprox = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
        if (metersApprox <= 50) {
          if (!stationarySince.current) stationarySince.current = new Date();
          const elapsed = Date.now() - stationarySince.current.getTime();
          if (!stationaryNotified.current && elapsed >= 20 * 60 * 1000) {
            stationaryNotified.current = true;
            await notifyAdminsWorkerStationary(workerLabel);
          }
        } else {
          stationaryAnchor.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          stationarySince.current = new Date();
          stationaryNotified.current = false;
        }
      }
    } catch {
      const queued = await getPendingTrackingQueueCount();
      setPendingQueueCount(queued);
      if (queued > 0) {
        showInfo(
          `Sin internet. Guardamos ${queued} punto(s) localmente y se reenviaran automatico al reconectar.`,
        );
      } else {
        showInfo('Error al enviar ubicacion. Intenta nuevamente.');
      }
    } finally {
      setSending(false);
    }
  }

  const lat = lastLat?.toFixed(6) ?? '--';
  const lng = lastLng?.toFixed(6) ?? '--';
  const sentAt = lastSentAt?.toLocaleString() ?? '--';
  const syncState = trackingEnabled ? (sending ? 'Enviando' : 'Activo') : 'Inactivo';

  return (
    <View style={styles.root}>
      <LinearGradient colors={[AppColors.navy, AppColors.navyLight, '#0D47A1']} style={styles.hero}>
        <Text style={styles.heroTitle}>Mi ubicacion</Text>
        <View style={styles.heroRow}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconEmoji}>📍</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
            <Text style={styles.sub}>Modo campo · comparte solo cuando actives seguimiento</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seguimiento en tiempo real</Text>
          <Text style={styles.cardHint}>Tu posicion se envia al administrador de forma segura.</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Estado: {syncState}</Text>
          </View>
          <View style={[styles.statusPill, { marginTop: 8, backgroundColor: backgroundActive ? '#DCFCE7' : '#FEF3C7' }]}>
            <Text style={[styles.statusPillText, { color: backgroundActive ? '#166534' : '#92400E' }]}>
              {backgroundActive
                ? 'Segundo plano activo (notificacion persistente encendida)'
                : 'Segundo plano no activo'}
            </Text>
          </View>
          {!backgroundPermissionGranted ? (
            <Text style={styles.permissionWarn}>
              Falta permiso de ubicacion en segundo plano. Te lo pediremos al activar seguimiento.
            </Text>
          ) : null}
          {pendingQueueCount > 0 ? (
            <Text style={styles.offlineQueueInfo}>
              Reconexion pendiente: {pendingQueueCount} punto(s) en cola local.
            </Text>
          ) : null}

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>{trackingEnabled ? 'Activo' : 'Inactivo'}</Text>
              <Text style={styles.switchSub}>
                {trackingEnabled
                  ? `Enviando ubicacion cada ${UPDATE_INTERVAL_SECONDS} s`
                  : 'No se comparte ubicacion'}
              </Text>
            </View>
            <Switch value={trackingEnabled} onValueChange={(v) => void onToggle(v)} trackColor={{ false: '#ccc', true: 'rgba(0,194,168,0.45)' }} thumbColor={trackingEnabled ? AppColors.accent : '#f4f3f4'} />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (!trackingEnabled || sending) && styles.primaryBtnDisabled]}
            disabled={!trackingEnabled || sending}
            onPress={() => void sendNow()}
            activeOpacity={0.9}
          >
            {sending ? <ActivityIndicator color={AppColors.navy} /> : <Text style={styles.primaryBtnText}>Enviar ubicacion ahora</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('WorkerDiagnostics')} activeOpacity={0.85}>
            <Text style={styles.linkText}>Diagnostico</Text>
          </TouchableOpacity>
          <Text style={styles.linkSub}>Usalo si Android bloquea GPS en segundo plano.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitleSmall}>Ultima posicion (servidor)</Text>
          {serverSyncLoading ? (
            <LoadingBlock message="Consultando ubicacion en Supabase..." variant="compact" />
          ) : null}
          {serverSyncError ? <ErrorBanner message={serverSyncError} /> : null}
          <InfoRow label="Latitud" value={lat} />
          <InfoRow label="Longitud" value={lng} />
          <InfoRow label="Ultimo envio" value={sentAt} />
          {!serverSyncLoading && !serverSyncError && lastLat == null ? (
            <Text style={styles.hintEmpty}>Aun no hay ubicacion guardada en el servidor.</Text>
          ) : null}
          {statusMessage ? <Text style={styles.err}>{statusMessage}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  hero: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 22 },
  heroTitle: { color: AppColors.onDark, fontSize: 22, fontWeight: '800' },
  heroRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0,194,168,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 22 },
  heroText: { flex: 1, minWidth: 0 },
  username: { color: AppColors.onDark, fontSize: 18, fontWeight: '800' },
  sub: { marginTop: 4, color: 'rgba(232,236,242,0.75)', fontSize: 12 },
  body: { padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: '900', color: AppColors.navy },
  cardTitleSmall: { fontSize: 15, fontWeight: '900', color: AppColors.navy, marginBottom: 10 },
  cardHint: { marginTop: 8, color: '#4B5563', fontSize: 13, lineHeight: 18 },
  statusPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E8F7F4',
  },
  statusPillText: { color: '#0F766E', fontSize: 12, fontWeight: '800' },
  switchRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1 },
  switchTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  switchSub: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: AppColors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: AppColors.navy, fontWeight: '900', fontSize: 15 },
  linkBtn: { marginTop: 12, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 8 },
  linkText: { color: AppColors.accentDeep, fontWeight: '800' },
  linkSub: { marginTop: 2, alignSelf: 'flex-end', color: '#6B7280', fontSize: 11 },
  infoRow: { marginTop: 10 },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.3, textTransform: 'uppercase' },
  infoValue: { marginTop: 4, fontSize: 14, fontWeight: '800', color: AppColors.navy },
  err: { marginTop: 12, color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  hintEmpty: { marginTop: 8, color: '#6B7280', fontSize: 12, fontStyle: 'italic' },
  permissionWarn: { marginTop: 8, color: '#92400E', fontSize: 12, fontWeight: '700' },
  offlineQueueInfo: { marginTop: 8, color: '#1D4ED8', fontSize: 12, fontWeight: '700' },
});

