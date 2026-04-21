import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { LocationRepository } from '../../data/locationRepository';
import type { WorkerLocation } from '../../domain/workerLocation';
import { useWorkerLocations } from '../../hooks/useWorkerLocations';
import { AppColors } from '../../theme/colors';
import { displayWorkerName, isWorkerOnline } from '../../utils/workerUi';
import type { AdminTabParamList } from './AdminDashboard';

const repo = new LocationRepository();

type Props = {
  username: string;
  onOpenWorkerOnMap: (userId: string) => void;
};

type ReportsTab = 'summary' | 'activity' | 'team' | 'alerts';

function dateOnlyLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function activityByDay(workers: WorkerLocation[], days: number): Map<string, number> {
  const today = dateOnlyLocal(new Date());
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const map = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    map.set(day.toISOString().slice(0, 10), 0);
  }
  for (const w of workers) {
    const key = dateOnlyLocal(w.updatedAt).toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

function compareContactPeriods(workers: WorkerLocation[], days: number): {
  current: number;
  previous: number;
} {
  const today = dateOnlyLocal(new Date());
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - (days - 1));

  const prevEnd = new Date(currentStart);
  prevEnd.setDate(currentStart.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));

  let current = 0;
  let previous = 0;
  for (const w of workers) {
    const d = dateOnlyLocal(w.updatedAt);
    if (d >= currentStart && d <= today) {
      current += 1;
    } else if (d >= prevStart && d <= prevEnd) {
      previous += 1;
    }
  }
  return { current, previous };
}

