-- Migración v11: amplía la tabla de servidores con datos generales, organizacionales
-- y de formación/participación. Seguro correr varias veces.

ALTER TABLE servidores ADD COLUMN IF NOT EXISTS dni TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS nombre_esposa TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS nietos_cantidad INTEGER;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS profesion TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS foto TEXT; -- imagen codificada en base64 (data URL)

-- Datos organizacionales
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS fecha_inscripcion_capitulo DATE;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS tiempo_fihnec TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS cargo_actual TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS cargos_desempenados TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS zona TEXT;

-- Testimonio, formación y participación (listas desplegables)
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS tipo_testimonio TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS formacion_oficial TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS otras_participaciones TEXT[] NOT NULL DEFAULT '{}';
