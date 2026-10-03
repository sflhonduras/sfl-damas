-- SFL FIHNEC - Esquema de base de datos (PostgreSQL)

CREATE TABLE IF NOT EXISTS eventos (
  id              SERIAL PRIMARY KEY,
  orden           INTEGER NOT NULL UNIQUE,           -- 1,2,3,4 (secuencia obligatoria)
  codigo          TEXT NOT NULL UNIQUE,               -- 'SFL1','SFL2','SFL3','SFL4'
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  fecha_evento    DATE,
  fecha_evento_fin DATE,
  hora_evento     TEXT,
  lugar           TEXT,
  fecha_limite_registro TIMESTAMPTZ,                  -- fecha/hora tope para inscribirse
  activo          BOOLEAN NOT NULL DEFAULT TRUE,       -- bloqueo manual por el admin
  ciclo_actual    INTEGER NOT NULL DEFAULT 1,          -- ciclo/edición activa de este nivel
  es_actual       BOOLEAN NOT NULL DEFAULT FALSE,       -- si es el nivel que se está promoviendo ahora
  cupo_maximo     INTEGER,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participantes (
  id                          SERIAL PRIMARY KEY,
  nombre_completo             TEXT NOT NULL,
  dni                         TEXT NOT NULL UNIQUE,
  celular                     TEXT,
  capitulo                    TEXT,
  zona                        TEXT,
  departamento                TEXT,
  municipio                   TEXT,
  cargo_fihnec                TEXT,
  estado_civil                TEXT,
  hijos_cantidad              INTEGER,
  comparte_testimonio         TEXT,
  tiempo_comparte_testimonio  TEXT,
  ha_recibido_sael            TEXT,
  cantidad_saeles             INTEGER,
  contacto_emergencia_nombre  TEXT,
  contacto_emergencia_telefono TEXT,
  pin                         TEXT,
  observacion                 TEXT,
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participantes_dni ON participantes(dni);

CREATE TABLE IF NOT EXISTS inscripciones (
  id               SERIAL PRIMARY KEY,
  participante_id  INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  evento_id        INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  registrado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_graduacion DATE,
  promocion_graduacion TEXT,
  registrado_presencial BOOLEAN NOT NULL DEFAULT FALSE,
  ciclo            INTEGER NOT NULL DEFAULT 1,
  origen           TEXT NOT NULL DEFAULT 'web',        -- 'web' | 'importado'
  UNIQUE(participante_id, evento_id)
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_evento ON inscripciones(evento_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_participante ON inscripciones(participante_id);

CREATE TABLE IF NOT EXISTS usuarios_admin (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL CHECK (rol IN ('admin','consulta','cocina')),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER REFERENCES usuarios_admin(id),
  accion       TEXT NOT NULL,
  detalle      JSONB,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO configuracion (clave, valor) VALUES ('promocion_actual', '5')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO eventos (orden, codigo, nombre, descripcion)
VALUES
  (1, 'SFL1', 'SFL Nivel I: Mi Relación con Dios', 'Seminario para la Formación de Líderes - Nivel I'),
  (2, 'SFL2', 'SFL Nivel II: Mi Relación conmigo mismo', 'Seminario para la Formación de Líderes - Nivel II'),
  (3, 'SFL3', 'SFL Nivel III: Mi Relación con los demás', 'Seminario para la Formación de Líderes - Nivel III'),
  (4, 'SFL4', 'SFL Nivel IV: Salvación y Legado', 'Seminario para la Formación de Líderes - Nivel IV')
ON CONFLICT (orden) DO NOTHING;
