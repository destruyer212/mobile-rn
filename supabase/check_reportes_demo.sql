select
  count(*) as trabajadores_en_mapa
from public.worker_locations
where email like '%@fleet-demo.local';

select
  count(*) as perfiles_demo
from public.profiles
where email like '%@fleet-demo.local';

select
  count(*) as puntos_historial
from public.worker_location_history
where email like '%@fleet-demo.local';

select
  email,
  latitude,
  longitude,
  is_tracking,
  updated_at
from public.worker_locations
where email like '%@fleet-demo.local'
order by updated_at desc
limit 5;
