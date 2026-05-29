import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { can } from '@fleet/shared-auth';
import type { UserRole } from '@fleet/shared-auth';
import { LocationRepository } from '@fleet/shared-data';
import type { WorkerLocation } from '@fleet/shared-domain';
import { useWorkerLocations } from '@fleet/shared-hooks';
import { AppColors } from '@fleet/shared-ui';
import { displayWorkerName, isWorkerOnline } from '@fleet/shared-ui';
import type { AdminTabParamList } from './AdminDashboard';

const repo = new LocationRepository();

type Props = {
  username: string;
  role: UserRole;
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

export function AdminReportsTab({ username, role, onOpenWorkerOnMap }: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<AdminTabParamList>>();
  const { workers, refresh } = useWorkerLocations(true);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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
  const activityEntries = useMemo(() => Array.from(activity.entries()), [activity]);
  const maxActivity = useMemo(
    () => Math.max(1, ...activityEntries.map(([, count]) => count)),
    [activityEntries],
  );
  const trend =
    comparison.current > comparison.previous
      ? 'Subiendo'
      : comparison.current < comparison.previous
        ? 'Bajando'
        : 'Estable';
  const criticalAlerts = useMemo(
    () =>
      workers
        .filter((w) => Date.now() - w.updatedAt.getTime() > 30 * 60 * 1000)
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()),
    [workers],
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
    if (!can(role, 'reports.export.csv')) return;
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

  async function exportExecutivePdf(): Promise<void> {
    if (!can(role, 'reports.export.pdf')) return;
    const generatedAt = new Date();
    const topCritical = criticalAlerts.slice(0, 8);
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px 0; font-size: 24px; }
            .muted { color: #475569; font-size: 12px; }
            .kpis { margin-top: 18px; display: flex; gap: 10px; flex-wrap: wrap; }
            .kpi { border: 1px solid #dbeafe; border-radius: 10px; padding: 10px; min-width: 130px; }
            .kpi h2 { margin: 0; color: #0369a1; font-size: 12px; text-transform: uppercase; }
            .kpi p { margin: 6px 0 0 0; font-size: 24px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Fleet Control - Reporte Ejecutivo</h1>
          <div class="muted">Generado: ${generatedAt.toLocaleString()}</div>
          <div class="kpis">
            <div class="kpi"><h2>En linea</h2><p>${online}</p></div>
            <div class="kpi"><h2>Tracking ON</h2><p>${tracking}</p></div>
            <div class="kpi"><h2>Sin senal</h2><p>${staleOrOff}</p></div>
            <div class="kpi"><h2>Registros</h2><p>${workers.length}</p></div>
          </div>
          <h3 style="margin-top:20px;">Comparativa ${periodDays} dias</h3>
          <div class="muted">Actual: ${comparison.current} | Anterior: ${comparison.previous} | Tendencia: ${trend}</div>
          <h3 style="margin-top:20px;">Alertas criticas</h3>
          <table>
            <tr><th>Personal</th><th>Correo</th><th>Ultimo reporte</th></tr>
            ${
              topCritical.length === 0
                ? '<tr><td colspan="3">Sin alertas criticas activas.</td></tr>'
                : topCritical
                    .map(
                      (w) =>
                        `<tr><td>${displayWorkerName(w, firstNameById)}</td><td>${w.email}</td><td>${w.updatedAt.toLocaleString()}</td></tr>`,
                    )
                    .join('')
            }
          </table>
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Reporte ejecutivo PDF',
      });
    }
    void repo.logAdminAction({
      actorEmail: username,
      action: 'executive_pdf_exported',
      metadata: { periodDays, workers: workers.length, critical: criticalAlerts.length },
    });
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: Math.max(14, insets.top + 10), paddingBottom: Math.max(28, insets.bottom + 18) },
      ]}
    >
      <View style={styles.sectionTag}>
        <Text style={styles.sectionTagText}>Panel analitico</Text>
      </View>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reportes operativos</Text>
          <Text style={styles.sub}>Resumen, actividad y alertas del personal en campo.</Text>
        </View>
        <View style={styles.heroBadge}>
          <MaterialCommunityIcons name="chart-line-variant" size={18} color="#CFFAFE" />
          <Text style={styles.heroBadgeText}>Live</Text>
        </View>
      </View>

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
        <View style={styles.exportActions}>
          <Pressable onPress={() => void exportCsv()} style={styles.export}>
            <Text style={styles.exportText}>CSV</Text>
          </Pressable>
          <Pressable
            onPress={() => void exportExecutivePdf()}
            style={[styles.exportPdf, !can(role, 'reports.export.pdf') && styles.exportPdfDisabled]}
            disabled={!can(role, 'reports.export.pdf')}
          >
            <Text style={styles.exportPdfText}>PDF ejecutivo</Text>
          </Pressable>
        </View>
      </View>
      {!can(role, 'reports.export.pdf') ? (
        <Text style={styles.permissionHint}>Tu rol no tiene permiso para exportar PDF ejecutivo.</Text>
      ) : null}

      {tab === 'summary' ? (
        <>
          <View style={styles.cards}>
            <Kpi title="En linea" value={String(online)} icon="access-point-check" accent />
            <Kpi title="Tracking ON" value={String(tracking)} icon="crosshairs-gps" />
            <Kpi title="Sin senal" value={String(staleOrOff)} icon="wifi-off" />
            <Kpi title="Registros" value={String(workers.length)} icon="account-group" />
          </View>
          <View style={styles.compareStrip}>
            <Text style={styles.compareStripText}>
              Comparativa {periodDays}d: {comparison.current} vs {comparison.previous} · {trend}
            </Text>
            <Text style={styles.compareStripSub}>Criticas activas: {criticalAlerts.length}</Text>
          </View>
        </>
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
          <View style={styles.activityChart}>
            {activityEntries.map(([day, count]) => {
              const height = Math.max(8, Math.round((count / maxActivity) * 76));
              return (
                <View key={`bar-${day}`} style={styles.chartCol}>
                  <View style={[styles.chartBar, { height }]} />
                  <Text style={styles.chartLabel}>{day.slice(5)}</Text>
                </View>
              );
            })}
          </View>
          {activityEntries.map(([day, count]) => (
            <View key={day} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.dayValueWrap}>
                <View
                  style={[
                    styles.dayBar,
                    {
                      width: Math.max(
                        8,
                        Math.min(
                          Math.floor(width * 0.34),
                          Math.round((count / maxActivity) * width * 0.34),
                        ),
                      ),
                    },
                  ]}
                />
                <Text style={styles.dayValue}>{count}</Text>
              </View>
            </View>
          ))}
          <View style={styles.compareBox}>
            <Text style={styles.compareTitle}>Comparacion de contactos ({periodDays} dias)</Text>
            <Text style={styles.compareLine}>Periodo actual: {comparison.current}</Text>
            <Text style={styles.compareLine}>Periodo anterior: {comparison.previous}</Text>
            <Text style={styles.compareLine}>Tendencia: {trend}</Text>
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
            .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
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

function Kpi(props: { title: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; accent?: boolean }) {
  return (
    <View style={[styles.card, props.accent && styles.cardAccent]}>
      <View style={styles.cardIconWrap}>
        <MaterialCommunityIcons name={props.icon} size={14} color={props.accent ? '#D1FAE5' : '#BFDBFE'} />
      </View>
      <Text style={styles.cardK}>{props.title}</Text>
      <Text style={styles.cardV}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, backgroundColor: '#F1F5F9' },
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
  hero: {
    marginTop: 10,
    backgroundColor: '#0B1F35',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBadgeText: { color: '#E2E8F0', fontWeight: '900', fontSize: 11 },
  title: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  sub: { marginTop: 6, color: 'rgba(226,232,240,0.82)', fontSize: 13, lineHeight: 18 },
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
  exportActions: { flexDirection: 'row', gap: 8 },
  refresh: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  refreshText: { fontWeight: '800', color: AppColors.navy },
  export: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: AppColors.navy,
    borderRadius: 12,
  },
  exportText: { fontWeight: '800', color: '#fff' },
  exportPdf: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0F766E',
    borderRadius: 12,
  },
  exportPdfDisabled: { opacity: 0.45 },
  exportPdfText: { fontWeight: '800', color: '#fff', fontSize: 12 },
  permissionHint: { marginTop: 8, color: '#92400E', fontSize: 12, fontWeight: '700' },
  cards: { marginTop: 14, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  compareStrip: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E2E8F0',
  },
  compareStripText: { color: '#0F172A', fontWeight: '900', fontSize: 12 },
  compareStripSub: { marginTop: 4, color: '#475569', fontSize: 11, fontWeight: '700' },
  card: {
    width: '48%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#020617',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardAccent: { borderColor: '#00C2A8' },
  cardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardK: { marginTop: 8, fontSize: 11, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' },
  cardV: { marginTop: 6, fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  cardBlock: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  blockTitle: { fontSize: 15, fontWeight: '900', color: AppColors.navy, marginBottom: 10 },
  activityChart: {
    height: 108,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  chartCol: { alignItems: 'center', flex: 1 },
  chartBar: {
    width: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.82)',
  },
  chartLabel: { marginTop: 6, color: '#64748B', fontSize: 9, fontWeight: '700' },
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

