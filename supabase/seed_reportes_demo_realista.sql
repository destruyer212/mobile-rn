-- Fleet Control - seed demo realista para Reportes, Operaciones y Equipo.
-- Ejecutar en Supabase Dashboard > SQL Editor.
--
-- Crea 18 trabajadores DEMO, ubicaciones actuales, historial de 14 dias,
-- base operativa y auditoria. Los correos usan @fleet-demo.local para no
-- confundirse con personas reales.
--
-- Login demo de trabajadores creados por este script:
--   correo: cualquier worker*.@fleet-demo.local
--   password: FleetDemo123!

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  job_title text,
  notes text,
  employee_code text,
  role text default 'worker',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists notes text;
alter table public.profiles add column if not exists employee_code text;
alter table public.profiles add column if not exists role text default 'worker';
alter table public.profiles add column if not exists account_status text default 'active';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.worker_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  latitude double precision,
  longitude double precision,
  is_tracking boolean default false,
  updated_at timestamptz default now()
);

alter table public.worker_locations add column if not exists email text;
alter table public.worker_locations add column if not exists latitude double precision;
alter table public.worker_locations add column if not exists longitude double precision;
alter table public.worker_locations add column if not exists is_tracking boolean default false;
alter table public.worker_locations add column if not exists updated_at timestamptz default now();

create table if not exists public.worker_location_history (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  latitude double precision,
  longitude double precision,
  is_tracking boolean default true,
  speed_kmh numeric(6,2),
  battery_level integer,
  accuracy_meters numeric(6,2),
  updated_at timestamptz default now()
);

alter table public.worker_location_history add column if not exists email text;
alter table public.worker_location_history add column if not exists is_tracking boolean default true;
alter table public.worker_location_history add column if not exists speed_kmh numeric(6,2);
alter table public.worker_location_history add column if not exists battery_level integer;
alter table public.worker_location_history add column if not exists accuracy_meters numeric(6,2);

