import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserRole } from './userRole';
import { userRoleFromString } from './userRole';

const prefRemember = 'remember_credentials';
const prefEmail = 'saved_email';
const prefPassword = 'saved_password';
const prefRole = 'saved_role';

export type SavedCredentials = {
  remember: boolean;
  email: string;
  password: string;
  role: UserRole;
};

export async function loadSavedCredentials(): Promise<SavedCredentials> {
  const rememberRaw = await AsyncStorage.getItem(prefRemember);
  const remember = rememberRaw == null ? true : rememberRaw === 'true';

  if (!remember) {
    return { remember: false, email: '', password: '', role: 'worker' };
  }

  const email = (await AsyncStorage.getItem(prefEmail)) ?? '';
  const password = (await AsyncStorage.getItem(prefPassword)) ?? '';
  const roleRaw = await AsyncStorage.getItem(prefRole);
  const role = userRoleFromString(roleRaw) ?? 'worker';

  return { remember: true, email, password, role };
}

export async function saveCredentials(params: {
  remember: boolean;
  email: string;
  password: string;
  role: UserRole;
}): Promise<void> {
  const { remember, email, password, role } = params;
  await AsyncStorage.setItem(prefRemember, remember ? 'true' : 'false');
  if (remember) {
    await AsyncStorage.setItem(prefEmail, email);
    await AsyncStorage.setItem(prefPassword, password);
    await AsyncStorage.setItem(prefRole, role);
  } else {
    await AsyncStorage.multiRemove([prefEmail, prefPassword, prefRole]);
  }
}
