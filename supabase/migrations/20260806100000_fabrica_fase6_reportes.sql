-- Fase 6 del módulo Fábrica: reportes. No agrega tablas — solo lee lo que las
-- fases 2-5 ya escriben — pero el desglose "rendimiento por operario" necesita
-- leer profiles.nombre de operarios que no son el usuario en sesión, y hoy
-- profiles solo se puede leer a sí mismo (o admin, o con acceso a tareas).
-- Mismo criterio que la policy "config_lectura_fabrica" de la Fase 4: se
-- amplía la lectura, nunca la escritura, al helper ya existente.
create policy "fabrica_lee_perfiles_para_reportes" on profiles
  for select using (tiene_acceso_fabrica());