export function AdminReportsTab({ username: _username, onOpenWorkerOnMap }: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<AdminTabParamList>>();
  const { workers, refresh } = useWorkerLocations(true);

  const [tab, setTab] = useState<ReportsTab>('summary');
  const [periodDays, setPeriodDays] = useState(7);
  const [query, setQuery] = useState('');
  const [firstNameById, setFirstNameById] = useState<Record<string, string>>({});
  const [phoneById, setPhoneById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (workers.length === 0) return;
    const missingIds = workers
      .map((w) => w.userId)
      .filter((id) => id && !firstNameById[id]);
    if (missingIds.length === 0) return;
    void (async () => {
      try {
        const names = await repo.fetchProfileFirstNamesByUserIds(
          Array.from(new Set(missingIds)),
        );
        setFirstNameById((prev) => ({ ...prev, ...names }));
      } catch {
        // fallback por email
      }
    })();
  }, [workers, firstNameById]);

  useEffect(() => {
    if (workers.length === 0) return;
    const missingIds = workers
      .map((w) => w.userId)
      .filter((id) => id && !phoneById[id]);
    if (missingIds.length === 0) return;
    void (async () => {
      try {
        const phones = await repo.fetchProfilePhonesByUserIds(
          Array.from(new Set(missingIds)),
        );
        setPhoneById((prev) => ({ ...prev, ...phones }));
      } catch {
        // si no hay acceso a profiles.phone
      }
    })();
  }, [workers, phoneById]);

  const online = useMemo(() => workers.filter(isWorkerOnline).length, [workers]);
  const tracking = useMemo(() => workers.filter((w) => w.isTracking).length, [workers]);
  const staleOrOff = useMemo(
    () => workers.filter((w) => !isWorkerOnline(w)).length,
    [workers],
  );
  const activity = useMemo(() => activityByDay(workers, periodDays), [workers, periodDays]);
  const comparison = useMemo(
    () => compareContactPeriods(workers, periodDays),
    [workers, periodDays],
  );

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers.filter((w) => {
      if (!q) return true;
      const display = displayWorkerName(w, firstNameById).toLowerCase();
      const phone = (phoneById[w.userId] ?? '').toLowerCase();
      return (
        display.includes(q) ||
        w.email.toLowerCase().includes(q) ||
        phone.includes(q)
      );
    });
  }, [workers, query, firstNameById, phoneById]);

  async function exportCsv(): Promise<void> {
    const rows = [
      'user_id,nombre,email,telefono,en_linea,tracking,updated_at',
      ...workers.map((w) => {
        const onlineNow = isWorkerOnline(w) ? 'si' : 'no';
        const name = displayWorkerName(w, firstNameById).replace(/,/g, ' ');
        const email = w.email.replace(/,/g, ' ');
        const phone = (phoneById[w.userId] ?? '').replace(/,/g, ' ');
        return `${w.userId},${name},${email},${phone},${onlineNow},${w.isTracking ? 'si' : 'no'},${w.updatedAt.toISOString()}`;
      }),
    ].join('\n');

    const path = `${FileSystem.cacheDirectory}reporte_fleet_control.csv`;
    await FileSystem.writeAsStringAsync(path, rows, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.sectionTag}>
        <Text style={styles.sectionTagText}>Panel analitico</Text>
      </View>
      <Text style={styles.title}>Reportes operativos</Text>
      <Text style={styles.sub}>Resumen, actividad y alertas del personal en campo.</Text>

      <View style={styles.tabsRow}>
        <TabBtn id="summary" label="Resumen" tab={tab} onPress={setTab} />
        <TabBtn id="activity" label="Actividad" tab={tab} onPress={setTab} />
        <TabBtn id="team" label="Equipo" tab={tab} onPress={setTab} />
        <TabBtn id="alerts" label="Alertas" tab={tab} onPress={setTab} />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => void refresh()} style={styles.refresh}>
          <Text style={styles.refreshText}>Actualizar</Text>
        </Pressable>
        <Pressable onPress={() => void exportCsv()} style={styles.export}>
          <Text style={styles.exportText}>Exportar CSV</Text>
        </Pressable>
      </View>

      {tab === 'summary' ? (
        <View style={styles.cards}>
          <Kpi title="En linea (60s)" value={String(online)} />
          <Kpi title="Tracking ON" value={String(tracking)} />
          <Kpi title="Sin senal / OFF" value={String(staleOrOff)} />
          <Kpi title="Registros" value={String(workers.length)} />
        </View>
      ) : null}

      {tab === 'activity' ? (
        <View style={styles.cardBlock}>
          <Text style={styles.blockTitle}>Actividad por dia</Text>
          <View style={styles.periodRow}>
            {[7, 14, 30].map((d) => (
              <Pressable
                key={d}
                onPress={() => setPeriodDays(d)}
                style={[styles.chip, periodDays === d && styles.chipOn]}
              >
                <Text style={[styles.chipText, periodDays === d && styles.chipTextOn]}>
                  {d} dias
                </Text>
              </Pressable>
            ))}
          </View>
          {Array.from(activity.entries()).map(([day, count]) => (
            <View key={day} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.dayValueWrap}>
                <View style={[styles.dayBar, { width: Math.max(8, Math.min(140, count * 6)) }]} />
                <Text style={styles.dayValue}>{count}</Text>
              </View>
            </View>
          ))}
          <View style={styles.compareBox}>
            <Text style={styles.compareTitle}>Comparacion de contactos ({periodDays} dias)</Text>
            <Text style={styles.compareLine}>Periodo actual: {comparison.current}</Text>
            <Text style={styles.compareLine}>Periodo anterior: {comparison.previous}</Text>
            <Text style={styles.compareLine}>
              Tendencia:{' '}
              {comparison.current > comparison.previous
                ? 'Subiendo'
                : comparison.current < comparison.previous
                  ? 'Bajando'
                  : 'Estable'}
            </Text>
          </View>
        </View>
      ) : null}

      {tab === 'team' ? (
        <View style={styles.cardBlock}>
          <Text style={styles.blockTitle}>Directorio del equipo</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nombre, correo o telefono"
            placeholderTextColor="#9CA3AF"
            style={styles.search}
          />
          <FlatList
            scrollEnabled={false}
            data={filteredTeam}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={
              <Text style={styles.emptyList}>No hay resultados con ese filtro.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{displayWorkerName(item, firstNameById)}</Text>
                  <Text style={styles.email} numberOfLines={1}>
                    {item.email}
                  </Text>
                  {!!phoneById[item.userId] ? (
                    <Text style={styles.phone}>{phoneById[item.userId]}</Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.mapBtn}
                  onPress={() => {
                    onOpenWorkerOnMap(item.userId);
                    navigation.navigate('Operations');
                  }}
                >
                  <Text style={styles.mapBtnText}>Ver en mapa</Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      ) : null}

      {tab === 'alerts' ? (
        <View style={styles.cardBlock}>
          <Text style={styles.blockTitle}>Alertas de operacion</Text>
          {workers
            .filter((w) => !isWorkerOnline(w))
            .map((w) => (
              <View key={w.userId} style={styles.alertRow}>
                <Text style={styles.alertTitle}>
                  {displayWorkerName(w, firstNameById)}
                </Text>
                <Text style={styles.alertSub}>
                  Sin senal en vivo · ultimo reporte {w.updatedAt.toLocaleString()}
                </Text>
                <Text style={styles.alertLevel}>
                  Severidad:{' '}
                  {Date.now() - w.updatedAt.getTime() > 30 * 60 * 1000
                    ? 'Critica'
                    : Date.now() - w.updatedAt.getTime() > 10 * 60 * 1000
                      ? 'Alta'
                      : 'Media'}
                </Text>
              </View>
            ))}
          {workers.filter((w) => !isWorkerOnline(w)).length === 0 ? (
            <Text style={styles.empty}>Sin alertas activas.</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TabBtn(props: {
  id: ReportsTab;
  label: string;
  tab: ReportsTab;
  onPress: (id: ReportsTab) => void;
}) {
  const active = props.id === props.tab;
  return (
    <Pressable
      onPress={() => props.onPress(props.id)}
      style={[styles.tabBtn, active && styles.tabBtnOn]}
    >
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextOn]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Kpi(props: { title: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardK}>{props.title}</Text>
      <Text style={styles.cardV}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: AppColors.surface },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,194,168,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sectionTagText: {
    color: AppColors.navy,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: { fontSize: 20, fontWeight: '900', color: AppColors.navy },
  sub: { marginTop: 8, color: '#4B5563', fontSize: 13, lineHeight: 18 },
  tabsRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#EEF2F7',
  },
  tabBtnOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  tabBtnText: { color: '#6B7280', fontWeight: '800', fontSize: 12 },
  tabBtnTextOn: { color: AppColors.navy },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  refresh: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  refreshText: { fontWeight: '800', color: AppColors.navy },
  export: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppColors.navy,
    borderRadius: 12,
  },
  exportText: { fontWeight: '800', color: '#fff' },
  cards: { marginTop: 14, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardK: { fontSize: 11, fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' },
  cardV: { marginTop: 8, fontSize: 22, fontWeight: '900', color: AppColors.navy },
  cardBlock: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  blockTitle: { fontSize: 15, fontWeight: '900', color: AppColors.navy, marginBottom: 10 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
  },
  chipOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  chipText: { color: '#6B7280', fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: AppColors.navy },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  dayLabel: { fontSize: 13, color: '#374151' },
  dayValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBar: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.55)',
  },
  dayValue: { fontSize: 13, fontWeight: '900', color: AppColors.navy },
  compareBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  compareTitle: { color: AppColors.navy, fontWeight: '900', fontSize: 13 },
  compareLine: { marginTop: 5, color: '#4B5563', fontSize: 12 },
  search: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    color: '#111827',
  },
  row: {
    marginTop: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: { fontSize: 14, fontWeight: '900', color: '#111827' },
  email: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  phone: { marginTop: 4, fontSize: 12, color: '#2563EB', fontWeight: '700' },
  mapBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,194,168,0.15)',
  },
  mapBtnText: { fontWeight: '900', color: AppColors.navy, fontSize: 12 },
  emptyList: {
    marginTop: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  alertRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  alertTitle: { fontWeight: '900', color: '#B91C1C', fontSize: 13 },
  alertSub: { marginTop: 4, color: '#6B7280', fontSize: 12 },
  alertLevel: { marginTop: 4, color: '#92400E', fontSize: 12, fontWeight: '800' },
  empty: { color: '#6B7280', fontStyle: 'italic' },
});
