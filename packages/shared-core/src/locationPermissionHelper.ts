import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

let startupPromptDone = false;

async function confirm(title: string, message: string): Promise<boolean> {
  return await new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continuar', onPress: () => resolve(true) },
    ]);
  });
}

export async function ensureLocationPermissionExplained(params?: {
  requireBackground?: boolean;
}): Promise<boolean> {
  const requireBackground = params?.requireBackground ?? false;

  const beforeFg = await Location.getForegroundPermissionsAsync();
  if (beforeFg.status === Location.PermissionStatus.GRANTED && !requireBackground) {
    return true;
  }

  const accepted = await confirm(
    'Permiso de ubicacion',
    'Para que el administrador vea tu posicion en el mapa mientras trabajas, necesitamos acceso a la ubicacion del telefono.\n\nSolo se usa cuando activas el seguimiento.',
  );
  if (!accepted) return false;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    if (!fg.canAskAgain) {
      Alert.alert(
        'Ubicacion desactivada',
        'El permiso de ubicacion esta bloqueado. Activalo en Ajustes para usar seguimiento.',
        [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
        ],
      );
    }
    return false;
  }

  if (!requireBackground) return true;

  try {
    const currentBg = await Location.getBackgroundPermissionsAsync();
    if (currentBg.status === Location.PermissionStatus.GRANTED) {
      return true;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (Platform.OS === 'android') {
      if (bg.status === Location.PermissionStatus.GRANTED) return true;
      if (!bg.canAskAgain) {
        Alert.alert(
          'Permiso de segundo plano bloqueado',
          'Para seguir enviando ubicacion aun con la app cerrada, activa "Permitir todo el tiempo" en Ajustes.',
          [
            { text: 'Cerrar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
          ],
        );
      }
      return false;
    }
  } catch {
    // En algunas builds no aplica; con primer plano sigue funcional.
  }
  return true;
}

export async function requestLocationPermissionOnAppStart(): Promise<void> {
  if (startupPromptDone) return;
  startupPromptDone = true;

  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === Location.PermissionStatus.GRANTED) return;
    if (!current.canAskAgain) return;

    await Location.requestForegroundPermissionsAsync();
  } catch {
    // Si falla, no bloqueamos el arranque.
  }
}
