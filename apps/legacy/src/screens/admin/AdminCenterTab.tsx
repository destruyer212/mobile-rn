import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { can } from '@fleet/shared-auth';
import type { UserRole } from '@fleet/shared-auth';
import { LocationRepository } from '@fleet/shared-data';
import type { AdminAuditEntry } from '@fleet/shared-data';
import type { AdminHealthSnapshot } from '@fleet/shared-data';
import type { OperationalBase } from '@fleet/shared-domain';
import { isOperationalBaseConfigured } from '@fleet/shared-domain';
import { canUseSupabaseAuth, getSupabaseClient } from '@fleet/shared-lib';
import type { RootStackParamList } from '../../navigation/types';
import { AppColors } from '@fleet/shared-ui';

const repo = new LocationRepository();

type Props = {
  username: string;
  role: UserRole;
};

export function AdminCenterTab({ username, role }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const version = `${Constants.expoConfig?.version ?? '1.0.0'}`;

  const [base, setBase] = useState<OperationalBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [health, setHealth] = useState<AdminHealthSnapshot | null>(null);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);

  function formatLocalDateTime(d: Date | null): string {
    if (!d) return '—';
    const l = new Date(d);
    const dd = String(l.getDate()).padStart(2, '0');
    const mm = String(l.getMonth() + 1).padStart(2, '0');
    const yyyy = l.getFullYear();
    const hh = String(l.getHours()).padStart(2, '0');
    const min = String(l.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  const load = useCallback(async () => {
    if (!canUseSupabaseAuth()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const b = await repo.fetchOperationalBase();
      setBase(b);
      if (can(role, 'health.view')) {
        const snapshot = await repo.fetchAdminHealthSnapshot();
        setHealth(snapshot);
      }
      if (can(role, 'audit.view')) {
        const logs = await repo.fetchRecentAdminAuditLogs();
        setAuditEntries(logs);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  function openRename() {
    if (!base) return;
    setRenameText(base.name);
    setRenameOpen(true);
  }

  async function saveRename() {
    if (!base) return;
    const next = renameText.trim();
    const name = next.length > 0 ? next : 'Base operativa';
    try {
      await repo.upsertOperationalBase({
        name,
        enabled: base.enabled,
        latitude: base.latitude ?? undefined,
        longitude: base.longitude ?? undefined,
        radiusMeters: base.radiusMeters,
      });
      void repo.logAdminAction({
        actorEmail: username,
        action: 'base_renamed_from_center',
        metadata: { name },
      });
      setRenameOpen(false);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function signOut() {
    if (canUseSupabaseAuth()) {
      await getSupabaseClient().auth.signOut();
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      }),
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: Math.max(14, insets.top + 10), paddingBottom: Math.max(28, insets.bottom + 18) },
      ]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={AppColors.accent} />}
    >
      <View style={styles.sectionTag}>
        <Text style={styles.sectionTagText}>Administracion</Text>
      </View>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Centro de control</Text>
        <Text style={styles.heroSub}>Fleet Control · datos internos</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.k}>Sesion</Text>
        <Text style={styles.v}>{username}</Text>
        <Text style={styles.meta}>Rol: {role === 'admin' ? 'Administrador' : 'Trabajador'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.k}>Version</Text>
        <Text style={styles.v}>{version}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.k}>Permisos de producto</Text>
        <Text style={styles.meta}>Gestion equipo: {can(role, 'team.manage') ? 'Si' : 'No'}</Text>
        <Text style={styles.meta}>Editar base: {can(role, 'base.edit') ? 'Si' : 'No'}</Text>
        <Text style={styles.meta}>Exporte PDF ejecutivo: {can(role, 'reports.export.pdf') ? 'Si' : 'No'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.k}>Dashboard health</Text>
        {!can(role, 'health.view') ? (
          <Text style={styles.meta}>Sin permisos para vista de health.</Text>
        ) : !health ? (
          <Text style={styles.meta}>Cargando metricas...</Text>
        ) : (
          <>
            <Text style={styles.meta}>Ubicaciones online: {health.workerLocationsOnline}</Text>
            <Text style={styles.meta}>Ubicaciones totales: {health.workerLocationsTotal}</Text>
            <Text style={styles.meta}>Unidades stale: {health.staleWorkers}</Text>
            <Text style={styles.meta}>Base configurada: {health.baseConfigured ? 'Si' : 'No'}</Text>
            <Text style={styles.meta}>Chequeado: {formatLocalDateTime(health.checkedAt)}</Text>
          </>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.k}>Audit log</Text>
        {!can(role, 'audit.view') ? (
          <Text style={styles.meta}>Sin permisos para visualizar auditoria.</Text>
        ) : auditEntries.length === 0 ? (
          <Text style={styles.meta}>Sin eventos recientes o tabla no disponible.</Text>
        ) : (
          auditEntries.map((entry, idx) => (
            <Text key={`${entry.actorEmail}-${entry.action}-${idx}`} style={styles.meta}>
              {formatLocalDateTime(entry.createdAt)} · {entry.actorEmail} · {entry.action}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.k}>Base operativa</Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!canUseSupabaseAuth() ? (
          <Text style={styles.muted}>Sin Supabase no se puede leer la base.</Text>
        ) : (
          <>
            <Text style={styles.v}>{base?.name ?? '—'}</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    base && isOperationalBaseConfigured(base)
                      ? 'rgba(15,157,88,0.14)'
                      : 'rgba(180,83,9,0.14)',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: base && isOperationalBaseConfigured(base) ? '#0F9D58' : '#B45309' },
                ]}
              >
                {base ? (isOperationalBaseConfigured(base) ? 'Base configurada' : 'Base incompleta') : 'Sin datos de base'}
              </Text>
            </View>
            <Text style={styles.meta}>
              Estado: {base ? (isOperationalBaseConfigured(base) ? 'Configurada' : 'No configurada') : '—'}
            </Text>
            <Text style={styles.meta}>
              Activa: {base?.enabled ? 'Si' : 'No'}
            </Text>
            <Text style={styles.meta}>
              Centro: {base?.latitude != null && base?.longitude != null
                ? `${base.latitude.toFixed(6)}, ${base.longitude.toFixed(6)}`
                : 'No definido'}
            </Text>
            <Text style={styles.meta}>
              Radio: {base?.radiusMeters != null ? `${Math.round(base.radiusMeters)} m` : '—'}
            </Text>
            <Text style={styles.meta}>
              Ultima actualizacion: {formatLocalDateTime(base?.updatedAt ?? null)}
            </Text>
            <Pressable onPress={openRename} style={styles.btn}>
              <Text style={styles.btnText}>Editar nombre</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.signOutText}>Cerrar sesion</Text>
      </Pressable>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nombre de la base</Text>
            <Text style={styles.modalHint}>El centro del mapa y el radio no cambian; solo el nombre visible.</Text>
            <TextInput value={renameText} onChangeText={setRenameText} style={styles.modalInput} placeholder="Base operativa" />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setRenameOpen(false)} style={[styles.modalBtn, styles.modalGhost]}>
                <Text style={styles.modalGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={() => void saveRename()} style={[styles.modalBtn, styles.modalPrimary]}>
                <Text style={styles.modalPrimaryText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
    marginBottom: 8,
  },
  sectionTagText: {
    color: AppColors.navy,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  hero: { backgroundColor: AppColors.navy, borderRadius: 16, padding: 16, marginBottom: 12, marginTop: 6 },
  heroTitle: { color: AppColors.onDark, fontSize: 22, fontWeight: '900' },
  heroSub: { marginTop: 6, color: 'rgba(232,236,242,0.75)', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  k: { fontSize: 11, fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' },
  v: { marginTop: 8, fontSize: 15, fontWeight: '800', color: '#111827' },
  statusPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: { fontWeight: '800', fontSize: 12 },
  meta: { marginTop: 6, color: '#4B5563', fontSize: 12 },
  muted: { marginTop: 8, color: '#6B7280' },
  err: { marginTop: 8, color: '#B91C1C' },
  btn: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: 'rgba(0,194,168,0.15)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  btnText: { fontWeight: '900', color: AppColors.navy },
  signOut: { marginTop: 18, backgroundColor: '#111827', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  signOutText: { color: '#fff', fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: AppColors.navy },
  modalHint: { marginTop: 8, fontSize: 13, color: '#4B5563', lineHeight: 18 },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  modalRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  modalGhost: { backgroundColor: '#F3F4F6' },
  modalPrimary: { backgroundColor: AppColors.accent },
  modalGhostText: { fontWeight: '900', color: '#111827' },
  modalPrimaryText: { fontWeight: '900', color: AppColors.navy },
});

