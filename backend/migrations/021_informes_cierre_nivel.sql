-- Informes ejecutivos de cierre de nivel, para mostrar a la Junta Directiva de FIHNEC.
-- Cada fila es UN cierre de nivel (un orden + un ciclo específico). Mientras "congelado"
-- sea FALSE, los datos se calculan en vivo cada vez que alguien abre el informe. Se congela
-- (se guarda una foto fija en "snapshot") en cuanto pasa lo primero de esto: ese mismo nivel
-- vuelve a cerrar su ciclo, o cambia cuál nivel es el actual — lo que ocurra primero.
CREATE TABLE IF NOT EXISTS informes_cierre_nivel (
  id             SERIAL PRIMARY KEY,
  evento_orden   INTEGER NOT NULL,
  ciclo          INTEGER NOT NULL,
  token          TEXT NOT NULL UNIQUE,
  congelado      BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot       JSONB,
  generado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  congelado_en   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_informes_cierre_token ON informes_cierre_nivel(token);
CREATE INDEX IF NOT EXISTS idx_informes_cierre_orden ON informes_cierre_nivel(evento_orden, congelado);

COMMENT ON COLUMN informes_cierre_nivel.token IS 'Código único para el enlace público sin login. Nunca expira.';
COMMENT ON COLUMN informes_cierre_nivel.snapshot IS 'Foto fija de los datos, solo se llena cuando congelado = TRUE.';
