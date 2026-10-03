-- Participantes Sin Requisitos: participantes que asisten a un evento (Nivel II, III o IV)
-- sin cumplir el requisito normal. Se guardan aparte de "participantes" para que nunca
-- entren en las estadísticas normales mientras estén pendientes de ponerse al día.
--
-- participante_id: si la persona YA existía en "participantes", aquí se enlaza su registro
-- (no se duplican sus datos personales). Si NUNCA existió, queda en NULL y todos sus datos
-- se guardan directo en esta tabla.
CREATE TABLE IF NOT EXISTS participantes_excepcion (
  id                            SERIAL PRIMARY KEY,
  participante_id               INTEGER REFERENCES participantes(id) ON DELETE SET NULL,

  -- Datos personales completos (mismo formulario del Evento 1). Solo se llenan de verdad
  -- cuando participante_id es NULL ("nunca existió"); si ya existía, quedan en NULL y los
  -- datos reales se consultan a través de participante_id.
  nombre_completo                TEXT,
  dni                            TEXT,
  celular                        TEXT,
  capitulo                       TEXT,
  zona                           TEXT,
  departamento                   TEXT,
  municipio                      TEXT,
  cargo_fihnec                   TEXT,
  estado_civil                   TEXT,
  hijos_cantidad                 INTEGER,
  comparte_testimonio            TEXT,
  tiempo_comparte_testimonio     TEXT,
  ha_recibido_sael               TEXT,
  cantidad_saeles                INTEGER,
  contacto_emergencia_nombre     TEXT,
  contacto_emergencia_telefono   TEXT,

  -- Nivel completado hasta el momento (0 a 3). El nivel pendiente es nivel_completado + 1.
  nivel_completado               INTEGER NOT NULL DEFAULT 0,

  -- Lista de eventos a los que ha asistido SIN diploma, ej:
  -- [{"orden": 2, "fecha": "2026-08-15"}, {"orden": 3, "fecha": "2027-02-10"}]
  eventos_sin_diploma            JSONB NOT NULL DEFAULT '[]'::jsonb,

  nota                           TEXT,
  creado_por                     INTEGER REFERENCES usuarios_admin(id),
  creado_en                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participantes_excepcion_dni ON participantes_excepcion(dni);
CREATE INDEX IF NOT EXISTS idx_participantes_excepcion_participante ON participantes_excepcion(participante_id);
