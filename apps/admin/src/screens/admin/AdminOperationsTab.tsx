import * as Linking from 'expo-linking';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { can } from '@fleet/shared-auth';
import type { UserRole } from '@fleet/shared-auth';
import { showWorkerDisconnectedNotification } from '@fleet/shared-core';
import { LocationRepository } from '@fleet/shared-data';
import type { WorkerRoutePoint } from '@fleet/shared-data';
import { WorkerAdminRepository } from '@fleet/shared-data';
import type { ManagedWorker } from '@fleet/shared-domain';
import { managedWorkerDisplayName } from '@fleet/shared-domain';
import type { OperationalBase } from '@fleet/shared-domain';
import type { WorkerLocation } from '@fleet/shared-domain';
import { useWorkerLocations } from '@fleet/shared-hooks';
import { AppColors } from '@fleet/shared-ui';
import { formatTimeHms } from '@fleet/shared-ui';
import { displayWorkerName, isWorkerOnline } from '@fleet/shared-ui';

const repo = new LocationRepository();
const workerAdminRepo = new WorkerAdminRepository();

const DEFAULT_REGION = {
  latitude: -12.0464,
  longitude: -77.0428,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function isValidCoordinate(lat: number, lng: number) {
  const isFiniteCoord =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!isFiniteCoord) return false;
  // Backend can deliver null coords that become (0,0). Treat that point as invalid for fleet map.
  const isZeroIsland = Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001;
  return !isZeroIsland;
}

/**
 * Pin con `image` (sin children): en Android un Marker con hijos `View` a menudo queda en blanco con
 * `tracksViewChanges={false}`. Los PNG en `assets` se dibujan en la ruta nativa de Google Maps.
 * Nombre: segundo Marker con solo texto, ligeramente al norte del punto.
 */
const MOTO_MARKER_ON = require('../../../assets/moto-marker-on.png');
const MOTO_MARKER_OFF = require('../../../assets/moto-marker-off.png');

/** Desplazamiento hacia el norte (grados) para el chip de nombre encima de la moto. */
const MOTO_NAME_LABEL_D_LAT = 0.00014;

type MotoMapVisual = 'on' | 'off' | 'trackOff' | 'critical';

function motoMapVisualForWorker(w: WorkerLocation): MotoMapVisual {
  const ageMs = Date.now() - w.updatedAt.getTime();
  const critical = ageMs > 30 * 60 * 1000;
  const online = isWorkerOnline(w);
  if (critical) return 'critical';
  if (!w.isTracking) return 'trackOff';
  if (!online) return 'off';
  return 'on';
}

function motoMarkerImageForVisual(v: MotoMapVisual) {
  return v === 'on' ? MOTO_MARKER_ON : MOTO_MARKER_OFF;
}

type Props = {
  username: string;
  role: UserRole;
  focusWorkerId: string | null;
  onConsumedFocus: () => void;
};

type OperationsFilter = 'all' | 'online' | 'tracking' | 'critical' | 'followed';

