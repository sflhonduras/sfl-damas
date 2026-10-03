-- Migración v10: índices de búsqueda rápida por texto.
-- La búsqueda de participantes usa ILIKE '%texto%' (nombre, DNI, capítulo), que un índice
-- normal no puede acelerar. Estos índices "trigram" sí permiten que Postgres use un índice
-- para ese tipo de búsqueda, en vez de revisar fila por fila.
-- Seguro correr varias veces.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_participantes_nombre_trgm ON participantes USING gin (nombre_completo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_participantes_dni_trgm ON participantes USING gin (dni gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_participantes_capitulo_trgm ON participantes USING gin (capitulo gin_trgm_ops);
