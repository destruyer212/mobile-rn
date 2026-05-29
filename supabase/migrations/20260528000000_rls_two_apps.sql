-- Fleet Control — RLS para dos apps (worker + admin)
-- Aplicar en Supabase SQL Editor o: supabase db push (si usas CLI vinculada)
-- Revisa nombres de políticas existentes antes de ejecutar en producción.

-- Helpers JWT (user_metadata.role)
create or replace function public.fleet_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'admin';
$$;

create or replace function public.fleet_is_worker()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'worker';
$$;

grant execute on function public.fleet_is_admin() to authenticated;
grant execute on function public.fleet_is_worker() to authenticated;

-- ---------------------------------------------------------------------------
-- worker_locations
-- ---------------------------------------------------------------------------
alter table if exists public.worker_locations enable row level security;

drop policy if exists "worker_locations_worker_select_own" on public.worker_locations;
drop policy if exists "worker_locations_worker_insert_own" on public.worker_locations;
drop policy if exists "worker_locations_worker_update_own" on public.worker_locations;
drop policy if exists "worker_locations_admin_select_all" on public.worker_locations;

create policy "worker_locations_worker_select_own"
on public.worker_locations for select to authenticated
using (auth.uid() = user_id and public.fleet_is_worker());

create policy "worker_locations_worker_insert_own"
on public.worker_locations for insert to authenticated
with check (auth.uid() = user_id and public.fleet_is_worker());

create policy "worker_locations_worker_update_own"
on public.worker_locations for update to authenticated
using (auth.uid() = user_id and public.fleet_is_worker())
with check (auth.uid() = user_id and public.fleet_is_worker());

create policy "worker_locations_admin_select_all"
on public.worker_locations for select to authenticated
using (public.fleet_is_admin());

-- ---------------------------------------------------------------------------
-- worker_location_history (opcional)
-- ---------------------------------------------------------------------------
alter table if exists public.worker_location_history enable row level security;

drop policy if exists "worker_location_history_worker_insert_own" on public.worker_location_history;
drop policy if exists "worker_location_history_worker_select_own" on public.worker_location_history;
drop policy if exists "worker_location_history_admin_select_all" on public.worker_location_history;

create policy "worker_location_history_worker_insert_own"
on public.worker_location_history for insert to authenticated
with check (auth.uid() = user_id and public.fleet_is_worker());

create policy "worker_location_history_worker_select_own"
on public.worker_location_history for select to authenticated
using (auth.uid() = user_id and public.fleet_is_worker());

create policy "worker_location_history_admin_select_all"
on public.worker_location_history for select to authenticated
using (public.fleet_is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table if exists public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_admin_select_all"
on public.profiles for select to authenticated
using (public.fleet_is_admin());

-- ---------------------------------------------------------------------------
-- operational_base (solo admin)
-- ---------------------------------------------------------------------------
alter table if exists public.operational_base enable row level security;

drop policy if exists "operational_base_admin_select" on public.operational_base;
drop policy if exists "operational_base_admin_write" on public.operational_base;

create policy "operational_base_admin_select"
on public.operational_base for select to authenticated
using (public.fleet_is_admin());

create policy "operational_base_admin_write"
on public.operational_base for all to authenticated
using (public.fleet_is_admin())
with check (public.fleet_is_admin());

-- ---------------------------------------------------------------------------
-- admin_audit_log (solo admin)
-- ---------------------------------------------------------------------------
alter table if exists public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_log_admin_select" on public.admin_audit_log;
drop policy if exists "admin_audit_log_admin_insert" on public.admin_audit_log;

create policy "admin_audit_log_admin_select"
on public.admin_audit_log for select to authenticated
using (public.fleet_is_admin());

create policy "admin_audit_log_admin_insert"
on public.admin_audit_log for insert to authenticated
with check (public.fleet_is_admin());
