-- Migración v5: agrega el campo "promoción" a cada inscripción, para saber en qué
-- promoción/generación se graduó un participante de ese nivel (ej. "2024", "2025").
-- Seguro correr varias veces.

ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS promocion_graduacion TEXT;

COMMENT ON COLUMN inscripciones.promocion_graduacion IS 'Promoción/generación en la que se graduó de este nivel (ej. "2024", "2025")';
