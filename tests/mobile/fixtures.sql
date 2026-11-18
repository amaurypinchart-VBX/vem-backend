-- Données de test pour le contrôle téléphone / tablette (tests/mobile/audit.mjs).
-- À charger APRÈS `npm run db:seed`, sur une base JETABLE (jamais la base Railway).
-- Les dates sont relatives à aujourd'hui pour que le planning du dashboard soit rempli.

update projects set
  installation_start = date_trunc('day', now()) - interval '1 day',
  installation_end   = date_trunc('day', now()) + interval '2 day',
  dismantling_start  = date_trunc('day', now()) + interval '6 day',
  dismantling_end    = date_trunc('day', now()) + interval '7 day',
  status = 'installation'
where name like 'Salon Audi%';

update projects set
  installation_start = date_trunc('day', now()) + interval '13 day',
  installation_end   = date_trunc('day', now()) + interval '15 day',
  status = 'in_preparation'
where name like 'BMW%';

-- Nom très long (cas réel : « …PAVGE… » coupé sur la capture iPhone du 11.11.2026)
insert into projects (id, internal_number, name, client_id, status, address, city,
  installation_start, installation_end, dismantling_start, dismantling_end, workers_count, updated_at)
select gen_random_uuid()::text, 'MOB-TEST-LONG', 'PAVGEVIE Pavillon Genève Expo Hall 7 — Viewbox M16 double niveau',
  client_id, 'quote_validated', 'Route François-Peyrot 30, 1218 Le Grand-Saconnex, Suisse', 'Genève',
  date_trunc('day', now()) + interval '36 day', date_trunc('day', now()) + interval '40 day',
  date_trunc('day', now()) + interval '58 day', date_trunc('day', now()) + interval '60 day', 6, now()
from projects where not exists (select 1 from projects where internal_number = 'MOB-TEST-LONG') limit 1;

insert into projects (id, internal_number, name, client_id, status, address, city,
  installation_start, installation_end, dismantling_start, dismantling_end, workers_count, updated_at)
select gen_random_uuid()::text, 'MOB-TEST-ONSITE', 'IKEA Place de l''Opéra Paris',
  client_id, 'on_site', 'Place de l''Opéra, 75009 Paris, France', 'Paris',
  date_trunc('day', now()) - interval '6 day', date_trunc('day', now()) - interval '2 day',
  date_trunc('day', now()) + interval '21 day', date_trunc('day', now()) + interval '23 day', 4, now()
from projects where not exists (select 1 from projects where internal_number = 'MOB-TEST-ONSITE') limit 1;

-- Un camion par projet, des bookings équipe
insert into trucks (id, project_id, truck_number, license_plate, driver_name, vehicle_type, loading_date, departure_date, arrival_date)
select gen_random_uuid()::text, p.id, 'T1', '1-ABC-123', 'Chauffeur Test', 'truck',
  p.installation_start - interval '2 day', p.installation_start - interval '1 day', p.installation_start
from projects p where not exists (select 1 from trucks t where t.project_id = p.id);

insert into team_bookings (id, project_id, user_id, phase, on_site_start, on_site_end, outbound_date, return_date, updated_at)
select gen_random_uuid()::text, p.id, u.id, 'installation', p.installation_start, p.installation_end,
  p.installation_start - interval '1 day', p.installation_end + interval '1 day', now()
from projects p, users u
where u.role in ('site_manager', 'engineer')
  and not exists (select 1 from team_bookings b where b.project_id = p.id and b.user_id = u.id);

update daily_reports set report_date = date_trunc('day', now());
