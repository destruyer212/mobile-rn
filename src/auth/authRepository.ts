import { getSupabaseClient } from '../lib/supabase';
import type { UserRole } from './userRole';
import { userRoleFromString } from './userRole';
import { RoleMismatchError } from './authErrors';

export type AuthResult = {
  userId: string;
  username: string;
  role: UserRole;
};

export async function signInWithPassword(params: {
  email: string;
  password: string;
  selectedRole: UserRole;
}): Promise<AuthResult> {
  const { email, password, selectedRole } = params;
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  const user = data.user;
  if (!user) {
    throw new Error('No se pudo iniciar sesion en Supabase.');
  }

  const roleFromMetadata = userRoleFromString(
    user.user_metadata?.role != null ? String(user.user_metadata.role) : undefined,
  );

  if (roleFromMetadata == null) {
    await supabase.auth.signOut();
    throw new Error(
      'Tu cuenta no tiene rol asignado. Pide al administrador que configure role en Supabase.',
    );
  }

  if (roleFromMetadata !== selectedRole) {
    await supabase.auth.signOut();
    throw new RoleMismatchError(selectedRole, roleFromMetadata);
  }

  return {
    userId: user.id,
    username: user.email ?? email,
    role: roleFromMetadata,
  };
}
