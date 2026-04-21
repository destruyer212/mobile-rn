import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

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
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (Platform.OS === 'android') {
      return bg.status === Location.PermissionStatus.GRANTED;
    }
  } catch {
    // En algunas builds no aplica; con primer plano sigue funcional.
  }
  return true;
}
