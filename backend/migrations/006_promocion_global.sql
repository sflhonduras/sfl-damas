-- Migración v6: agrega una tabla de configuración general, y en ella el número de
-- promoción actual (la generación que se está cursando ahora, ej. Promoción V).
-- Seguro correr varias veces.

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO configuracion (clave, valor) VALUES ('promocion_actual', '5')
ON CONFLICT (clave) DO NOTHING;

COMMENT ON TABLE configuracion IS 'Valores generales de configuración del sistema (clave/valor)';
