-- Historial de participación de Servidores, ciclo por ciclo. Empieza vacía hoy — se llena
-- automáticamente cada vez que se usa "Reiniciar participación" en el panel (justo antes de
-- reiniciar los días para el ciclo nuevo, se guarda una foto de cómo quedó el ciclo que
-- está terminando). Con esto, dentro de un año o dos ya se pueden construir gráficas reales
-- de evolución en el tiempo — hoy no existen, no se inventan datos.
CREATE TABLE IF NOT EXISTS servidores_historial_participacion (
  id                SERIAL PRIMARY KEY,
  servidor_id       INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
  evento_id         INTEGER REFERENCES eventos(id),
  evento_nombre     TEXT,
  ciclo             INTEGER,
  participo         BOOLEAN NOT NULL DEFAULT FALSE,
  dias_asistencia   JSONB,
  registrado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_participacion_servidor ON servidores_historial_participacion(servidor_id);
