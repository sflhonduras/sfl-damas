-- Migración v3:
-- 1) Permite un rango de fechas para el evento (fecha_evento_fin, ej. "del 10 al 12 de julio").
-- 2) Agrega el concepto de "ciclo" por evento: cada vez que el administrador da "Iniciar nuevo ciclo",
--    las inscripciones futuras se cuentan aparte de las anteriores, sin borrar el historial.
-- Seguro correr varias veces, no borra datos existentes.

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS fecha_evento_fin DATE;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS ciclo_actual INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS ciclo INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN eventos.fecha_evento_fin IS 'Fecha final del evento si dura varios días (ej. del 10 al 12 de julio)';
COMMENT ON COLUMN eventos.ciclo_actual IS 'Número de ciclo/edición activa de este nivel; se incrementa al iniciar un nuevo ciclo';
COMMENT ON COLUMN inscripciones.ciclo IS 'Ciclo del evento al que pertenece esta inscripción (copiado de eventos.ciclo_actual al momento de inscribirse)';
