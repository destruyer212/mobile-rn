import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
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

type ActivityEvent = {
  userId: string;
  updatedAt: Date;
};

type AlertItem = {
  worker: WorkerLocation;
  title: string;
  detail: string;
  level: 'Critica' | 'Advertencia' | 'Info';
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(';');
}

function dateOnlyLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function activityByDay(events: ActivityEvent[], days: number): Map<string, number> {
  const today = dateOnlyLocal(new Date());
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const map = new Map<string, Set<string>>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    map.set(day.toISOString().slice(0, 10), new Set<string>());
  }
  for (const event of events) {
    const key = dateOnlyLocal(event.updatedAt).toISOString().slice(0, 10);
    if (map.has(key)) map.get(key)?.add(event.userId);
  }
  return new Map(Array.from(map.entries()).map(([day, users]) => [day, users.size]));
}

function compareContactPeriods(events: ActivityEvent[], days: number): {
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

  const current = new Set<string>();
  const previous = new Set<string>();
  for (const event of events) {
    const d = dateOnlyLocal(event.updatedAt);
    const key = `${dateOnlyLocal(event.updatedAt).toISOString().slice(0, 10)}:${event.userId}`;
    if (d >= currentStart && d <= today) current.add(key);
    if (d >= prevStart && d <= prevEnd) previous.add(key);
  }
  return { current: current.size, previous: previous.size };
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '');
}

function weekdayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString('es-PE', { weekday: 'long' });
}

function trendPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function ageMinutes(w: WorkerLocation): number {
  return Math.max(0, Math.floor((Date.now() - w.updatedAt.getTime()) / 60000));
}

function statusText(w: WorkerLocation): { label: string; sub: string; color: string; tone: string } {
  const mins = ageMinutes(w);
  if (!w.isTracking) {
    return { label: 'Tracking OFF', sub: 'Disponible sin seguimiento', color: '#7C3AED', tone: '#F3E8FF' };
  }
  if (isWorkerOnline(w)) {
    return { label: 'En campo', sub: 'Reporte en vivo', color: '#009688', tone: '#CCFBF1' };
  }
  if (mins > 30) {
    return { label: 'Critico', sub: `Sin senal ${mins} min`, color: '#DC2626', tone: '#FEE2E2' };
  }
  return { label: 'Sin senal', sub: `Ultimo hace ${mins} min`, color: '#F97316', tone: '#FFEDD5' };
}

function locationLabel(w: WorkerLocation): string {
  if (w.latitude > -11.9) return 'Puente Piedra';
  if (w.latitude > -11.96) return 'Comas';
  if (w.longitude < -77.08) return 'San Martin';
  return 'Los Olivos';
}

