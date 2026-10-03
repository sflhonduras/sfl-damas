-- Migración v4: permite marcar cuál de los 4 niveles es "el evento actual"
-- (el que se está promoviendo/llenando ahora mismo), para mostrar un solo
-- contador claro en el panel, en vez de sumar los 4 niveles.
-- Seguro correr varias veces.

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS es_actual BOOLEAN NOT NULL DEFAULT FALSE;

-- Si ningún evento está marcado todavía, el Nivel I queda como el actual por defecto.
UPDATE eventos SET es_actual = TRUE
WHERE orden = 1 AND NOT EXISTS (SELECT 1 FROM eventos WHERE es_actual = TRUE);

COMMENT ON COLUMN eventos.es_actual IS 'Si es TRUE, este es el nivel que se muestra como "evento actual" en el panel. Solo uno debe estar en TRUE a la vez.';
