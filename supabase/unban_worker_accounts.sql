-- Fleet Control - desbloquear trabajadores baneados en Supabase Auth.
-- Ejecutar en Supabase Dashboard > SQL Editor.
--
-- Cambia o agrega correos dentro de target_emails si necesitas desbloquear
-- mas usuarios. El error "AuthApiError: User is banned" se produce cuando
-- auth.users.banned_until tiene una fecha activa.

begin;

alter table public.profiles add column if not exists account_status text default 'active';
alter table public.profiles add column if not exists updated_at timestamptz default now();

with target_emails(email) as (
  values
    ('trabajador1@empresa.com')
)
update auth.users u
set
  banned_until = null,
  updated_at = now()
from target_emails t
where lower(u.email) = lower(t.email);

with target_emails(email) as (
  values
    ('trabajador1@empresa.com')
)
update public.profiles p
set
  account_status = 'active',
  updated_at = now()
from target_emails t
where lower(p.email) = lower(t.email);

commit;

select
  u.email,
  u.banned_until,
  coalesce(p.account_status, 'active') as account_status
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('trabajador1@empresa.com');
