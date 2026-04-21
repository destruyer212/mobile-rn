import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { getClientKey, getEffectiveUrl, isSupabaseConfigured } from '../config/supabaseConfig';

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no configurado. Revisa URL y clave en supabaseConfig.');
  }
  if (!client) {
    client = createClient(getEffectiveUrl(), getClientKey(), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export function canUseSupabaseAuth(): boolean {
  return isSupabaseConfigured();
}
