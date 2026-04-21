import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ManagedWorker } from '../../domain/managedWorker';
import { managedWorkerDisplayName } from '../../domain/managedWorker';
import { WorkerAdminRepository } from '../../data/workerAdminRepository';
import { canUseSupabaseAuth } from '../../lib/supabase';
import { AppColors } from '../../theme/colors';

const repo = new WorkerAdminRepository();

type Props = {
  username: string;
};

type Filter = 'all' | 'active' | 'suspended';

export function AdminTeamTab({ username: _username }: Props) {
  const [workers, setWorkers] = useState<ManagedWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedWorker | null>(null);

  const load = useCallback(async () => {
    if (!canUseSupabaseAuth()) return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await repo.listWorkers();
      setWorkers(list);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return workers.filter((w) => {
      if (filter === 'active' && w.suspended) return false;
      if (filter === 'suspended' && !w.suspended) return false;
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return (
        managedWorkerDisplayName(w).toLowerCase().includes(s) ||
        w.email.toLowerCase().includes(s) ||
        w.employeeCode.toLowerCase().includes(s) ||
        w.phone.includes(s)
      );
    });
  }, [workers, filter, q]);

  const activeCount = workers.filter((w) => !w.suspended).length;
  const suspendedCount = workers.filter((w) => w.suspended).length;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(w: ManagedWorker) {
    setEditing(w);
    setModalOpen(true);
  }

  async function toggleSuspend(w: ManagedWorker) {
    try {
      await repo.setSuspended(w.id, !w.suspended);
      await load();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  }

  async function remove(w: ManagedWorker) {
    Alert.alert(
      'Eliminar trabajador',
      `Se eliminara la cuenta de ${managedWorkerDisplayName(w)} (${w.email}). Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await repo.deleteWorker(w.id);
              await load();
            } catch (e) {
              Alert.alert('Error', String(e));
            }
          },
        },
      ],
    );
  }

  if (!canUseSupabaseAuth()) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Configura Supabase para gestionar personal.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Gestion de equipo</Text>
          <Text style={styles.subtitle}>Altas, edicion y control operativo de personal.</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable onPress={() => void load()} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>Actualizar</Text>
          </Pressable>
          <Pressable onPress={openCreate} style={styles.createBtn}>
            <Text style={styles.createBtnText}>+ Nuevo</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total</Text>
          <Text style={styles.kpiValue}>{workers.length}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Activos</Text>
          <Text style={styles.kpiValue}>{activeCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Suspendidos</Text>
          <Text style={styles.kpiValue}>{suspendedCount}</Text>
        </View>
      </View>

      <TextInput value={q} onChangeText={setQ} placeholder="Buscar..." placeholderTextColor="#9CA3AF" style={styles.search} />

      <View style={styles.filters}>
        {(['all', 'active', 'suspended'] as const).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Suspendidos'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 18 }} />
      ) : loadError ? (
        <Text style={styles.err}>{loadError}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {visible.length === 0 ? (
            <Text style={styles.empty}>No hay trabajadores para este filtro.</Text>
          ) : null}
          {visible.map((w) => (
            <View key={w.id} style={styles.card}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{managedWorkerDisplayName(w)}</Text>
                <Text style={styles.email} numberOfLines={1}>
                  {w.email}
                </Text>
                {w.suspended ? <Text style={styles.badge}>Suspendido</Text> : null}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(w)} style={styles.miniBtn}>
                  <Text style={styles.miniBtnText}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => void toggleSuspend(w)} style={styles.miniBtn}>
                  <Text style={styles.miniBtnText}>{w.suspended ? 'Activar' : 'Suspender'}</Text>
                </Pressable>
                <Pressable onPress={() => void remove(w)} style={[styles.miniBtn, styles.danger]}>
                  <Text style={[styles.miniBtnText, { color: '#fff' }]}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <WorkerFormModal
        visible={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={async () => {
          setModalOpen(false);
          await load();
        }}
      />
    </View>
  );
}

function WorkerFormModal(props: {
  visible: boolean;
  initial: ManagedWorker | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { visible, initial, onClose, onSaved } = props;
  const isEdit = initial != null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmail(initial?.email ?? '');
    setPassword('');
    setFullName(initial?.fullName ?? '');
    setPhone(initial?.phone ?? '');
    setJobTitle(initial?.jobTitle ?? '');
    setNotes(initial?.notes ?? '');
    setEmployeeCode(initial?.employeeCode ?? '');
  }, [visible, initial]);

  async function submit() {
    const e = email.trim();
    if (!e.includes('@')) {
      Alert.alert('Validacion', 'Ingresa un correo valido.');
      return;
    }
    if (!isEdit && password.length < 6) {
      Alert.alert('Validacion', 'La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (!fullName.trim()) {
      Alert.alert('Validacion', 'Ingresa el nombre completo.');
      return;
    }

    setBusy(true);
    try {
      if (isEdit && initial) {
        await repo.updateWorker({
          userId: initial.id,
          email: e,
          password: password.length > 0 ? password : undefined,
          fullName: fullName.trim(),
          phone,
          jobTitle,
          notes,
          employeeCode,
        });
      } else {
        await repo.createWorker({
          email: e,
          password,
          fullName: fullName.trim(),
          phone,
          jobTitle,
          notes,
          employeeCode,
        });
      }
      await onSaved();
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mStyles.backdrop}>
        <View style={mStyles.sheet}>
          <Text style={mStyles.sheetTitle}>{isEdit ? 'Editar trabajador' : 'Nuevo trabajador'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <Field label={isEdit ? 'Nueva contrasena (opcional)' : 'Contrasena'} value={password} onChangeText={setPassword} secureTextEntry />
            <Field label="Nombre completo" value={fullName} onChangeText={setFullName} />
            <Field label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Puesto" value={jobTitle} onChangeText={setJobTitle} />
            <Field label="Codigo empleado" value={employeeCode} onChangeText={setEmployeeCode} />
            <Field label="Notas" value={notes} onChangeText={setNotes} multiline />
          </ScrollView>
          <View style={mStyles.row}>
            <Pressable onPress={onClose} style={[mStyles.btn, mStyles.btnGhost]}>
              <Text style={mStyles.btnGhostText}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => void submit()} disabled={busy} style={[mStyles.btn, mStyles.btnPrimary]}>
              {busy ? <ActivityIndicator color={AppColors.navy} /> : <Text style={mStyles.btnPrimaryText}>{isEdit ? 'Guardar' : 'Crear'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'phone-pad';
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={mStyles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize}
        keyboardType={props.keyboardType}
        multiline={props.multiline}
        style={[mStyles.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  muted: { color: '#6B7280', textAlign: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '900', color: AppColors.navy, flex: 1 },
  subtitle: { marginTop: 2, color: '#6B7280', fontSize: 12, lineHeight: 16 },
  createBtn: { backgroundColor: AppColors.accent, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  createBtnText: { fontWeight: '900', color: AppColors.navy },
  refreshBtn: { backgroundColor: '#EEF2F7', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  refreshBtnText: { fontWeight: '900', color: AppColors.navy, fontSize: 12 },
  kpiRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    padding: 10,
  },
  kpiLabel: { color: '#6B7280', fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  kpiValue: { marginTop: 6, color: AppColors.navy, fontWeight: '900', fontSize: 18 },
  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  filters: { marginTop: 12, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F3F4F6' },
  chipOn: { backgroundColor: 'rgba(0,194,168,0.2)' },
  chipText: { fontWeight: '800', color: '#6B7280', fontSize: 12 },
  chipTextOn: { color: AppColors.navy },
  err: { marginTop: 12, color: '#B91C1C' },
  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  name: { fontSize: 15, fontWeight: '900', color: '#111827' },
  email: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  badge: { marginTop: 8, alignSelf: 'flex-start', fontSize: 11, fontWeight: '900', color: '#B45309' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F3F4F6' },
  miniBtnText: { fontWeight: '900', fontSize: 12, color: AppColors.navy },
  danger: { backgroundColor: '#C62828' },
  empty: {
    marginTop: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

const mStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '92%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: AppColors.navy },
  label: { fontSize: 12, fontWeight: '800', color: '#374151' },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  row: { marginTop: 12, flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: '#F3F4F6' },
  btnGhostText: { fontWeight: '900', color: '#111827' },
  btnPrimary: { backgroundColor: AppColors.accent },
  btnPrimaryText: { fontWeight: '900', color: AppColors.navy },
});
