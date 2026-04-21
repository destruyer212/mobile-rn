import * as Linking from 'expo-linking';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { showWorkerDisconnectedNotification } from '../../core/services/localNotificationService';
import { LocationRepository } from '../../data/locationRepository';
import { WorkerAdminRepository } from '../../data/workerAdminRepository';
import type { OperationalBase } from '../../domain/operationalBase';
import { useWorkerLocations } from '../../hooks/useWorkerLocations';
import { AppColors } from '../../theme/colors';
import { formatTimeHms } from '../../utils/format';
import { displayWorkerName, isWorkerOnline } from '../../utils/workerUi';

const repo = new LocationRepository();
const workerAdminRepo = new WorkerAdminRepository();

const DEFAULT_REGION = {
  latitude: -12.0464,
  longitude: -77.0428,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

type Props = {
  username: string;
  focusWorkerId: string | null;
  onConsumedFocus: () => void;
};

export function AdminOperationsTab({ username: _username, focusWorkerId, onConsumedFocus }: Props) {
  const isFocused = useIsFocused();
  const { height } = useWindowDimensions();
  const mapHeight = Math.round(height * 0.48);
  const mapRef = useRef<MapView | null>(null);
  const lastOnlineByWorkerId = useRef<Record<string, boolean>>({});

  const { workers, error, refresh } = useWorkerLocations(true);
  const [firstNameById, setFirstNameById] = useState<Record<string, string>>({});
  const [phoneById, setPhoneById] = useState<Record<string, string>>({});
  const [operationalBase, setOperationalBase] = useState<OperationalBase | null>(null);
  const [registeredWorkersCount, setRegisteredWorkersCount] = useState<number | null>(null);
  const [basePanelOpen, setBasePanelOpen] = useState(false);
  const [baseName, setBaseName] = useState('Base operativa');
  const [baseEnabled, setBaseEnabled] = useState(false);
  const [baseRadiusText, setBaseRadiusText] = useState('150');
  const [baseCenter, setBaseCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [baseSaving, setBaseSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const b = await repo.fetchOperationalBase();
        setOperationalBase(b);
        if (b) {
          setBaseName(b.name);
          setBaseEnabled(b.enabled);
          setBaseRadiusText(String(Math.round(b.radiusMeters || 150)));
          if (b.latitude != null && b.longitude != null) {
            setBaseCenter({ latitude: b.latitude, longitude: b.longitude });
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await workerAdminRepo.listWorkers();
        setRegisteredWorkersCount(list.length);
      } catch {
        setRegisteredWorkersCount(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (workers.length === 0) return;
    const missingIds = workers.map((w) => w.userId).filter((id) => id && !firstNameById[id]);
    if (missingIds.length === 0) return;
    void (async () => {
      try {
        const names = await repo.fetchProfileFirstNamesByUserIds(Array.from(new Set(missingIds)));
        setFirstNameById((prev) => ({ ...prev, ...names }));
      } catch {
        /* ignore */
      }
    })();
  }, [workers, firstNameById]);

  useEffect(() => {
    if (workers.length === 0) return;
    const missingIds = workers.map((w) => w.userId).filter((id) => id && !phoneById[id]);
    if (missingIds.length === 0) return;
    void (async () => {
      try {
        const phones = await repo.fetchProfilePhonesByUserIds(Array.from(new Set(missingIds)));
        setPhoneById((prev) => ({ ...prev, ...phones }));
      } catch {
        /* ignore */
      }
    })();
  }, [workers, phoneById]);

  useEffect(() => {
    const currentIds = new Set(workers.map((w) => w.userId));
    for (const worker of workers) {
      const onlineNow = isWorkerOnline(worker);
      const previous = lastOnlineByWorkerId.current[worker.userId];
      if (previous === true && !onlineNow) {
        const workerLabel = displayWorkerName(worker, firstNameById);
        void showWorkerDisconnectedNotification(workerLabel);
      }
      lastOnlineByWorkerId.current[worker.userId] = onlineNow;
    }
    for (const key of Object.keys(lastOnlineByWorkerId.current)) {
      if (!currentIds.has(key)) {
        delete lastOnlineByWorkerId.current[key];
      }
    }
  }, [workers, firstNameById]);

  useEffect(() => {
    const coords = workers
      .map((w) => ({ latitude: w.latitude, longitude: w.longitude }))
      .filter((c) => isValidCoordinate(c.latitude, c.longitude));
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [workers]);

  useEffect(() => {
    if (!focusWorkerId) return;
    const w = workers.find((x) => x.userId === focusWorkerId);
    if (!w) return;
    if (!isValidCoordinate(w.latitude, w.longitude)) return;
    mapRef.current?.animateToRegion(
      {
        latitude: w.latitude,
        longitude: w.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      450,
    );
    onConsumedFocus();
  }, [focusWorkerId, workers, onConsumedFocus]);

  const dial = useCallback(async (userId: string) => {
    const raw = phoneById[userId]?.trim() ?? '';
    if (!raw) return;
    const url = `tel:${raw}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  }, [phoneById]);

  const onlineCount = workers.filter(isWorkerOnline).length;
  const trackingCount = workers.filter((w) => w.isTracking).length;
  const staleCount = workers.filter((w) => !isWorkerOnline(w)).length;

  const previewCenter = baseCenter;
  const previewRadius = Number(baseRadiusText) > 0 ? Number(baseRadiusText) : 150;

  async function saveBase() {
    setBaseSaving(true);
    try {
      await repo.upsertOperationalBase({
        name: baseName.trim() || 'Base operativa',
        enabled: baseEnabled,
        latitude: previewCenter?.latitude ?? null,
        longitude: previewCenter?.longitude ?? null,
        radiusMeters: previewRadius,
      });
      const b = await repo.fetchOperationalBase();
      setOperationalBase(b);
      setBasePanelOpen(false);
    } finally {
      setBaseSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.mapWrap, { height: mapHeight }]} collapsable={false}>
        {isFocused ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            {...(Platform.OS === 'android' ? { googleRenderer: 'LEGACY' as const } : {})}
            initialRegion={DEFAULT_REGION}
            loadingEnabled
            loadingBackgroundColor="#E5E7EB"
            onMapReady={() => {
              const coords = workers
                .map((w) => ({ latitude: w.latitude, longitude: w.longitude }))
                .filter((c) => isValidCoordinate(c.latitude, c.longitude));
              if (coords.length === 0) return;
              mapRef.current?.fitToCoordinates(coords, {
                edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
                animated: false,
              });
            }}
            onLongPress={(e) => {
              const c = e.nativeEvent.coordinate;
              setBaseCenter({ latitude: c.latitude, longitude: c.longitude });
            }}
          >
            {(basePanelOpen
              ? baseEnabled && previewCenter != null && previewRadius > 0
              : operationalBase?.enabled &&
                operationalBase.latitude != null &&
                operationalBase.longitude != null &&
                operationalBase.radiusMeters > 0) ? (
              <Circle
                center={
                  basePanelOpen
                    ? {
                        latitude: previewCenter?.latitude ?? DEFAULT_REGION.latitude,
                        longitude: previewCenter?.longitude ?? DEFAULT_REGION.longitude,
                      }
                    : {
                        latitude: operationalBase?.latitude ?? DEFAULT_REGION.latitude,
                        longitude: operationalBase?.longitude ?? DEFAULT_REGION.longitude,
                      }
                }
                radius={basePanelOpen ? previewRadius : operationalBase?.radiusMeters ?? 150}
                strokeColor="rgba(0, 194, 168, 0.85)"
                fillColor="rgba(0, 194, 168, 0.12)"
              />
            ) : null}
            {workers
              .filter((w) => isValidCoordinate(w.latitude, w.longitude))
              .map((w) => {
                const online = isWorkerOnline(w);
                return (
                  <Marker
                    key={w.userId}
                    coordinate={{ latitude: w.latitude, longitude: w.longitude }}
                    title={displayWorkerName(w, firstNameById)}
                    description={online ? 'En linea' : 'Sin senal en vivo'}
                    pinColor={online ? '#0F9D58' : '#9E9E9E'}
                  />
                );
              })}
          </MapView>
        ) : (
          <View style={[styles.map, { backgroundColor: '#E5E7EB' }]} />
        )}
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <View style={styles.kpiChip}>
            <Text style={styles.kpiLabel}>En linea</Text>
            <Text style={styles.kpiValue}>{onlineCount}</Text>
          </View>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiLabel}>Tracking ON</Text>
            <Text style={styles.kpiValue}>{trackingCount}</Text>
          </View>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiLabel}>Sin senal</Text>
            <Text style={styles.kpiValue}>{staleCount}</Text>
          </View>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiLabel}>Registrados</Text>
            <Text style={styles.kpiValue}>
              {registeredWorkersCount == null ? '--' : String(registeredWorkersCount)}
            </Text>
          </View>
        </View>
        <View style={styles.mapHintWrap} pointerEvents="box-none">
          <Text style={styles.mapHintText}>Mantener pulsado para definir centro de base operativa</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionTag}>
          <Text style={styles.sectionTagText}>Monitoreo en tiempo real</Text>
        </View>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Operaciones en vivo</Text>
            <Text style={styles.panelSub}>Vista operativa de cuadrillas y estado de conexion.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setBasePanelOpen((v) => !v)} style={styles.refresh}>
              <Text style={styles.refreshText}>{basePanelOpen ? 'Cerrar base' : 'Editar base'}</Text>
            </Pressable>
            <Pressable onPress={() => void refresh()} style={styles.refresh}>
              <Text style={styles.refreshText}>Actualizar</Text>
            </Pressable>
          </View>
        </View>
        {basePanelOpen ? (
          <View style={styles.basePanel}>
            <Text style={styles.baseTitle}>Base operativa</Text>
            <TextInput
              value={baseName}
              onChangeText={setBaseName}
              placeholder="Nombre de base"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <View style={styles.baseRow}>
              <Text style={styles.baseLabel}>Activa</Text>
              <Switch value={baseEnabled} onValueChange={setBaseEnabled} />
            </View>
            <TextInput
              value={baseRadiusText}
              onChangeText={setBaseRadiusText}
              keyboardType="numeric"
              placeholder="Radio (metros)"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Text style={styles.baseHint}>
              Mantener pulsado en el mapa para mover el centro de la base.
            </Text>
            <Pressable
              onPress={() => void saveBase()}
              style={[styles.saveBtn, baseSaving && styles.saveBtnDisabled]}
              disabled={baseSaving}
            >
              <Text style={styles.saveBtnText}>
                {baseSaving ? 'Guardando...' : 'Guardar base'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <FlatList
          data={workers}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Aun no hay ubicaciones reportadas.</Text>}
          renderItem={({ item }) => {
            const online = isWorkerOnline(item);
            const name = displayWorkerName(item, firstNameById);
            const phone = phoneById[item.userId]?.trim() ?? '';
            return (
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: online ? AppColors.accent : '#9CA3AF' }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={styles.meta}>
                    {online ? 'En linea' : 'Sin senal en vivo'} · {formatTimeHms(item.updatedAt)}
                  </Text>
                  {phone ? (
                    <Pressable onPress={() => void dial(item.userId)}>
                      <Text style={styles.phone}>{phone}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={[styles.badge, { backgroundColor: online ? '#E7F8EE' : '#F1F3F5' }]}>
                  <Text style={[styles.badgeText, { color: online ? '#0F9D58' : '#6B7280' }]}>{online ? 'ON' : 'OFF'}</Text>
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  mapWrap: { width: '100%', backgroundColor: '#E5E7EB', overflow: 'hidden' },
  map: { ...StyleSheet.absoluteFillObject },
  mapOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  kpiChip: {
    flex: 1,
    backgroundColor: 'rgba(10,22,40,0.86)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  kpiLabel: { color: 'rgba(232,236,242,0.75)', fontSize: 10, fontWeight: '700' },
  kpiValue: { color: '#fff', marginTop: 2, fontSize: 14, fontWeight: '900' },
  mapHintWrap: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  mapHintText: {
    backgroundColor: 'rgba(10,22,40,0.72)',
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  panel: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,194,168,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  sectionTagText: {
    color: AppColors.navy,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 16, fontWeight: '900', color: AppColors.navy },
  panelSub: { marginTop: 2, color: '#6B7280', fontSize: 12, lineHeight: 16 },
  refresh: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 12 },
  refreshText: { fontWeight: '800', color: AppColors.navy },
  basePanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
  },
  baseTitle: { fontSize: 14, fontWeight: '900', color: AppColors.navy, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#111827',
    marginBottom: 8,
  },
  baseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  baseLabel: { color: '#111827', fontWeight: '800', fontSize: 13 },
  baseHint: { marginTop: 8, color: '#6B7280', fontSize: 12 },
  saveBtn: {
    marginTop: 10,
    backgroundColor: AppColors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: AppColors.navy, fontWeight: '900' },
  err: { color: '#B91C1C', marginBottom: 8, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: AppColors.accent, marginTop: 4 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '900', color: '#111827' },
  meta: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  phone: { marginTop: 6, fontSize: 13, fontWeight: '800', color: '#2563EB' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontWeight: '900', fontSize: 11 },
  empty: {
    marginTop: 16,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