create table if not exists public.operational_base (
  id integer primary key,
  name text,
  enabled boolean default true,
  latitude double precision,
  longitude double precision,
  radius_meters integer default 1200,
  updated_at timestamptz default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_email text,
  action text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

drop table if exists _fleet_demo_workers;

create temp table _fleet_demo_workers (
  sort_order integer primary key,
  id uuid not null,
  email text not null,
  full_name text not null,
  phone text not null,
  job_title text not null,
  employee_code text not null,
  zone text not null,
  notes text not null,
  latitude double precision not null,
  longitude double precision not null,
  is_tracking boolean not null,
  last_seen_seconds integer not null,
  battery_level integer not null
) on commit preserve rows;

insert into _fleet_demo_workers
  (sort_order, id, email, full_name, phone, job_title, employee_code, zone, notes, latitude, longitude, is_tracking, last_seen_seconds, battery_level)
values
  (1,  '10000000-0000-4000-8000-000000000001', 'worker01@fleet-demo.local', 'Luis Ramirez',      '+51 946 204 575', 'Supervisor de ruta',      'FC-001', 'Puente Piedra',   'Turno manana - zona norte',        -11.867820, -77.074190, true,  20,   92),
  (2,  '10000000-0000-4000-8000-000000000002', 'worker02@fleet-demo.local', 'Karla Medina',      '+51 911 111 002', 'Tecnico GPS',             'FC-002', 'Comas',           'Cobertura de incidencias',          -11.943430, -77.063480, true,  35,   88),
  (3,  '10000000-0000-4000-8000-000000000003', 'worker03@fleet-demo.local', 'Miguel Torres',     '+51 911 111 003', 'Motorizado',              'FC-003', 'Los Olivos',      'Ruta comercial norte',              -11.975660, -77.075120, true,  45,   81),
  (4,  '10000000-0000-4000-8000-000000000004', 'worker04@fleet-demo.local', 'Ana Paredes',       '+51 911 111 004', 'Coordinadora campo',      'FC-004', 'Independencia',   'Apoyo a cuadrillas',                -11.995890, -77.054820, true,  50,   76),
  (5,  '10000000-0000-4000-8000-000000000005', 'worker05@fleet-demo.local', 'Pedro Salazar',     '+51 911 111 005', 'Tecnico fibra',           'FC-005', 'San Martin',      'Instalaciones residenciales',       -12.017260, -77.083520, true,  25,   69),
  (6,  '10000000-0000-4000-8000-000000000006', 'worker06@fleet-demo.local', 'Rosa Huaman',       '+51 911 111 006', 'Motorizada',              'FC-006', 'Carabayllo',      'Patrullaje preventivo',             -11.890720, -77.033910, true,  55,   84),
  (7,  '10000000-0000-4000-8000-000000000007', 'worker07@fleet-demo.local', 'Diego Chavez',      '+51 911 111 007', 'Supervisor tarde',        'FC-007', 'Comas',           'Revision de puntos criticos',       -11.936930, -77.051440, true,  40,   73),
  (8,  '10000000-0000-4000-8000-000000000008', 'worker08@fleet-demo.local', 'Valeria Rojas',     '+51 911 111 008', 'Asistente operativo',     'FC-008', 'Puente Piedra',   'Soporte de despacho',               -11.861930, -77.081740, true,  30,   97),
  (9,  '10000000-0000-4000-8000-000000000009', 'worker09@fleet-demo.local', 'Marco Castillo',    '+51 911 111 009', 'Tecnico mantenimiento',   'FC-009', 'Los Olivos',      'Revision post servicio',            -11.982410, -77.069950, true,  300,  61),
  (10, '10000000-0000-4000-8000-000000000010', 'worker10@fleet-demo.local', 'Carmen Flores',     '+51 911 111 010', 'Tecnico campo',           'FC-010', 'SMP',             'Atencion de tickets',               -12.003470, -77.091160, true,  720,  58),
  (11, '10000000-0000-4000-8000-000000000011', 'worker11@fleet-demo.local', 'Jorge Quispe',      '+51 911 111 011', 'Motorizado',              'FC-011', 'Comas',           'Apoyo zona centro',                 -11.954780, -77.058710, true,  1440, 46),
  (12, '10000000-0000-4000-8000-000000000012', 'worker12@fleet-demo.local', 'Fiorella Soto',     '+51 911 111 012', 'Tecnico instalador',      'FC-012', 'Puente Piedra',   'Pendiente confirmacion cliente',    -11.876540, -77.066310, true,  2280, 42),
  (13, '10000000-0000-4000-8000-000000000013', 'worker13@fleet-demo.local', 'Oscar Delgado',     '+51 911 111 013', 'Tecnico emergencia',      'FC-013', 'Carabayllo',      'Alerta por baja senal GPS',         -11.902330, -77.044850, true,  3060, 36),
  (14, '10000000-0000-4000-8000-000000000014', 'worker14@fleet-demo.local', 'Mariela Vargas',    '+51 911 111 014', 'Motorizada',              'FC-014', 'Independencia',   'Ultimo contacto fuera de rango',    -11.987650, -77.062120, true,  3900, 32),
  (15, '10000000-0000-4000-8000-000000000015', 'worker15@fleet-demo.local', 'Hector Poma',       '+51 911 111 015', 'Tecnico reten',           'FC-015', 'SMP',             'Tracking pausado por descanso',     -12.011590, -77.096830, false, 180,  79),
  (16, '10000000-0000-4000-8000-000000000016', 'worker16@fleet-demo.local', 'Gabriela Leon',     '+51 911 111 016', 'Asistente tecnico',       'FC-016', 'Los Olivos',      'Disponible para asignacion',        -11.968420, -77.085430, false, 840,  67),
  (17, '10000000-0000-4000-8000-000000000017', 'worker17@fleet-demo.local', 'Renato Valdivia',   '+51 911 111 017', 'Tecnico nocturno',        'FC-017', 'Comas',           'Sin conexion mayor a una hora',     -11.949120, -77.071260, false, 4200, 28),
  (18, '10000000-0000-4000-8000-000000000018', 'worker18@fleet-demo.local', 'Lucia Mendoza',     '+51 911 111 018', 'Control de calidad',      'FC-018', 'Puente Piedra',   'Validacion de cierre de ruta',      -11.854680, -77.070520, true,  52,   90);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  last_sign_in_at,
  is_sso_user,
  is_anonymous
)
select
  id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('FleetDemo123!', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', array['email']),
  jsonb_build_object('role', 'worker', 'full_name', full_name),
  now() - make_interval(days => 20 - sort_order % 9),
  now(),
  now() - make_interval(secs => last_seen_seconds),
  false,
  false
from _fleet_demo_workers
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now(),
  last_sign_in_at = excluded.last_sign_in_at,
  deleted_at = null,
  banned_until = null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'identities'
      and column_name = 'provider_id'
  ) then
    execute $sql$
      insert into auth.identities (
        id,
        user_id,
        provider_id,
        provider,
        identity_data,
        last_sign_in_at,
        created_at,
        updated_at
      )
      select
        id::text,
        id,
        id::text,
        'email',
        jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
        now(),
        now(),
        now()
      from _fleet_demo_workers
      on conflict do nothing
    $sql$;
  else
    execute $sql$
      insert into auth.identities (
        id,
        user_id,
        provider,
        identity_data,
        last_sign_in_at,
        created_at,
        updated_at
      )
      select
        id::text,
        id,
        'email',
        jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
        now(),
        now(),
        now()
      from _fleet_demo_workers
      on conflict do nothing
    $sql$;
  end if;
exception
  when others then
    raise notice 'No se pudo insertar auth.identities: %', sqlerrm;
end $$;

insert into public.profiles (
  id,
  email,
  full_name,
  phone,
  job_title,
  notes,
  employee_code,
  role,
  created_at,
  updated_at
)
select
  id,
  email,
  full_name,
  phone,
  job_title,
  'DEMO seed reportes: ' || notes || ' | Zona: ' || zone,
  employee_code,
  'worker',
  now() - make_interval(days => 20 - sort_order % 9),
  now()
from _fleet_demo_workers
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  phone = excluded.phone,
  job_title = excluded.job_title,
  notes = excluded.notes,
  employee_code = excluded.employee_code,
  role = excluded.role,
  updated_at = now();

