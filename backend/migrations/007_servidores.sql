-- Migración v7: agrega la tabla de Servidores del SFL (el equipo de servicio),
-- separada de los participantes. Incluye la bandera "participará en el evento"
-- para saber cuántos servidores van a asistir al evento actual.
-- Seguro correr varias veces.

CREATE TABLE IF NOT EXISTS servidores (
  id                  SERIAL PRIMARY KEY,
  nombre_completo     TEXT NOT NULL,
  capitulo            TEXT,
  celular             TEXT,
  estado_civil        TEXT,
  hijos_cantidad      INTEGER,
  fecha_nacimiento    DATE,
  email               TEXT,
  participara_evento  BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE servidores IS 'Equipo de servidores del SFL (staff), independiente de los participantes';
COMMENT ON COLUMN servidores.participara_evento IS 'Si va a asistir/servir en el evento actualmente activo';