export function AdminOperationsTab({ username: _username, role, focusWorkerId, onConsumedFocus }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const mapHeightAnim = useRef(new Animated.Value(Math.round(height * 0.8))).current;
  const kpiChipWidth = Math.max(64, Math.floor((width - 42) / 4));
  const mapRef = useRef<MapView | null>(null);
  const lastOnlineByWorkerId = useRef<Record<string, boolean>>({});
  const previousKpiRef = useRef({
    online: 0,
    tracking: 0,
    stale: 0,
    registered: 0,
  });
  const crosshairAnim = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const { workers, error, refresh } = useWorkerLocations(true);
  const [lastKnownLocationByWorkerId, setLastKnownLocationByWorkerId] = useState<Record<string, WorkerLocation>>({});
  const [firstNameById, setFirstNameById] = useState<Record<string, string>>({});
  const [phoneById, setPhoneById] = useState<Record<string, string>>({});
  const [operationalBase, setOperationalBase] = useState<OperationalBase | null>(null);
  const [registeredWorkers, setRegisteredWorkers] = useState<ManagedWorker[]>([]);
  const [basePanelOpen, setBasePanelOpen] = useState(false);
  const [baseName, setBaseName] = useState('Base operativa');
  const [baseEnabled, setBaseEnabled] = useState(false);
  const [baseRadiusText, setBaseRadiusText] = useState('150');
  const [baseCenter, setBaseCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [baseSaving, setBaseSaving] = useState(false);
  const [selectingBaseCenter, setSelectingBaseCenter] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
  const [followWorkerId, setFollowWorkerId] = useState<string | null>(null);
  const [operationsFilter, setOperationsFilter] = useState<OperationsFilter>('all');
  const [replayWorkerId, setReplayWorkerId] = useState<string | null>(null);
  const [replayPoints, setReplayPoints] = useState<WorkerRoutePoint[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayRunning, setReplayRunning] = useState(false);

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
        setRegisteredWorkers(list);
      } catch {
        setRegisteredWorkers([]);
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
    if (workers.length === 0) return;
    setLastKnownLocationByWorkerId((prev) => {
      const next = { ...prev };
      for (const worker of workers) {
        if (!isValidCoordinate(worker.latitude, worker.longitude)) continue;
        next[worker.userId] = worker;
      }
      return next;
    });
  }, [workers]);

  useEffect(() => {
    const workerCoords = workers
      .map((w) => ({ latitude: w.latitude, longitude: w.longitude }))
      .filter((c) => isValidCoordinate(c.latitude, c.longitude));
    if (workerCoords.length === 0) return;
    mapRef.current?.fitToCoordinates(workerCoords, {
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

  useEffect(() => {
    const targetHeight = Math.round(height * (sheetExpanded ? 0.62 : 0.8));
    Animated.spring(mapHeightAnim, {
      toValue: targetHeight,
      damping: 18,
      stiffness: 190,
      mass: 0.7,
      useNativeDriver: false,
    }).start();
  }, [sheetExpanded, height, mapHeightAnim]);

  useEffect(() => {
    if (!followWorkerId) return;
    const w = workers.find((x) => x.userId === followWorkerId);
    if (!w || !isValidCoordinate(w.latitude, w.longitude)) return;
    mapRef.current?.animateToRegion(
      {
        latitude: w.latitude,
        longitude: w.longitude,
        latitudeDelta: Math.max(0.02, mapRegion.latitudeDelta * 0.8),
        longitudeDelta: Math.max(0.02, mapRegion.longitudeDelta * 0.8),
      },
      350,
    );
  }, [followWorkerId, workers, mapRegion.latitudeDelta, mapRegion.longitudeDelta]);

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
  const criticalCount = workers.filter((w) => Date.now() - w.updatedAt.getTime() > 30 * 60 * 1000).length;
  const matchesOperationsFilter = useCallback(
    (w: WorkerLocation) => {
      if (operationsFilter === 'online') return isWorkerOnline(w);
      if (operationsFilter === 'tracking') return w.isTracking;
      if (operationsFilter === 'critical') return Date.now() - w.updatedAt.getTime() > 30 * 60 * 1000;
      if (operationsFilter === 'followed') {
        // Safety fallback: if no unit is selected to follow, never leave the map empty.
        if (!followWorkerId) return true;
        return w.userId === followWorkerId;
      }
      return true;
    },
    [operationsFilter, followWorkerId],
  );
  const visibleWorkers = useMemo(() => {
    return workers.filter(matchesOperationsFilter);
  }, [workers, matchesOperationsFilter]);
  const cachedWorkersForMap = useMemo(() => {
    const liveIds = new Set(workers.map((w) => w.userId));
    return registeredWorkers
      .filter((w) => !w.suspended)
      .filter((w) => !liveIds.has(w.id))
      .map((w) => lastKnownLocationByWorkerId[w.id])
      .filter((w): w is WorkerLocation => Boolean(w))
      .filter(matchesOperationsFilter);
  }, [workers, registeredWorkers, lastKnownLocationByWorkerId, matchesOperationsFilter]);
  const mapWorkers = useMemo(() => {
    const byId = new Map<string, WorkerLocation>();
    for (const w of visibleWorkers) byId.set(w.userId, w);
    for (const w of cachedWorkersForMap) {
      if (!byId.has(w.userId)) byId.set(w.userId, w);
    }
    return Array.from(byId.values());
  }, [visibleWorkers, cachedWorkersForMap]);
  const overlayTop = Math.max(10, insets.top + 8);
  const workerCoords = mapWorkers
    .map((w) => ({ latitude: w.latitude, longitude: w.longitude }))
    .filter((c) => isValidCoordinate(c.latitude, c.longitude));
  const previewCenter = baseCenter;
  const previewRadius = Number(baseRadiusText) > 0 ? Number(baseRadiusText) : 150;
  const showBaseOverlay = basePanelOpen
    ? baseEnabled && previewCenter != null && previewRadius > 0
    : Boolean(
        operationalBase?.enabled &&
          operationalBase.latitude != null &&
          operationalBase.longitude != null &&
          operationalBase.radiusMeters > 0,
      );
  const baseCoordinate = basePanelOpen
    ? previewCenter
    : operationalBase?.latitude != null && operationalBase?.longitude != null
      ? {
          latitude: operationalBase.latitude,
          longitude: operationalBase.longitude,
        }
      : null;
  const registeredCount = registeredWorkers.length > 0 ? registeredWorkers.length : workers.length;
  const workerIdsWithLocation = useMemo(
    () =>
      new Set(
        mapWorkers
          .filter((w) => isValidCoordinate(w.latitude, w.longitude))
          .map((w) => w.userId),
      ),
    [mapWorkers],
  );
  const workersMissingLocation = useMemo(
    () =>
      registeredWorkers
        .filter((w) => !w.suspended)
        .filter((w) => w.id && !workerIdsWithLocation.has(w.id)),
    [registeredWorkers, workerIdsWithLocation],
  );
  const missingLocationAnchor = useMemo(() => {
    if (baseCoordinate && isValidCoordinate(baseCoordinate.latitude, baseCoordinate.longitude)) {
      return baseCoordinate;
    }
    const firstKnown = workerCoords[0];
    if (firstKnown && isValidCoordinate(firstKnown.latitude, firstKnown.longitude)) {
      return firstKnown;
    }
    if (isValidCoordinate(mapRegion.latitude, mapRegion.longitude)) {
      return {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
      };
    }
    return DEFAULT_REGION;
  }, [baseCoordinate, workerCoords, mapRegion.latitude, mapRegion.longitude]);
  const missingLocationGhostMarkers = useMemo(() => {
    return workersMissingLocation.map((worker, index) => {
      const angle = (index * 137.5 * Math.PI) / 180;
      const ring = Math.floor(index / 6) + 1;
      const radius = 0.00045 * ring;
      return {
        worker,
        latitude: missingLocationAnchor.latitude + Math.sin(angle) * radius,
        longitude: missingLocationAnchor.longitude + Math.cos(angle) * radius,
      };
    });
  }, [workersMissingLocation, missingLocationAnchor]);
  const kpiDelta = {
    online: onlineCount - previousKpiRef.current.online,
    tracking: trackingCount - previousKpiRef.current.tracking,
    stale: staleCount - previousKpiRef.current.stale,
    registered: registeredCount - previousKpiRef.current.registered,
  };
  const shouldCluster = mapRegion.latitudeDelta > 0.35;
  const clusterPrecision =
    mapRegion.latitudeDelta > 0.8
      ? 1
      : mapRegion.latitudeDelta > 0.45
        ? 2
        : 4;
  const workerClusters = useMemo(() => {
    if (!shouldCluster) {
      return mapWorkers
        .filter((w) => isValidCoordinate(w.latitude, w.longitude))
        .map((w) => ({
          latitude: w.latitude,
          longitude: w.longitude,
          workers: [w],
        }));
    }

    const buckets = new Map<
      string,
      { latitude: number; longitude: number; workers: WorkerLocation[] }
    >();
    for (const worker of mapWorkers) {
      if (!isValidCoordinate(worker.latitude, worker.longitude)) continue;
      const key = `${worker.latitude.toFixed(clusterPrecision)}:${worker.longitude.toFixed(clusterPrecision)}`;
      const current = buckets.get(key);
      if (current) {
        current.workers.push(worker);
        current.latitude = (current.latitude * (current.workers.length - 1) + worker.latitude) / current.workers.length;
        current.longitude = (current.longitude * (current.workers.length - 1) + worker.longitude) / current.workers.length;
      } else {
        buckets.set(key, {
          latitude: worker.latitude,
          longitude: worker.longitude,
          workers: [worker],
        });
      }
    }
    return Array.from(buckets.values());
  }, [mapWorkers, clusterPrecision, shouldCluster]);
  const followedWorker = followWorkerId
    ? workers.find((w) => w.userId === followWorkerId) ?? null
    : null;

  const crosshairScale = crosshairAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const crosshairOpacity = crosshairAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });
  const toastTranslateY = toastOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  function showToast(message: string) {
    setToastText(message);
    toastOpacity.stopAnimation();
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(1600),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToastText(null);
    });
  }

  useEffect(() => {
    if (!selectingBaseCenter) {
      crosshairAnim.stopAnimation();
      crosshairAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(crosshairAnim, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(crosshairAnim, {
          toValue: 0,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [selectingBaseCenter, crosshairAnim]);

  useEffect(() => {
    previousKpiRef.current = {
      online: onlineCount,
      tracking: trackingCount,
      stale: staleCount,
      registered: registeredCount,
    };
  }, [onlineCount, trackingCount, staleCount, registeredCount]);

  useEffect(() => {
    if (operationsFilter === 'followed' && !followWorkerId) {
      showToast('Filtro "Seguido" sin unidad activa. Mostrando todas.');
      setOperationsFilter('all');
    }
  }, [operationsFilter, followWorkerId]);

  useEffect(() => {
    if (!replayRunning || replayPoints.length === 0) return;
    const timer = setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev + 1;
        if (next >= replayPoints.length) {
          setReplayRunning(false);
          return replayPoints.length - 1;
        }
        const p = replayPoints[next];
        mapRef.current?.animateToRegion(
          {
            latitude: p.latitude,
            longitude: p.longitude,
            latitudeDelta: Math.max(0.02, mapRegion.latitudeDelta * 0.8),
            longitudeDelta: Math.max(0.02, mapRegion.longitudeDelta * 0.8),
          },
          240,
        );
        return next;
      });
    }, 650);
    return () => clearInterval(timer);
  }, [replayRunning, replayPoints, mapRegion.latitudeDelta, mapRegion.longitudeDelta]);

  async function saveBase() {
    if (!can(role, 'base.edit')) {
      showToast('Sin permiso para editar base');
      return;
    }
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
      showToast('Base operativa guardada');
      void repo.logAdminAction({
        actorEmail: _username,
        action: 'base_updated',
        metadata: {
          enabled: baseEnabled,
          radius: previewRadius,
          hasCenter: Boolean(previewCenter),
        },
      });
    } finally {
      setBaseSaving(false);
    }
  }

  function setCenterFromMap(latitude: number, longitude: number) {
    setBaseCenter({ latitude, longitude });
    setSelectingBaseCenter(false);
    showToast('Centro de base actualizado (pendiente de guardar)');
  }

  function proposeBaseCenterChange(latitude: number, longitude: number) {
    if (!can(role, 'base.edit')) {
      showToast('Sin permiso para editar base');
      return;
    }
    Alert.alert(
      'Cambiar posicion de base',
      'Detectamos un nuevo punto en el mapa. ¿Quieres mover la base a esta posicion?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Si, mover',
          onPress: () => {
            setBaseCenter({ latitude, longitude });
            setBasePanelOpen(true);
            setSelectingBaseCenter(true);
            showToast('Posicion propuesta lista. Ajusta rango y guarda.');
          },
        },
      ],
    );
  }

  function applyRadiusDelta(delta: number) {
    const current = Number(baseRadiusText);
    const safeCurrent = Number.isFinite(current) && current > 0 ? current : 150;
    const next = Math.max(50, Math.min(5000, Math.round(safeCurrent + delta)));
    setBaseRadiusText(String(next));
  }

  async function loadReplayForWorker(userId: string) {
    try {
      const points = await repo.fetchWorkerRouteHistory({ userId, limit: 120 });
      setReplayWorkerId(userId);
      setReplayPoints(points);
      setReplayIndex(0);
      if (points.length > 0) {
        mapRef.current?.animateToRegion(
          {
            latitude: points[0].latitude,
            longitude: points[0].longitude,
            latitudeDelta: Math.max(0.02, mapRegion.latitudeDelta * 0.8),
            longitudeDelta: Math.max(0.02, mapRegion.longitudeDelta * 0.8),
          },
          260,
        );
      }
      showToast(points.length > 1 ? 'Replay listo' : 'Sin historial extendido para replay');
      void repo.logAdminAction({
        actorEmail: _username,
        action: 'route_replay_loaded',
        metadata: { userId, points: points.length },
      });
    } catch {
      showToast('No se pudo cargar replay');
    }
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.mapWrap, { height: mapHeightAnim }]} collapsable={false}>
        {isFocused ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={DEFAULT_REGION}
            onMapReady={() => {
              if (workerCoords.length === 0) return;
              mapRef.current?.fitToCoordinates(workerCoords, {
                edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
                animated: false,
              });
            }}
            onRegionChangeComplete={(region) => {
              setMapRegion(region);
            }}
            onLongPress={(e) => {
              const c = e.nativeEvent.coordinate;
              if (selectingBaseCenter || basePanelOpen) {
                setCenterFromMap(c.latitude, c.longitude);
                return;
              }
              proposeBaseCenterChange(c.latitude, c.longitude);
            }}
            onPress={(e) => {
              if (!selectingBaseCenter) return;
              const c = e.nativeEvent.coordinate;
              setCenterFromMap(c.latitude, c.longitude);
            }}
          >
            {showBaseOverlay && baseCoordinate ? (
              <Circle
                center={baseCoordinate}
                radius={basePanelOpen ? previewRadius : operationalBase?.radiusMeters ?? 150}
                strokeColor="rgba(0, 194, 168, 0.85)"
                fillColor="rgba(0, 194, 168, 0.12)"
              />
            ) : null}
            {showBaseOverlay && baseCoordinate ? (
              <Marker
                coordinate={baseCoordinate}
                title={baseName.trim() || 'Base operativa'}
                description="Base operativa"
                zIndex={3}
                draggable={basePanelOpen && can(role, 'base.edit')}
                onDragEnd={(e) => {
                  const c = e.nativeEvent.coordinate;
                  setCenterFromMap(c.latitude, c.longitude);
                }}
              >
                <View style={styles.baseMapMarker}>
                  <MaterialCommunityIcons name="warehouse" size={18} color="#E0F2FE" />
                </View>
              </Marker>
            ) : null}
            {workerClusters.flatMap((cluster) => {
              if (cluster.workers.length === 1) {
                const w = cluster.workers[0];
                const online = isWorkerOnline(w);
                const motoV = motoMapVisualForWorker(w);
                const isFollowing = followWorkerId === w.userId;
                const markerFullName = displayWorkerName(w, firstNameById);
                return [
                  <Marker
                    key={`worker-pin-${w.userId}`}
                    image={motoMarkerImageForVisual(motoV)}
                    coordinate={{ latitude: w.latitude, longitude: w.longitude }}
                    title={markerFullName}
                    description={online ? 'En linea' : 'Sin senal en vivo'}
                    zIndex={isFollowing ? 5 : 4}
                    tracksViewChanges={false}
                    anchor={{ x: 0.5, y: 0.5 }}
                    onPress={() => {
                      setFollowWorkerId((prev) => {
                        const next = prev === w.userId ? null : w.userId;
                        showToast(
                          next
                            ? `Siguiendo a ${markerFullName}`
                            : 'Seguimiento desactivado',
                        );
                        return next;
                      });
                    }}
                  />,
                  <Marker
                    key={`worker-lbl-${w.userId}`}
                    coordinate={{
                      latitude: w.latitude + MOTO_NAME_LABEL_D_LAT,
                      longitude: w.longitude,
                    }}
                    zIndex={isFollowing ? 6 : 5}
                    tracksViewChanges={false}
                    anchor={{ x: 0.5, y: 1 }}
                    onPress={() => {
                      setFollowWorkerId((prev) => {
                        const next = prev === w.userId ? null : w.userId;
                        showToast(
                          next
                            ? `Siguiendo a ${markerFullName}`
                            : 'Seguimiento desactivado',
                        );
                        return next;
                      });
                    }}
                  >
                    <View
                      style={styles.motoMapLabelRow}
                      collapsable={Platform.OS === 'android' ? false : undefined}
                    >
                      {motoV === 'critical' ? <View style={styles.motoNameCriticalDot} /> : null}
                      <View
                        style={[
                          styles.motoMapNameChip,
                          isFollowing && styles.motoMapNameChipFollow,
                          markerFullName.length > 12 ? styles.motoMapNameChipNarrow : null,
                        ]}
                      >
                        <Text style={styles.motoMapNameText} numberOfLines={1} ellipsizeMode="tail">
                          {markerFullName}
                        </Text>
                      </View>
                    </View>
                  </Marker>,
                ];
              }
              return [
                <Marker
                  key={`cluster-${cluster.latitude}-${cluster.longitude}-${cluster.workers.length}`}
                  coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                  title={`${cluster.workers.length} unidades`}
                  description="Cluster"
                  zIndex={1}
                  onPress={() => {
                    mapRef.current?.animateToRegion(
                      {
                        latitude: cluster.latitude,
                        longitude: cluster.longitude,
                        latitudeDelta: Math.max(0.02, mapRegion.latitudeDelta * 0.55),
                        longitudeDelta: Math.max(0.02, mapRegion.longitudeDelta * 0.55),
                      },
                      280,
                    );
                  }}
                >
                  <View style={styles.clusterWrap}>
                    <View style={styles.clusterHalo} />
                    <View style={styles.clusterMarker}>
                      <Text style={styles.clusterMarkerText}>{cluster.workers.length}</Text>
                    </View>
                  </View>
                </Marker>,
              ];
            })}
            {missingLocationGhostMarkers.flatMap((ghost) => {
              const workerLabel = managedWorkerDisplayName(ghost.worker);
              return [
                <Marker
                  key={`ghost-pin-${ghost.worker.id}`}
                  image={MOTO_MARKER_OFF}
                  coordinate={{ latitude: ghost.latitude, longitude: ghost.longitude }}
                  title={workerLabel}
                  description="Sin ubicacion GPS reportada"
                  zIndex={2}
                  style={{ opacity: 0.55 }}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => {
                    showToast(`${workerLabel}: sin ubicacion GPS reportada`);
                  }}
                />,
                <Marker
                  key={`ghost-lbl-${ghost.worker.id}`}
                  coordinate={{
                    latitude: ghost.latitude + MOTO_NAME_LABEL_D_LAT,
                    longitude: ghost.longitude,
                  }}
                  zIndex={2}
                  style={{ opacity: 0.85 }}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 1 }}
                  onPress={() => {
                    showToast(`${workerLabel}: sin ubicacion GPS reportada`);
                  }}
                >
                  <View
                    style={styles.motoMapLabelRow}
                    collapsable={Platform.OS === 'android' ? false : undefined}
                  >
                    <View
                      style={[
                        styles.motoMapNameChip,
                        styles.motoMapNameChipGhostMap,
                        workerLabel.length > 12 ? styles.motoMapNameChipNarrow : null,
                      ]}
                    >
                      <Text style={styles.motoMapNameText} numberOfLines={1} ellipsizeMode="tail">
                        {workerLabel}
                      </Text>
                    </View>
                  </View>
                </Marker>,
              ];
            })}
            {replayPoints.length > 1 ? (
              <Polyline
                coordinates={replayPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
                strokeColor="rgba(56,189,248,0.92)"
                strokeWidth={4}
                lineCap="round"
                zIndex={4}
              />
            ) : null}
            {replayPoints.length > 0 && replayPoints[replayIndex] ? (
              <Marker
                coordinate={{
                  latitude: replayPoints[replayIndex].latitude,
                  longitude: replayPoints[replayIndex].longitude,
                }}
                title="Punto replay"
                description={replayPoints[replayIndex].updatedAt.toLocaleString()}
                zIndex={5}
              >
                <View style={styles.replayCursor}>
                  <MaterialCommunityIcons name="play-circle" size={16} color="#E0F2FE" />
                </View>
              </Marker>
            ) : null}
          </MapView>
        ) : (
          <View style={[styles.map, { backgroundColor: '#E5E7EB' }]} />
        )}
        <View style={[styles.mapOverlay, { top: overlayTop }]} pointerEvents="box-none">
          <View style={styles.kpiRow}>
            <View style={[styles.kpiChip, styles.kpiChipAccent, { width: kpiChipWidth }]}>
              <MaterialCommunityIcons name="access-point-check" size={12} color="#D1FAE5" />
              <Text style={styles.kpiLabel}>En linea</Text>
              <Text style={styles.kpiValue}>{onlineCount}</Text>
              <Text style={styles.kpiTrend}>{kpiDelta.online >= 0 ? `+${kpiDelta.online}` : `${kpiDelta.online}`}</Text>
            </View>
            <View style={[styles.kpiChip, { width: kpiChipWidth }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={12} color="#BFDBFE" />
              <Text style={styles.kpiLabel}>Tracking</Text>
              <Text style={styles.kpiValue}>{trackingCount}</Text>
              <Text style={styles.kpiTrend}>{kpiDelta.tracking >= 0 ? `+${kpiDelta.tracking}` : `${kpiDelta.tracking}`}</Text>
            </View>
            <View style={[styles.kpiChip, { width: kpiChipWidth }]}>
              <MaterialCommunityIcons name="alert-octagon" size={12} color="#FECACA" />
              <Text style={styles.kpiLabel}>Criticas</Text>
              <Text style={styles.kpiValue}>{criticalCount}</Text>
              <Text style={styles.kpiTrend}>{kpiDelta.stale >= 0 ? `+${kpiDelta.stale}` : `${kpiDelta.stale}`}</Text>
            </View>
            <View style={[styles.kpiChip, { width: kpiChipWidth }]}>
              <MaterialCommunityIcons name="account-group" size={12} color="#E5E7EB" />
              <Text style={styles.kpiLabel}>Registrados</Text>
              <Text style={styles.kpiValue}>{String(registeredCount)}</Text>
              <Text style={styles.kpiTrend}>{kpiDelta.registered >= 0 ? `+${kpiDelta.registered}` : `${kpiDelta.registered}`}</Text>
            </View>
          </View>
          <View style={styles.mapDebugChip}>
            <Text style={styles.mapDebugText}>
              visibles: {visibleWorkers.length} · mapa: {workerClusters.length} · sin gps: {workersMissingLocation.length}
            </Text>
          </View>
        </View>
        {followedWorker ? (
          <View style={[styles.followChipWrap, { top: overlayTop + 58 }]} pointerEvents="box-none">
            <View style={styles.followChip}>
              <MaterialCommunityIcons name="crosshairs-gps" size={13} color="#BAE6FD" />
              <Text style={styles.followChipText} numberOfLines={1}>
                Siguiendo: {displayWorkerName(followedWorker, firstNameById)}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={[styles.legendWrap, { top: overlayTop + (followedWorker ? 92 : 58) }]} pointerEvents="none">
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>Estados</Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#991B1B' }]} />
              <Text style={styles.legendText}>Critico</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
              <Text style={styles.legendText}>Tracking OFF</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: AppColors.accent }]} />
              <Text style={styles.legendText}>Online</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#475569' }]} />
              <Text style={styles.legendText}>Offline</Text>
            </View>
          </View>
        </View>
        <View style={styles.mapActions} pointerEvents="box-none">
          <Pressable
            onPress={() => {
              if (followWorkerId) {
                setFollowWorkerId(null);
                showToast('Seguimiento desactivado');
                return;
              }
              const firstOnline = workers.find((w) => isWorkerOnline(w) && isValidCoordinate(w.latitude, w.longitude));
              if (!firstOnline) {
                showToast('No hay unidades online para seguir');
                return;
              }
              setFollowWorkerId(firstOnline.userId);
              showToast(`Siguiendo a ${displayWorkerName(firstOnline, firstNameById)}`);
            }}
            style={[styles.fab, followWorkerId && styles.fabFollowOn]}
          >
            <MaterialCommunityIcons name={followWorkerId ? 'crosshairs-off' : 'crosshairs'} size={14} color="#fff" />
            <Text style={styles.fabText}>{followWorkerId ? 'Seguir OFF' : 'Seguir ON'}</Text>
          </Pressable>
          <Pressable onPress={() => void refresh()} style={[styles.fab, styles.fabPrimary]}>
            <Text style={styles.fabEmoji}>↻</Text>
            <Text style={styles.fabText}>Actualizar</Text>
          </Pressable>
          {followWorkerId ? (
            <Pressable
              onPress={() => {
                const followed = workers.find((w) => w.userId === followWorkerId);
                if (!followed || !isValidCoordinate(followed.latitude, followed.longitude)) {
                  showToast('Unidad seguida sin coordenadas');
                  return;
                }
                mapRef.current?.animateToRegion(
                  {
                    latitude: followed.latitude,
                    longitude: followed.longitude,
                    latitudeDelta: Math.max(0.02, mapRegion.latitudeDelta * 0.75),
                    longitudeDelta: Math.max(0.02, mapRegion.longitudeDelta * 0.75),
                  },
                  260,
                );
              }}
              style={styles.fab}
            >
              <MaterialCommunityIcons name="target" size={14} color="#fff" />
              <Text style={styles.fabText}>Recentrar seguido</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setBasePanelOpen(true)}
            style={[
              styles.fab,
              (basePanelOpen || selectingBaseCenter) && styles.fabActive,
              !can(role, 'base.edit') && styles.fabDisabled,
            ]}
            disabled={!can(role, 'base.edit')}
          >
            <Text style={styles.fabEmoji}>{basePanelOpen ? '✓' : '◎'}</Text>
            <Text style={styles.fabText}>
              {selectingBaseCenter ? 'Seleccionando...' : basePanelOpen ? 'Base abierta' : 'Editar base'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (workerCoords.length === 0) return;
              mapRef.current?.fitToCoordinates(workerCoords, {
                edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
                animated: true,
              });
            }}
            style={styles.fab}
          >
            <Text style={styles.fabEmoji}>⌖</Text>
            <Text style={styles.fabText}>Centrar</Text>
          </Pressable>
        </View>
        <View style={styles.mapHintWrap} pointerEvents="box-none">
          <Text style={styles.mapHintText}>
            {selectingBaseCenter
              ? 'Toca en el mapa para fijar centro de base'
              : 'Mantener pulsado para definir centro de base operativa'}
          </Text>
        </View>
        {selectingBaseCenter ? (
          <View style={styles.crosshairWrap} pointerEvents="none">
            <Animated.View
              style={[
                styles.crosshair,
                {
                  opacity: crosshairOpacity,
                  transform: [{ scale: crosshairScale }],
                },
              ]}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#D1FAE5" />
            </Animated.View>
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.panel}>
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>
        <View style={styles.sectionTag}>
          <Text style={styles.sectionTagText}>Monitoreo en tiempo real</Text>
        </View>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Operaciones en vivo</Text>
            <Text style={styles.panelSub}>Vista operativa de cuadrillas y estado de conexion.</Text>
          </View>
          <Pressable
            onPress={() => setSheetExpanded((prev) => !prev)}
            style={[styles.expandBtn, sheetExpanded && styles.expandBtnOn]}
          >
            <MaterialCommunityIcons
              name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
              size={16}
              color={sheetExpanded ? '#0F172A' : '#E2E8F0'}
            />
            <Text style={[styles.expandBtnText, sheetExpanded && styles.expandBtnTextOn]}>
              {sheetExpanded ? 'Compacto' : 'Expandir'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.baseSummary}>
          <View style={styles.baseSummaryLeft}>
            <Text style={styles.baseSummaryTitle}>{baseName.trim() || 'Base operativa'}</Text>
            <Text style={styles.baseSummaryMeta}>
              Centro: {baseCenter ? `${baseCenter.latitude.toFixed(4)}, ${baseCenter.longitude.toFixed(4)}` : 'No definido'}
            </Text>
          </View>
          <Pressable
            onPress={() => setBasePanelOpen(true)}
            style={[styles.baseSummaryBtn, !can(role, 'base.edit') && styles.baseSummaryBtnDisabled]}
            disabled={!can(role, 'base.edit')}
          >
            <Text style={styles.baseSummaryBtnText}>Editar</Text>
          </Pressable>
        </View>
        {!can(role, 'base.edit') ? (
          <Text style={styles.permissionHint}>Tu rol no tiene permiso para modificar la base operativa.</Text>
        ) : null}
        <View style={styles.quickFilters}>
          {([
            ['all', 'Todos'],
            ['online', 'Online'],
            ['tracking', 'Tracking'],
            ['critical', 'Criticas'],
            ['followed', 'Seguido'],
          ] as Array<[OperationsFilter, string]>).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setOperationsFilter(id)}
              style={[styles.quickFilterChip, operationsFilter === id && styles.quickFilterChipOn]}
            >
              <Text style={[styles.quickFilterText, operationsFilter === id && styles.quickFilterTextOn]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.replayActions}>
          <Pressable
            onPress={() => {
              const candidate = followWorkerId ?? visibleWorkers[0]?.userId ?? workers[0]?.userId;
              if (!candidate) {
                showToast('No hay unidades para replay');
                return;
              }
              void loadReplayForWorker(candidate);
            }}
            style={styles.replayBtn}
          >
            <Text style={styles.replayBtnText}>Cargar replay</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (replayPoints.length <= 1) {
                showToast('Replay insuficiente');
                return;
              }
              setReplayRunning((prev) => !prev);
            }}
            style={[styles.replayBtn, replayRunning && styles.replayBtnOn]}
          >
            <Text style={styles.replayBtnText}>{replayRunning ? 'Pausar' : 'Reproducir'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setReplayRunning(false);
              setReplayWorkerId(null);
              setReplayPoints([]);
              setReplayIndex(0);
            }}
            style={styles.replayBtnGhost}
          >
            <Text style={styles.replayBtnGhostText}>Limpiar</Text>
          </Pressable>
        </View>
        {replayWorkerId ? (
          <Text style={styles.replayMeta}>
            Replay:{' '}
            {(() => {
              const target = workers.find((w) => w.userId === replayWorkerId);
              return target ? displayWorkerName(target, firstNameById) : 'Unidad';
            })()}{' '}
            ·
            {` `}
            {replayIndex + 1}/{Math.max(1, replayPoints.length)}
          </Text>
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {workersMissingLocation.length > 0 ? (
          <Text style={styles.warningText}>
            {workersMissingLocation.length} trabajador(es) activo(s) sin ubicacion GPS reportada. Abre la app de trabajador y activa
            el tracking para mostrarlos con ubicacion real.
          </Text>
        ) : null}
        {sheetExpanded ? (
          <FlatList
            data={visibleWorkers}
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
        ) : (
          <View style={styles.peekInfo}>
            <Text style={styles.peekInfoText}>Panel compacto activo. Toca “Expandir” para ver la lista completa.</Text>
          </View>
        )}
      </View>

      <Modal visible={basePanelOpen} transparent animationType="slide" onRequestClose={() => setBasePanelOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.baseTitle}>Editar base operativa</Text>
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
              Centro actual: {baseCenter ? `${baseCenter.latitude.toFixed(5)}, ${baseCenter.longitude.toFixed(5)}` : 'No definido'}
            </Text>
          <Text style={styles.baseHint}>
            Rango actual: {previewRadius} m
          </Text>
          <View style={styles.radiusQuickRow}>
            <Pressable onPress={() => applyRadiusDelta(-50)} style={styles.radiusQuickBtn}>
              <Text style={styles.radiusQuickBtnText}>-50 m</Text>
            </Pressable>
            <Pressable onPress={() => applyRadiusDelta(50)} style={styles.radiusQuickBtn}>
              <Text style={styles.radiusQuickBtnText}>+50 m</Text>
            </Pressable>
            <Pressable onPress={() => applyRadiusDelta(100)} style={styles.radiusQuickBtn}>
              <Text style={styles.radiusQuickBtnText}>+100 m</Text>
            </Pressable>
          </View>
          <Text style={styles.baseHint}>
            Puedes arrastrar el icono de base en el mapa para moverla con precision.
          </Text>
            <Pressable
              onPress={() => {
                setBasePanelOpen(false);
                setSelectingBaseCenter(true);
              showToast('Selecciona un punto en el mapa o arrastra el icono base');
              }}
              style={styles.pickCenterBtn}
            >
              <Text style={styles.pickCenterBtnText}>Seleccionar centro en mapa</Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setBasePanelOpen(false)} style={[styles.saveBtn, styles.modalCancelBtn]}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveBase()}
                style={[styles.saveBtn, baseSaving && styles.saveBtnDisabled]}
                disabled={baseSaving}
              >
                <Text style={styles.saveBtnText}>{baseSaving ? 'Guardando...' : 'Guardar base'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {toastText ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
              bottom: Math.max(16, insets.bottom + 6),
            },
          ]}
        >
          <MaterialCommunityIcons name="check-circle" size={14} color="#D1FAE5" />
          <Text style={styles.toastText}>{toastText}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F5F9' },
  mapWrap: { width: '100%', backgroundColor: '#E5E7EB', overflow: 'hidden' },
  map: { ...StyleSheet.absoluteFillObject },
  mapOverlay: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  kpiChip: {
    backgroundColor: 'rgba(10,22,40,0.82)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  kpiChipAccent: {
    backgroundColor: 'rgba(0,194,168,0.82)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  kpiLabel: { color: 'rgba(232,236,242,0.85)', marginTop: 2, fontSize: 9, fontWeight: '700' },
  kpiValue: { color: '#fff', marginTop: 2, fontSize: 12, fontWeight: '900' },
  kpiTrend: { marginTop: 2, fontSize: 9, color: '#CBD5E1', fontWeight: '700' },
  mapDebugChip: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(2,6,23,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mapDebugText: { color: '#CFE8FF', fontSize: 10, fontWeight: '800' },
  followChipWrap: {
    position: 'absolute',
    left: 12,
    right: 88,
    top: 66,
    alignItems: 'flex-start',
  },
  followChip: {
    maxWidth: '100%',
    backgroundColor: 'rgba(2,6,23,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followChipText: { color: '#E2E8F0', fontSize: 11, fontWeight: '800' },
  legendWrap: {
    position: 'absolute',
    left: 12,
    alignItems: 'flex-start',
  },
  legendCard: {
    backgroundColor: 'rgba(2,6,23,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 118,
  },
  legendTitle: { color: '#E2E8F0', fontSize: 11, fontWeight: '900', marginBottom: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  legendText: { color: '#E2E8F0', fontSize: 10, fontWeight: '700' },
  mapActions: {
    position: 'absolute',
    right: 12,
    bottom: 52,
    gap: 10,
    alignItems: 'flex-end',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fabPrimary: {
    backgroundColor: 'rgba(0,194,168,0.9)',
    borderColor: 'rgba(255,255,255,0.32)',
  },
  fabFollowOn: {
    backgroundColor: 'rgba(56,189,248,0.92)',
    borderColor: 'rgba(255,255,255,0.36)',
  },
  fabActive: {
    backgroundColor: 'rgba(56,189,248,0.88)',
    borderColor: 'rgba(255,255,255,0.36)',
  },
  fabDisabled: { opacity: 0.45 },
  fabEmoji: { color: '#fff', fontSize: 14, fontWeight: '800' },
  fabText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  workerMarkerWrap: {
    width: 124,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  workerNameTag: {
    maxWidth: 110,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 7,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  workerNameTagOn: {
    backgroundColor: 'rgba(2,6,23,0.95)',
    borderColor: 'rgba(56,189,248,0.72)',
  },
  workerNameTagOff: {
    backgroundColor: 'rgba(30,41,59,0.94)',
    borderColor: 'rgba(148,163,184,0.65)',
  },
  workerNameTagTrackingOff: {
    backgroundColor: 'rgba(67,56,202,0.94)',
    borderColor: 'rgba(199,210,254,0.7)',
  },
  workerNameTagCritical: {
    backgroundColor: 'rgba(127,29,29,0.95)',
    borderColor: 'rgba(254,202,202,0.72)',
  },
  workerNameTagMissing: {
    backgroundColor: 'rgba(71,85,105,0.95)',
    borderColor: 'rgba(203,213,225,0.7)',
  },
  workerNameTagFollowing: {
    borderColor: '#7DD3FC',
    borderWidth: 1.3,
  },
  workerNameText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(2,6,23,0.4)',
    textShadowRadius: 2,
  },
  followPulseHalo: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(56,189,248,0.45)',
    bottom: 1,
  },
  workerMapMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.2,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    overflow: 'visible',
    zIndex: 1,
  },
  workerBikeMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.2,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  workerMapMarkerOn: { backgroundColor: '#DC2626' },
  workerMapMarkerOff: { backgroundColor: '#475569' },
  workerMapMarkerTrackingOff: { backgroundColor: '#4F46E5' },
  workerMapMarkerCritical: { backgroundColor: '#991B1B' },
  workerMapMarkerMissing: { backgroundColor: '#64748B' },
  workerMapMarkerFollowing: {
    borderColor: '#7DD3FC',
    borderWidth: 2.5,
  },
  motoMapLabelRow: { flexDirection: 'row', alignItems: 'center' },
  motoNameCriticalDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F87171',
    marginRight: 4,
    borderWidth: 1.2,
    borderColor: '#F8FAFC',
  },
  motoMapNameChip: {
    maxWidth: 168,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  motoMapNameChipFollow: {
    borderColor: 'rgba(125,211,252,0.95)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  motoMapNameChipNarrow: { maxWidth: 142 },
  motoMapNameChipGhostMap: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  motoMapNameText: { color: '#F8FAFC', fontWeight: '800', fontSize: 10.5, letterSpacing: 0.2 },
  workerMotoEmoji: { fontSize: 19, lineHeight: 21, textAlign: 'center' },
  workerStatusDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  workerStatusDotOn: { backgroundColor: '#22C55E' },
  workerStatusDotOff: { backgroundColor: '#94A3B8' },
  workerStatusDotTrackingOff: { backgroundColor: '#A78BFA' },
  workerStatusDotCritical: { backgroundColor: '#EF4444' },
  workerStatusDotMissing: { backgroundColor: '#CBD5E1' },
  clusterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterHalo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(14,165,233,0.28)',
  },
  clusterMarker: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0EA5E9',
    borderWidth: 2,
    borderColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clusterMarkerText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  baseMapMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1F35',
    borderWidth: 2,
    borderColor: '#38BDF8',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
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
  crosshairWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshair: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(11,31,53,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    marginTop: -14,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,194,168,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  panelHeader: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  panelTitle: { fontSize: 20, fontWeight: '900', color: AppColors.navy },
  panelSub: { marginTop: 4, color: '#64748B', fontSize: 13, lineHeight: 18 },
  expandBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandBtnOn: { backgroundColor: '#CFFAFE' },
  expandBtnText: { color: '#E2E8F0', fontWeight: '800', fontSize: 11 },
  expandBtnTextOn: { color: '#0F172A' },
  baseSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  baseSummaryLeft: { flex: 1, minWidth: 0 },
  baseSummaryTitle: { fontSize: 14, fontWeight: '900', color: AppColors.navy },
  baseSummaryMeta: { marginTop: 4, fontSize: 12, color: '#64748B' },
  baseSummaryBtn: {
    backgroundColor: 'rgba(0,194,168,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  baseSummaryBtnDisabled: { opacity: 0.45 },
  baseSummaryBtnText: { fontWeight: '900', color: AppColors.navy, fontSize: 12 },
  permissionHint: { marginBottom: 10, color: '#92400E', fontSize: 12, fontWeight: '700' },
  quickFilters: {
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
  },
  quickFilterChipOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  quickFilterText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  quickFilterTextOn: { color: AppColors.navy },
  replayActions: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  replayBtn: {
    backgroundColor: '#0B1F35',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replayBtnOn: { backgroundColor: '#0891B2' },
  replayBtnText: { color: '#E2E8F0', fontWeight: '900', fontSize: 12 },
  replayBtnGhost: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replayBtnGhostText: { color: '#0F172A', fontWeight: '900', fontSize: 12 },
  replayMeta: { marginBottom: 10, color: '#475569', fontSize: 12, fontWeight: '700' },
  basePanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
  radiusQuickRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  radiusQuickBtn: {
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  radiusQuickBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 12 },
  saveBtn: {
    marginTop: 10,
    backgroundColor: AppColors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: AppColors.navy, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
  },
  pickCenterBtn: {
    marginTop: 10,
    backgroundColor: '#0B1F35',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pickCenterBtnText: { color: '#F8FAFC', fontWeight: '900' },
  modalActions: { marginTop: 10, flexDirection: 'row', gap: 8 },
  modalCancelBtn: { backgroundColor: '#E5E7EB', flex: 1 },
  modalCancelText: { color: '#0F172A', fontWeight: '900' },
  peekInfo: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  peekInfoText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: 'rgba(2,6,23,0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toastText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },
  err: { color: '#B91C1C', marginBottom: 8, fontSize: 12 },
  warningText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: AppColors.accent, marginTop: 4 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '900', color: '#111827' },
  meta: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  phone: { marginTop: 6, fontSize: 13, fontWeight: '800', color: '#2563EB' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontWeight: '900', fontSize: 11 },
  replayCursor: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0369A1',
    borderWidth: 2,
    borderColor: '#E0F2FE',
  },
  empty: {
    marginTop: 16,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

