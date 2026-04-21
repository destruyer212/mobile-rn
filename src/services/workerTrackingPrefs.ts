import AsyncStorage from '@react-native-async-storage/async-storage';

function key(userId: string) {
  return `worker_tracking_desired_${userId}`;
}

export async function setTrackingDesired(userId: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(key(userId), value ? 'true' : 'false');
}

export async function isTrackingDesired(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(key(userId));
  return v === 'true';
}
