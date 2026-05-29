# Supabase — Fleet Control (dos apps)

## Aplicar RLS (Fase 5)

1. Abre el proyecto en [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**.
2. Pega y ejecuta el contenido de [`migrations/20260528000000_rls_two_apps.sql`](./migrations/20260528000000_rls_two_apps.sql).
3. Si ya tenías políticas con otros nombres, revísalas en **Authentication → Policies** y elimina duplicados conflictivos.

## Requisitos de usuarios

- Cada usuario debe tener `raw_user_meta_data.role` = `worker` o `admin` (coherente con la app instalada).
- La Edge Function `admin-manage-workers` debe rechazar JWT sin rol `admin` (verificar en el código de la función en tu proyecto Supabase).

## Comprobar RLS

Con una sesión de **trabajador** en SQL (o desde la app worker tras login):

```sql
select * from worker_locations where user_id <> auth.uid();
```

Debe devolver **0 filas** (o error de permiso según el cliente).

## Prueba manual

Sigue [`../docs/MANUAL-TEST-phase5.md`](../docs/MANUAL-TEST-phase5.md).