function makeAlerts(workers: WorkerLocation[], firstNameById: Record<string, string>): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const w of workers) {
    const name = displayWorkerName(w, firstNameById);
    const mins = ageMinutes(w);
    if (w.isTracking && mins > 30) {
      alerts.push({
        worker: w,
        title: `Alerta critica: ${name}`,
        detail: `Sin senal GPS por ${mins} min`,
        level: 'Critica',
        color: '#EF4444',
        icon: 'alert-octagon',
      });
    } else if (w.isTracking && !isWorkerOnline(w)) {
      alerts.push({
        worker: w,
        title: `Dispositivo sin senal: ${name}`,
        detail: `Ultimo reporte hace ${mins} min`,
        level: 'Advertencia',
        color: '#F97316',
        icon: 'alert',
      });
    } else if (!w.isTracking) {
      alerts.push({
        worker: w,
        title: `Tracking desactivado: ${name}`,
        detail: 'Unidad disponible sin seguimiento activo',
        level: 'Info',
        color: '#3B82F6',
        icon: 'information',
      });
    }
  }
  return alerts.sort((a, b) => {
    const rank = { Critica: 0, Advertencia: 1, Info: 2 };
    return rank[a.level] - rank[b.level];
  });
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
  const [historyEvents, setHistoryEvents] = useState<ActivityEvent[]>([]);

  async function refreshHistory(): Promise<void> {
    const history = await repo.fetchWorkerLocationHistorySince(Math.max(30, periodDays * 2));
    setHistoryEvents(history.map((point) => ({ userId: point.userId, updatedAt: point.updatedAt })));
  }

  useEffect(() => {
    if (workers.length === 0) return;
    const missingIds = workers.map((w) => w.userId).filter((id) => id && !firstNameById[id]);
    if (missingIds.length === 0) return;
    void (async () => {
      try {
        const names = await repo.fetchProfileFirstNamesByUserIds(Array.from(new Set(missingIds)));
        setFirstNameById((prev) => ({ ...prev, ...names }));
      } catch {
        // fallback por email
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
        // si no hay acceso a profiles.phone
      }
    })();
  }, [workers, phoneById]);

  useEffect(() => {
    void refreshHistory();
  }, [periodDays]);

  const online = useMemo(() => workers.filter(isWorkerOnline).length, [workers]);
  const tracking = useMemo(() => workers.filter((w) => w.isTracking).length, [workers]);
  const staleOrOff = useMemo(() => workers.filter((w) => !isWorkerOnline(w)).length, [workers]);
  const trackingOff = useMemo(() => workers.filter((w) => !w.isTracking).length, [workers]);
  const criticalAlerts = useMemo(
    () => workers.filter((w) => Date.now() - w.updatedAt.getTime() > 30 * 60 * 1000),
    [workers],
  );
  const activityEvents = useMemo<ActivityEvent[]>(() => {
    if (historyEvents.length > 0) return historyEvents;
    return workers.map((w) => ({ userId: w.userId, updatedAt: w.updatedAt }));
  }, [historyEvents, workers]);
  const activity = useMemo(() => activityByDay(activityEvents, periodDays), [activityEvents, periodDays]);
  const comparison = useMemo(() => compareContactPeriods(activityEvents, periodDays), [activityEvents, periodDays]);
  const activityEntries = useMemo(() => Array.from(activity.entries()), [activity]);
  const chartEntries = useMemo(() => activityEntries.slice(-7), [activityEntries]);
  const maxActivity = useMemo(() => Math.max(1, ...activityEntries.map(([, count]) => count)), [activityEntries]);
  const currentTrendPct = trendPct(comparison.current, comparison.previous);
  const trend =
    comparison.current > comparison.previous
      ? 'Subiendo'
      : comparison.current < comparison.previous
        ? 'Bajando'
        : 'Estable';
  const activityTotal = activityEntries.reduce((sum, [, count]) => sum + count, 0);
  const avgDaily = activityEntries.length > 0 ? activityTotal / activityEntries.length : 0;
  const activeHours = Math.max(0, Math.round(activityTotal * 3.4));
  const distanceKm = Math.max(0, Math.round(activityTotal * 9.8));
  const alertItems = useMemo(() => makeAlerts(workers, firstNameById), [workers, firstNameById]);

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers.filter((w) => {
      if (!q) return true;
      const display = displayWorkerName(w, firstNameById).toLowerCase();
      const phone = (phoneById[w.userId] ?? '').toLowerCase();
      return display.includes(q) || w.email.toLowerCase().includes(q) || phone.includes(q);
    });
  }, [workers, query, firstNameById, phoneById]);

  const cardWidth = Math.floor((width - 42) / 2);

  async function exportCsv(): Promise<void> {
    if (!can(role, 'reports.export.csv')) return;
    const header = csvRow([
      'ID trabajador',
      'Nombre',
      'Correo',
      'Telefono',
      'Zona',
      'Estado',
      'En linea',
      'Tracking',
      'Ultimo reporte',
      'Latitud',
      'Longitud',
    ]);
    const rows = workers.map((w) =>
      csvRow([
        w.userId,
        displayWorkerName(w, firstNameById),
        w.email,
        phoneById[w.userId] ?? '',
        locationLabel(w),
        statusText(w).label,
        isWorkerOnline(w) ? 'SI' : 'NO',
        w.isTracking ? 'SI' : 'NO',
        w.updatedAt.toLocaleString('es-PE'),
        w.latitude.toFixed(6),
        w.longitude.toFixed(6),
      ]),
    );
    const csv = `\ufeffsep=;\r\n${[header, ...rows].join('\r\n')}`;
    const stamp = new Date().toISOString().slice(0, 10);
    const path = `${FileSystem.cacheDirectory}reporte_fleet_control_${stamp}.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: 'Abrir reporte CSV en Excel',
        UTI: 'public.comma-separated-values-text',
      });
    }
    void repo.logAdminAction({
      actorEmail: username,
      action: 'csv_exported',
      metadata: { periodDays, workers: workers.length },
    });
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
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Reporte ejecutivo PDF' });
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
        { paddingTop: Math.max(14, insets.top + 10), paddingBottom: Math.max(90, insets.bottom + 24) },
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
          <MaterialCommunityIcons name="chart-line-variant" size={17} color="#CFFAFE" />
          <Text style={styles.heroBadgeText}>En vivo</Text>
          <View style={styles.liveDot} />
        </View>
      </View>

      <View style={styles.topRow}>
        <View style={styles.tabsRow}>
          <TabBtn id="summary" label="Resumen" tab={tab} onPress={setTab} />
          <TabBtn id="activity" label="Actividad" tab={tab} onPress={setTab} />
          <TabBtn id="team" label="Equipo" tab={tab} onPress={setTab} />
          <TabBtn id="alerts" label="Alertas" tab={tab} onPress={setTab} />
        </View>
        <View style={styles.exportActions}>
          <Pressable
            onPress={() => {
              void refresh();
              void refreshHistory();
            }}
            style={styles.iconAction}
          >
            <MaterialCommunityIcons name="refresh" size={16} color={AppColors.navy} />
          </Pressable>
          <Pressable onPress={() => void exportCsv()} style={styles.export}>
            <MaterialCommunityIcons name="download" size={14} color="#fff" />
            <Text style={styles.exportText}>CSV</Text>
          </Pressable>
          <Pressable
            onPress={() => void exportExecutivePdf()}
            style={[styles.exportPdf, !can(role, 'reports.export.pdf') && styles.exportPdfDisabled]}
            disabled={!can(role, 'reports.export.pdf')}
          >
            <MaterialCommunityIcons name="file-document-outline" size={14} color="#fff" />
            <Text style={styles.exportPdfText}>PDF</Text>
          </Pressable>
        </View>
      </View>

      {tab === 'summary' ? (
        <>
          <View style={styles.kpiGrid}>
            <MetricCard
              width={cardWidth}
              title="En linea"
              value={String(online)}
              sub={`${workers.length ? Math.round((online / workers.length) * 100) : 0}% del total`}
              icon="access-point-check"
              color="#00A896"
              values={chartEntries.map(([, count]) => count)}
            />
            <MetricCard
              width={cardWidth}
              title="Tracking ON"
              value={String(tracking)}
              sub={`${trackingOff} pausados`}
              icon="crosshairs-gps"
              color="#2F80ED"
              values={chartEntries.map(([, count]) => Math.max(0, count - 1))}
            />
            <MetricCard
              width={cardWidth}
              title="Criticas"
              value={String(criticalAlerts.length)}
              sub="Requieren revision"
              icon="shield-alert-outline"
              color="#F97316"
              values={chartEntries.map(([, count]) => Math.max(0, Math.floor(count / 2)))}
            />
            <MetricCard
              width={cardWidth}
              title="Registrados"
              value={String(workers.length)}
              sub={`${tracking} activos`}
              icon="account-group"
              color="#8B5CF6"
              values={chartEntries.map(([, count]) => count + 2)}
            />
          </View>

          <View style={styles.twoColumn}>
            <StatusBreakdown
              total={workers.length}
              rows={[
                { label: 'En linea', value: online, color: '#00A896' },
                { label: 'Tracking ON', value: tracking, color: '#2F80ED' },
                { label: 'Criticas', value: criticalAlerts.length, color: '#F97316' },
                { label: 'Registrados', value: workers.length, color: '#8B5CF6' },
                { label: 'Sin senal', value: staleOrOff, color: '#94A3B8' },
              ]}
            />
            <View style={styles.panelCard}>
              <View style={styles.panelHeaderRow}>
                <View>
                  <Text style={styles.panelTitle}>Comparativa</Text>
                  <Text style={styles.panelSub}>Rendimiento de estados en los ultimos {periodDays} dias.</Text>
                </View>
                <View style={styles.smallSelect}>
                  <Text style={styles.smallSelectText}>{periodDays}d</Text>
                </View>
              </View>
              <ActivityBars entries={chartEntries} max={maxActivity} tall />
              <View style={styles.trendRow}>
                <Text style={styles.trendText}>
                  {comparison.current} vs {comparison.previous} contactos
                </Text>
                <Text style={[styles.trendBadge, currentTrendPct < 0 && styles.trendBadgeDown]}>
                  {currentTrendPct >= 0 ? '+' : ''}
                  {currentTrendPct}%
                </Text>
              </View>
            </View>
          </View>

          <RecentAlerts alerts={alertItems.slice(0, 3)} firstNameById={firstNameById} />
        </>
      ) : null}

      {tab === 'activity' ? (
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Actividad por dia</Text>
              <Text style={styles.panelSub}>Contactos, rutas y horas activas por periodo.</Text>
            </View>
            <Pressable style={styles.shareBtn}>
              <MaterialCommunityIcons name="share-variant" size={15} color={AppColors.navy} />
              <Text style={styles.shareText}>Compartir</Text>
            </Pressable>
          </View>
          <View style={styles.periodRow}>
            {[7, 14, 30].map((d) => (
              <Pressable key={d} onPress={() => setPeriodDays(d)} style={[styles.chip, periodDays === d && styles.chipOn]}>
                <Text style={[styles.chipText, periodDays === d && styles.chipTextOn]}>{d} dias</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.miniGrid}>
            <MiniMetric title="Rutas realizadas" value={String(activityTotal)} sub={`${currentTrendPct >= 0 ? '+' : ''}${currentTrendPct}% vs anterior`} icon="routes" color="#00A896" />
            <MiniMetric title="Horas activas" value={`${activeHours} h`} sub="+12% vs anterior" icon="clock-outline" color="#2F80ED" />
            <MiniMetric title="Promedio diario" value={avgDaily.toFixed(1)} sub="contactos por dia" icon="trending-up" color="#7C3AED" />
            <MiniMetric title="Contactos criticos" value={String(criticalAlerts.length)} sub="alertas activas" icon="pulse" color="#F97316" />
          </View>
          <View style={styles.chartPanel}>
            <Text style={styles.chartTitle}>Evolucion de actividad</Text>
            <ActivityBars entries={chartEntries} max={maxActivity} tall />
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.panelCardInner}>
              <Text style={styles.panelTitleSmall}>Actividad diaria</Text>
              <ActivityBars entries={chartEntries} max={maxActivity} />
            </View>
            <View style={styles.panelCardInner}>
              <Text style={styles.panelTitleSmall}>Detalle diario</Text>
              {chartEntries.map(([day, count]) => (
                <View key={`detail-${day}`} style={styles.detailRow}>
                  <View>
                    <Text style={styles.detailDay}>{dayLabel(day)} 2026</Text>
                    <Text style={styles.detailSub}>{weekdayLabel(day)}</Text>
                  </View>
                  <Text style={styles.detailValue}>{count} recorridos</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.comparisonStrip}>
            <MiniInline title="Tendencia" value={`${currentTrendPct >= 0 ? '+' : ''}${currentTrendPct}%`} icon="trending-up" />
            <MiniInline title="Tiempo activo" value={`${activeHours} h`} icon="clock-outline" />
            <MiniInline title="Distancia" value={`${distanceKm} km`} icon="map-marker-distance" />
            <MiniInline title="Conectados" value={String(tracking)} icon="cellphone-link" />
          </View>
        </View>
      ) : null}

      {tab === 'team' ? (
        <>
          <View style={styles.teamKpis}>
            <MiniMetric title="Total equipo" value={String(workers.length)} sub="Miembros activos" icon="account-group" color="#00A896" />
            <MiniMetric title="En campo ahora" value={String(tracking)} sub={`${workers.length ? Math.round((tracking / workers.length) * 100) : 0}% del equipo`} icon="map-marker" color="#2F80ED" />
            <MiniMetric title="Disponibles" value={String(trackingOff)} sub="Listos para asignacion" icon="check-circle-outline" color="#7C3AED" />
            <MiniMetric title="Sin conexion" value={String(staleOrOff)} sub="Ultima conexion > 1m" icon="sleep" color="#F97316" />
          </View>
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>Directorio del equipo</Text>
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nombre, correo o telefono..."
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
              />
            </View>
            {filteredTeam.map((item) => {
              const meta = statusText(item);
              const name = displayWorkerName(item, firstNameById);
              return (
                <View key={item.userId} style={styles.teamRow}>
                  <View style={[styles.avatar, { backgroundColor: meta.tone }]}>
                    <Text style={[styles.avatarText, { color: meta.color }]}>{name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.teamMain}>
                    <Text style={styles.teamName}>{name}</Text>
                    <Text style={styles.teamRole}>{item.email}</Text>
                    {!!phoneById[item.userId] ? <Text style={styles.teamPhone}>{phoneById[item.userId]}</Text> : null}
                  </View>
                  <View style={styles.teamStatus}>
                    <Text style={styles.teamMetaLabel}>Estado</Text>
                    <Text style={[styles.teamState, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.teamSub}>{meta.sub}</Text>
                  </View>
                  <View style={styles.teamLocation}>
                    <Text style={styles.teamMetaLabel}>Ubicacion</Text>
                    <Text style={styles.locationName}>{locationLabel(item)}</Text>
                    <Pressable
                      style={styles.mapBtn}
                      onPress={() => {
                        onOpenWorkerOnMap(item.userId);
                        navigation.navigate('Operations');
                      }}
                    >
                      <MaterialCommunityIcons name="map-outline" size={14} color={AppColors.navy} />
                      <Text style={styles.mapBtnText}>Mapa</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {tab === 'alerts' ? (
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Alertas de operacion</Text>
              <Text style={styles.panelSub}>Eventos recientes y estados que requieren seguimiento.</Text>
            </View>
            <View style={styles.alertCounter}>
              <Text style={styles.alertCounterText}>{alertItems.length}</Text>
            </View>
          </View>
          <View style={styles.alertKpis}>
            <MiniMetric title="Criticas" value={String(alertItems.filter((a) => a.level === 'Critica').length)} sub="Mayor prioridad" icon="alert-octagon" color="#EF4444" />
            <MiniMetric title="Advertencias" value={String(alertItems.filter((a) => a.level === 'Advertencia').length)} sub="Revisar pronto" icon="alert" color="#F97316" />
            <MiniMetric title="Informativas" value={String(alertItems.filter((a) => a.level === 'Info').length)} sub="Seguimiento" icon="information" color="#2F80ED" />
          </View>
          {alertItems.length === 0 ? (
            <Text style={styles.empty}>Sin alertas activas.</Text>
          ) : (
            alertItems.map((item) => <AlertCard key={`${item.worker.userId}-${item.title}`} item={item} firstNameById={firstNameById} />)
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TabBtn(props: { id: ReportsTab; label: string; tab: ReportsTab; onPress: (id: ReportsTab) => void }) {
  const active = props.id === props.tab;
  return (
    <Pressable onPress={() => props.onPress(props.id)} style={[styles.tabBtn, active && styles.tabBtnOn]}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextOn]}>{props.label}</Text>
    </Pressable>
  );
}

function SparkBars(props: { values: number[]; color: string }) {
  const max = Math.max(1, ...props.values);
  return (
    <View style={styles.sparkRow}>
      {props.values.slice(-7).map((v, i) => (
        <View
          key={`spark-${i}`}
          style={[
            styles.sparkBar,
            {
              height: Math.max(4, Math.round((v / max) * 22)),
              backgroundColor: props.color,
              opacity: 0.45 + i * 0.06,
            },
          ]}
        />
      ))}
    </View>
  );
}

function MetricCard(props: {
  width: number;
  title: string;
  value: string;
  sub: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  values: number[];
}) {
  return (
    <View style={[styles.metricCard, { width: props.width }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${props.color}22` }]}>
        <MaterialCommunityIcons name={props.icon} size={23} color={props.color} />
      </View>
      <Text style={styles.metricTitle}>{props.title}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
      <Text style={styles.metricSub}>{props.sub}</Text>
      <SparkBars values={props.values} color={props.color} />
    </View>
  );
}

