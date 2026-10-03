-- Migración v2: agrega la fecha de graduación de cada nivel (normalmente el 3er día del evento).
-- Es seguro correr este script varias veces (usa IF NOT EXISTS) y no borra ningún dato existente.

ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS fecha_graduacion DATE;

COMMENT ON COLUMN inscripciones.fecha_graduacion IS 'Fecha en la que el participante se graduó de este nivel (usualmente el 3er día del evento)';
