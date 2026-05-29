import * as Notifications from 'expo-notifications';

let initialized = false;
let notificationId = 2000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initializeLocalNotifications(): Promise<void> {
  if (initialized) return;
  await Notifications.requestPermissionsAsync();
  initialized = true;
}

export async function showGenericNotification(params: {
  title: string;
  body: string;
}): Promise<void> {
  if (!initialized) {
    await initializeLocalNotifications();
  }
  notificationId += 1;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      sound: 'default',
    },
    trigger: null,
    identifier: String(notificationId),
  });
}

export async function showWorkerDisconnectedNotification(workerLabel: string): Promise<void> {
  await showGenericNotification({
    title: 'Trabajador desconectado',
    body: `${workerLabel} dejo de enviar ubicacion.`,
  });
}