function MiniMetric(props: {
  title: string;
  value: string;
  sub: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.miniMetric}>
      <View style={[styles.miniIcon, { backgroundColor: `${props.color}18` }]}>
        <MaterialCommunityIcons name={props.icon} size={20} color={props.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.miniTitle}>{props.title}</Text>
        <Text style={styles.miniValue}>{props.value}</Text>
        <Text style={[styles.miniSub, { color: props.color }]}>{props.sub}</Text>
      </View>
    </View>
  );
}

function MiniInline(props: { title: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return (
    <View style={styles.inlineMetric}>
      <MaterialCommunityIcons name={props.icon} size={18} color="#0F766E" />
      <Text style={styles.inlineTitle}>{props.title}</Text>
      <Text style={styles.inlineValue}>{props.value}</Text>
    </View>
  );
}

function ActivityBars(props: { entries: Array<[string, number]>; max: number; tall?: boolean }) {
  return (
    <View style={[styles.activityChart, props.tall && styles.activityChartTall]}>
      {props.entries.map(([day, count]) => {
        const height = Math.max(8, Math.round((count / props.max) * (props.tall ? 112 : 86)));
        const color = count === 0 ? '#CBD5E1' : count < props.max * 0.45 ? '#F59E0B' : '#009688';
        return (
          <View key={`bar-${day}`} style={styles.chartCol}>
            <Text style={styles.chartValue}>{count}</Text>
            <View style={[styles.chartBar, { height, backgroundColor: color }]} />
            <Text style={styles.chartLabel}>{dayLabel(day)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StatusBreakdown(props: { total: number; rows: Array<{ label: string; value: number; color: string }> }) {
  return (
    <View style={styles.panelCard}>
      <Text style={styles.panelTitle}>Estado general</Text>
      <View style={styles.statusBody}>
        <View style={styles.totalCircle}>
          <Text style={styles.totalCircleValue}>{props.total}</Text>
          <Text style={styles.totalCircleLabel}>Total</Text>
        </View>
        <View style={styles.statusList}>
          {props.rows.map((row) => {
            const pct = props.total > 0 ? Math.round((row.value / props.total) * 100) : 0;
            return (
              <View key={row.label} style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: row.color }]} />
                <Text style={styles.statusLabel}>{row.label}</Text>
                <Text style={styles.statusValue}>
                  {row.value} ({pct}%)
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function RecentAlerts(props: { alerts: AlertItem[]; firstNameById: Record<string, string> }) {
  return (
    <View style={styles.panelCard}>
      <View style={styles.panelHeaderRow}>
        <Text style={styles.panelTitle}>Alertas recientes</Text>
        <View style={styles.smallSelect}>
          <Text style={styles.smallSelectText}>Ver todas</Text>
        </View>
      </View>
      {props.alerts.length === 0 ? (
        <Text style={styles.empty}>Sin alertas recientes.</Text>
      ) : (
        props.alerts.map((item) => <AlertCard key={`recent-${item.worker.userId}-${item.title}`} item={item} firstNameById={props.firstNameById} compact />)
      )}
    </View>
  );
}

function AlertCard(props: { item: AlertItem; firstNameById: Record<string, string>; compact?: boolean }) {
  const { item } = props;
  return (
    <View style={styles.alertCard}>
      <View style={[styles.alertIconWrap, { backgroundColor: `${item.color}18` }]}>
        <MaterialCommunityIcons name={item.icon} size={21} color={item.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={styles.alertSub}>{item.detail}</Text>
        {!props.compact ? <Text style={styles.alertWorker}>{displayWorkerName(item.worker, props.firstNameById)}</Text> : null}
      </View>
      <View style={[styles.levelPill, { backgroundColor: `${item.color}16` }]}>
        <Text style={[styles.levelText, { color: item.color }]}>{item.level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, backgroundColor: '#F1F5F9', rowGap: 12 },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,194,168,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  sectionTagText: {
    color: AppColors.navy,
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  hero: {
    backgroundColor: '#0B1F35',
    borderRadius: 16,
    padding: 16,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBadgeText: { color: '#E2E8F0', fontWeight: '900', fontSize: 11 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5EEAD4' },
  title: { fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  sub: { marginTop: 6, color: 'rgba(226,232,240,0.86)', fontSize: 13, lineHeight: 18 },
  topRow: { gap: 12 },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EEF2F7' },
  tabBtnOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  tabBtnText: { color: '#64748B', fontWeight: '900', fontSize: 12 },
  tabBtnTextOn: { color: AppColors.navy },
  exportActions: { flexDirection: 'row', alignSelf: 'flex-end', gap: 8 },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  export: {
    minWidth: 58,
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: AppColors.navy,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  exportText: { fontWeight: '900', color: '#fff', fontSize: 12 },
  exportPdf: {
    minWidth: 66,
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: '#0F766E',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  exportPdfDisabled: { opacity: 0.45 },
  exportPdfText: { fontWeight: '900', color: '#fff', fontSize: 12 },
  kpiGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metricCard: {
    minHeight: 166,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  metricIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  metricTitle: { marginTop: 12, color: '#334155', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  metricValue: { marginTop: 8, color: '#0F172A', fontWeight: '900', fontSize: 30 },
  metricSub: { marginTop: 4, color: '#475569', fontWeight: '700', fontSize: 12 },
  sparkRow: { marginTop: 12, height: 26, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  sparkBar: { width: 8, borderRadius: 999 },
  twoColumn: { gap: 12 },
  panelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  panelCardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  panelTitleSmall: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginBottom: 8 },
  panelSub: { marginTop: 4, color: '#64748B', fontSize: 12, lineHeight: 17 },
  smallSelect: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  smallSelectText: { color: '#0F172A', fontWeight: '900', fontSize: 11 },
  statusBody: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 16 },
  totalCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 18,
    borderColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  totalCircleValue: { color: '#0F172A', fontWeight: '900', fontSize: 26 },
  totalCircleLabel: { color: '#64748B', fontWeight: '700', fontSize: 11 },
  statusList: { flex: 1, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, color: '#334155', fontSize: 12, fontWeight: '800' },
  statusValue: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
  activityChart: {
    minHeight: 122,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    paddingTop: 10,
  },
  activityChartTall: { minHeight: 166 },
  chartPanel: { marginTop: 12, paddingTop: 6 },
  chartTitle: { color: '#0F172A', fontWeight: '900', fontSize: 14, marginBottom: 4 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minWidth: 28 },
  chartValue: { color: '#0F172A', fontSize: 10, fontWeight: '900', marginBottom: 4 },
  chartBar: { width: 17, borderRadius: 999 },
  chartLabel: { marginTop: 7, color: '#475569', fontSize: 10, fontWeight: '800' },
  trendRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  trendBadge: { color: '#059669', fontSize: 12, fontWeight: '900' },
  trendBadgeDown: { color: '#DC2626' },
  periodRow: { marginTop: 12, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: '#EEF2F7' },
  chipOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  chipText: { color: '#64748B', fontWeight: '900', fontSize: 12 },
  chipTextOn: { color: AppColors.navy },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareText: { color: AppColors.navy, fontWeight: '900', fontSize: 12 },
  miniGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miniMetric: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  miniIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  miniTitle: { color: '#334155', fontWeight: '900', fontSize: 10 },
  miniValue: { color: '#0F172A', fontWeight: '900', fontSize: 22, marginTop: 4 },
  miniSub: { fontWeight: '800', fontSize: 10, marginTop: 2 },
  comparisonStrip: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineMetric: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inlineTitle: { marginTop: 6, color: '#475569', fontWeight: '900', fontSize: 10 },
  inlineValue: { marginTop: 3, color: '#0F172A', fontWeight: '900', fontSize: 18 },
  detailRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailDay: { color: '#0F172A', fontWeight: '900', fontSize: 12 },
  detailSub: { color: '#64748B', fontWeight: '700', fontSize: 10, textTransform: 'capitalize' },
  detailValue: { color: '#475569', fontWeight: '900', fontSize: 12 },
  teamKpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  searchRow: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: '#0F172A', fontWeight: '700' },
  teamRow: {
    marginTop: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '900' },
  teamMain: { flex: 1.1, minWidth: 0 },
  teamName: { color: '#0F172A', fontWeight: '900', fontSize: 14 },
  teamRole: { marginTop: 3, color: '#64748B', fontSize: 11, fontWeight: '700' },
  teamPhone: { marginTop: 3, color: '#2563EB', fontSize: 11, fontWeight: '900' },
  teamStatus: { flex: 0.9, minWidth: 0 },
  teamLocation: { flex: 0.9, minWidth: 0, alignItems: 'flex-start' },
  teamMetaLabel: { color: '#64748B', fontSize: 10, fontWeight: '900' },
  teamState: { marginTop: 3, fontWeight: '900', fontSize: 12 },
  teamSub: { marginTop: 2, color: '#64748B', fontWeight: '700', fontSize: 10 },
  locationName: { marginTop: 3, color: '#0F172A', fontWeight: '900', fontSize: 12 },
  mapBtn: {
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(0,194,168,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mapBtnText: { fontWeight: '900', color: AppColors.navy, fontSize: 11 },
  alertKpis: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  alertCounter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCounterText: { color: '#DC2626', fontWeight: '900' },
  alertCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  alertIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: '#0F172A', fontWeight: '900', fontSize: 13 },
  alertSub: { marginTop: 3, color: '#64748B', fontSize: 11, fontWeight: '700' },
  alertWorker: { marginTop: 3, color: '#334155', fontSize: 11, fontWeight: '900' },
  levelPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  levelText: { fontWeight: '900', fontSize: 10 },
  empty: { marginTop: 12, color: '#64748B', fontStyle: 'italic', fontWeight: '700' },
});
