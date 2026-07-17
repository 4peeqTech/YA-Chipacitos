-- Recordatorio de tarea por vencer (cron diario). Esta columna evita que se
-- reenvíe la notificación push si el cron se reintenta o corre más de una
-- vez el mismo día.
ALTER TABLE tareas ADD COLUMN recordatorio_enviado_at TIMESTAMPTZ;