insert into public.worker_locations (
  user_id,
  email,
  latitude,
  longitude,
  is_tracking,
  updated_at
)
select
  id,
  email,
  latitude,
  longitude,
  is_tracking,
  now() - make_interval(secs => last_seen_seconds)
from _fleet_demo_workers
on conflict (user_id) do update set
  email = excluded.email,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_tracking = excluded.is_tracking,
  updated_at = excluded.updated_at;

delete from public.worker_location_history
where user_id in (select id from _fleet_demo_workers)
  and updated_at >= now() - interval '45 days';

insert into public.worker_location_history (
  user_id,
  email,
  latitude,
  longitude,
  is_tracking,
  speed_kmh,
  battery_level,
  accuracy_meters,
  updated_at
)
select
  w.id,
  w.email,
  round((w.latitude + (((w.sort_order + p.step) % 5) - 2) * 0.00125 + p.step * 0.00035)::numeric, 6)::double precision,
  round((w.longitude + (((w.sort_order + day_offset) % 7) - 3) * 0.00115 - p.step * 0.00028)::numeric, 6)::double precision,
  true,
  round((18 + ((w.sort_order * 3 + p.step * 5 + day_offset) % 32))::numeric, 2),
  greatest(18, least(99, w.battery_level - (day_offset * 2) + p.step)),
  round((5 + ((w.sort_order + p.step + day_offset) % 14))::numeric, 2),
  now()
    - make_interval(days => day_offset)
    - make_interval(hours => greatest(0, 5 - p.step))
    - make_interval(mins => ((w.sort_order * 4 + p.step * 11) % 55))
from _fleet_demo_workers w
cross join generate_series(0, 13) as day_offset
cross join lateral generate_series(
  1,
  case
    when ((w.sort_order + day_offset) % 6) = 0 then 1
    when ((w.sort_order + day_offset) % 4) = 0 then 2
    else 3
  end
) as p(step)
where not (((w.sort_order + day_offset) % 8) = 0)
  and not (w.sort_order in (15, 16, 17) and day_offset < 2);

insert into public.operational_base (
  id,
  name,
  enabled,
  latitude,
  longitude,
  radius_meters,
  updated_at
)
values (
  1,
  'Base Norte - Comas',
  true,
  -11.944920,
  -77.059350,
  1350,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  enabled = excluded.enabled,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius_meters = excluded.radius_meters,
  updated_at = now();

delete from public.admin_audit_log
where metadata ->> 'seed' = 'reportes_demo_realista';

insert into public.admin_audit_log (actor_email, action, metadata, created_at)
values
  ('admin@fleetcontrol.local', 'shift_started',       '{"seed":"reportes_demo_realista","zona":"Comas","equipo":"manana"}', now() - interval '7 hours'),
  ('admin@fleetcontrol.local', 'route_reassigned',    '{"seed":"reportes_demo_realista","worker":"FC-004","from":"Puente Piedra","to":"Independencia"}', now() - interval '6 hours 25 minutes'),
  ('admin@fleetcontrol.local', 'tracking_recovered',  '{"seed":"reportes_demo_realista","worker":"FC-011","status":"ok"}', now() - interval '5 hours 10 minutes'),
  ('admin@fleetcontrol.local', 'critical_alert',      '{"seed":"reportes_demo_realista","worker":"FC-013","reason":"sin_senal"}', now() - interval '4 hours 40 minutes'),
  ('admin@fleetcontrol.local', 'base_radius_updated', '{"seed":"reportes_demo_realista","radius_meters":1350}', now() - interval '3 hours 55 minutes'),
  ('admin@fleetcontrol.local', 'route_completed',     '{"seed":"reportes_demo_realista","worker":"FC-003","km":18.6}', now() - interval '2 hours 30 minutes'),
  ('admin@fleetcontrol.local', 'battery_warning',     '{"seed":"reportes_demo_realista","worker":"FC-017","battery":28}', now() - interval '1 hour 18 minutes'),
  ('admin@fleetcontrol.local', 'executive_pdf_exported','{"seed":"reportes_demo_realista","periodDays":7}', now() - interval '35 minutes');

create index if not exists idx_worker_locations_updated_at
on public.worker_locations (updated_at desc);

create index if not exists idx_worker_location_history_user_time
on public.worker_location_history (user_id, updated_at desc);

create index if not exists idx_worker_location_history_time
on public.worker_location_history (updated_at desc);

commit;

select
  'seed_reportes_demo_realista listo' as resultado,
  count(*) filter (where fuente = 'worker_locations') as trabajadores_en_mapa,
  count(*) filter (where fuente = 'profiles') as perfiles_demo,
  count(*) filter (where fuente = 'worker_location_history') as puntos_historial
from (
  select 'worker_locations' as fuente
  from public.worker_locations
  where email like '%@fleet-demo.local'
  union all
  select 'profiles' as fuente
  from public.profiles
  where email like '%@fleet-demo.local'
  union all
  select 'worker_location_history' as fuente
  from public.worker_location_history
  where email like '%@fleet-demo.local'
) resumen;
