-- Fleet Control - fix rapido para la pestaña Gestion de equipo.
-- Ejecutar en Supabase Dashboard > SQL Editor.
--
-- Esto permite que la app admin lea y actualice public.profiles aunque la
-- Edge Function admin-manage-workers falle o no este desplegada.

begin;

alter table public.profiles add column if not exists account_status text default 'active';
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles
set account_status = 'active'
where account_status is null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "profiles_admin_insert_all" on public.profiles;

create policy "profiles_admin_select_all"
on public.profiles for select to authenticated
using (public.fleet_is_admin());

create policy "profiles_admin_update_all"
on public.profiles for update to authenticated
using (public.fleet_is_admin())
with check (public.fleet_is_admin());

create policy "profiles_admin_insert_all"
on public.profiles for insert to authenticated
with check (public.fleet_is_admin());

commit;
