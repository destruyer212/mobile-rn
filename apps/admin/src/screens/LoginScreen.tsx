import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  friendlyAuthErrorMessage,
  loadSavedCredentials,
  saveCredentials,
  signInWithPassword,
} from '@fleet/shared-auth';
import { canUseSupabaseAuth } from '@fleet/shared-lib';
import { AppColors } from '@fleet/shared-ui';

import type { AdminStackParamList } from '../navigation/types';

const FIXED_ROLE = 'admin' as const;

type Props = {
  navigation: NativeStackNavigationProp<AdminStackParamList, 'Login'>;
};

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedCredentials();
      setRememberCredentials(saved.remember);
      setEmail(saved.email);
      setPassword(saved.password);
    })();
  }, []);

  async function submit() {
    setAttemptedSubmit(true);
    setBanner(null);
    const eErr = email.trim().length === 0 ? 'Ingresa tu correo.' : !email.includes('@') ? 'Ingresa un correo valido.' : null;
    const pErr = password.length === 0 ? 'Ingresa tu contrasena.' : null;
    if (eErr || pErr) {
      setBanner(eErr ?? pErr);
      return;
    }

    const trimmedEmail = email.trim();
    setLoading(true);
    try {
      if (canUseSupabaseAuth()) {
        const result = await signInWithPassword({
          email: trimmedEmail,
          password,
          selectedRole: FIXED_ROLE,
        });
        if (result.role !== 'admin') {
          setBanner('Esta cuenta no tiene perfil de administrador.');
          return;
        }
        await saveCredentials({
          remember: rememberCredentials,
          email: trimmedEmail,
          password,
          role: FIXED_ROLE,
        });
        navigation.reset({
          index: 0,
          routes: [{ name: 'AdminHome', params: { username: result.username, role: result.role } }],
        });
      } else {
        setBanner('Supabase no configurado. Modo demo local (admin).');
        await saveCredentials({
          remember: rememberCredentials,
          email: trimmedEmail,
          password,
          role: FIXED_ROLE,
        });
        navigation.reset({
          index: 0,
          routes: [{ name: 'AdminHome', params: { username: trimmedEmail, role: FIXED_ROLE } }],
        });
      }
    } catch (err) {
      setBanner(friendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient
      colors={[AppColors.navy, AppColors.navyLight, '#1A3A5C']}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/branding/app_icon.png')} style={styles.logo} resizeMode="cover" />
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Modo supervision</Text>
          </View>
          <Text style={styles.title}>Fleet Control Admin</Text>
          <Text style={styles.subtitle}>Mapa en vivo, equipo, reportes y centro de control</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Acceso administrador</Text>
            <Text style={styles.cardHint}>Solo cuentas con rol admin en Supabase.</Text>

            <Text style={styles.label}>Correo</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="admin@empresa.com"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            {attemptedSubmit && email.trim().length === 0 ? (
              <Text style={styles.fieldError}>Ingresa tu correo.</Text>
            ) : null}
            {attemptedSubmit && email.trim().length > 0 && !email.includes('@') ? (
              <Text style={styles.fieldError}>Ingresa un correo valido.</Text>
            ) : null}

            <Text style={[styles.label, { marginTop: 12 }]}>Contrasena</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={hidePassword}
                placeholder="********"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.inputFlex]}
              />
              <TouchableOpacity
                onPress={() => setHidePassword((v) => !v)}
                style={styles.eyeBtn}
                accessibilityRole="button"
              >
                <Text style={styles.eyeText}>{hidePassword ? 'Ver' : 'Ocultar'}</Text>
              </TouchableOpacity>
            </View>
            {attemptedSubmit && password.length === 0 ? (
              <Text style={styles.fieldError}>Ingresa tu contrasena.</Text>
            ) : null}

            <View style={styles.rememberRow}>
              <Switch value={rememberCredentials} onValueChange={setRememberCredentials} />
              <View style={styles.rememberTextWrap}>
                <Text style={styles.rememberTitle}>Recordar usuario y contrasena</Text>
                <Text style={styles.rememberSub}>Se autocompleta al volver a abrir la app</Text>
              </View>
            </View>

            {banner ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={() => void submit()}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={AppColors.navy} />
              ) : (
                <Text style={styles.primaryBtnText}>Entrar al panel</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>App exclusiva de administradores · sin modo trabajador</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoWrap: {
    marginTop: 8,
    padding: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(0, 194, 168, 0.5)',
    backgroundColor: 'rgba(0, 194, 168, 0.15)',
  },
  logo: { width: 76, height: 76, borderRadius: 38 },
  badge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 194, 168, 0.2)',
  },
  badgeText: {
    color: AppColors.onDark,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 20,
    fontSize: 26,
    fontWeight: '800',
    color: AppColors.onDark,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: 'rgba(232, 236, 242, 0.75)',
    fontSize: 15,
    maxWidth: 320,
  },
  card: {
    marginTop: 28,
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: AppColors.navy },
  cardHint: { marginTop: 6, fontSize: 13, color: '#374151' },
  label: { marginTop: 18, fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    backgroundColor: '#F9FBFF',
    fontSize: 15,
    color: '#111827',
  },
  inputFlex: { flex: 1, marginTop: 0 },
  passwordRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { paddingHorizontal: 10, paddingVertical: 12 },
  eyeText: { color: AppColors.navyLight, fontWeight: '600', fontSize: 13 },
  fieldError: { marginTop: 6, color: '#B91C1C', fontSize: 12, fontWeight: '500' },
  rememberRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rememberTextWrap: { flex: 1 },
  rememberTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  rememberSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  banner: {
    marginTop: 12,
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 14,
  },
  bannerText: { color: '#fff', fontWeight: '500', fontSize: 13 },
  primaryBtn: {
    marginTop: 22,
    backgroundColor: AppColors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryBtnDisabled: { opacity: 0.75 },
  primaryBtnText: { color: AppColors.navy, fontWeight: '700', fontSize: 15 },
  footer: { marginTop: 24, fontSize: 12, color: 'rgba(232, 236, 242, 0.45)', textAlign: 'center' },
});
