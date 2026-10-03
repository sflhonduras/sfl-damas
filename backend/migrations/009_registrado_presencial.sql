-- Migración v9: agrega el campo "Registrado" (asistencia confirmada presencialmente)
-- a cada inscripción. Se marca el día del evento cuando la persona llega físicamente.
-- Seguro correr varias veces.

ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS registrado_presencial BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inscripciones.registrado_presencial IS 'Si la persona confirmó su asistencia presencial el día del evento';
