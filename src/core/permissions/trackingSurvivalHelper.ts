import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';

async function confirm(title: string, message: string): Promise<boolean> {
  return await new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continuar', onPress: () => resolve(true) },
    ]);
  });
}

export async function ensureAndroidTrackingSurvivalPrerequisites(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.requestPermissionsAsync();

  const accepted = await confirm(
    'Seguimiento sin interrupciones',
    'En muchos telefonos Android el sistema limita apps en segundo plano para ahorrar bateria. Si notas cortes, excluye Fleet Control de optimizacion de bateria.',
  );
  if (!accepted) return;

  Alert.alert(
    'Siguiente paso',
    'Abre Ajustes del telefono y desactiva optimizacion de bateria para Fleet Control para mejorar el seguimiento en segundo plano.',
  );
}
