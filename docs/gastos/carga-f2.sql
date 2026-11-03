-- Prueba de carga de Gastos F2: 5.000 gastos y ~2.000 pagos de prueba dentro de
-- una transacción que se descarta (no quedan en dev ni se ven en qa). Mide lo
-- que hace la pantalla: una página de 50 con su total, el resumen y Pendientes.
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/carga-f2.sql
begin;
create temp table _t (n serial, consulta text, ms numeric, filas bigint);
grant all on _t to authenticated;
grant usage on sequence _t_n_seq to authenticated;

insert into gastos (fecha, local, rubro, categoria, monto, forma_pago, observaciones, fecha_vencimiento)
select current_date - (random() * 730)::int,
       (array['YA! FABRICA','YA! SAN LORENZO','YA! PARAGUAY','YA! IRIGOYEN','YA! CORDOBA','YA! ITUZAINGO','YA! GOYA','YA! UNIDAD','CHURROS TUBO'])[1 + (i % 9)],
       'MATERIA PRIMA', 'HUEVOS', round((1000 + random() * 500000)::numeric, 2), 'Transferencia',
       'zzcarga ' || i, case when i % 5 = 0 then current_date + (i % 60) - 30 end
from generate_series(1, 5000) i;

insert into gastos_pagos (gasto_id, fecha, monto, forma_pago, caja)
select id, fecha + 3, monto * case when random() < 0.5 then 1 else 0.5 end, 'Efectivo', 'Goya'
from gastos where observaciones like 'zzcarga %' and random() < 0.4;

update gastos g set estado = case when p.pagado >= g.monto then 'Pagado' else 'Parcial' end
from (select gasto_id, sum(monto) pagado from gastos_pagos group by gasto_id) p
where p.gasto_id = g.id and g.observaciones like 'zzcarga %';

analyze gastos;
analyze gastos_pagos;

select set_config('request.jwt.claim.sub', '37794588-426a-4699-85df-889b6b828e07', true);
select set_config('request.jwt.claims', '{"sub":"37794588-426a-4699-85df-889b6b828e07","role":"authenticated"}', true);
set local role authenticated;

do $$
declare t0 timestamptz; n bigint; m date := date_trunc('month', current_date)::date; mf date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  t0 := clock_timestamp();
  perform * from gastos_listar(m, mf) limit 50;
  select count(*) into n from gastos_listar(m, mf);
  insert into _t (consulta, ms, filas) values ('lista del mes: página + total', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  perform * from gastos_listar(null, null) limit 50 offset 2000;
  select count(*) into n from gastos_listar(null, null);
  insert into _t (consulta, ms, filas) values ('todo el período, página 41 + total', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(*) into n from gastos_listar(null, null, 'pendientes', 'YA! GOYA', 'zzcarga 1');
  insert into _t (consulta, ms, filas) values ('búsqueda + estado + local', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  perform gastos_resumen(m, mf);
  insert into _t (consulta, ms, filas) values ('resumen (KPIs + total filtrado)', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), null);

  t0 := clock_timestamp();
  select count(*) into n from gastos_pendientes_resumen();
  insert into _t (consulta, ms, filas) values ('pendientes por local', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  perform * from gastos_listar(null, null, 'pendientes', 'YA! CORDOBA', null, null, 'viejos') limit 15;
  insert into _t (consulta, ms, filas) values ('primera tanda de un local', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), null);
end $$;

reset role;
select (select count(*) from gastos) gastos_total, n, consulta, ms, filas from _t order by n;
rollback;
