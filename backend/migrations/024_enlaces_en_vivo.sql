-- Enlace público de "registro en vivo" — a diferencia de los Informes de Cierre (que NUNCA
-- expiran), este SÍ vence solo, 72 horas después de generarse. Pasado ese tiempo, el token
-- deja de funcionar aunque alguien todavía tenga el enlace guardado.
CREATE TABLE IF NOT EXISTS enlaces_en_vivo (
  id            SERIAL PRIMARY KEY,
  evento_orden  INTEGER NOT NULL,
  ciclo         INTEGER NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  generado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enlaces_en_vivo_token ON enlaces_en_vivo(token);
