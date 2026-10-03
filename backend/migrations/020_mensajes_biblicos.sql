-- Banco de versículos rotativos para el Portal del Servidor. Dos categorías:
--  - 'general': el verso del día, el mismo para todos, cambia automáticamente cada día
--  - 'cumpleanos': banco especial, solo lo ve quien cumple años ese día (en vez del general)
-- La rotación es determinística por fecha (día del año % cantidad de versos activos) —
-- no hay tabla de seguimiento de "cuál tocó hoy", así que no necesita mantenimiento.
CREATE TABLE IF NOT EXISTS mensajes_biblicos (
  id SERIAL PRIMARY KEY,
  texto TEXT NOT NULL,
  referencia TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('general', 'cumpleanos')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Semilla inicial (Reina-Valera 1909, de dominio público — texto verificado contra la
-- fuente, no reconstruido de memoria). Queda editable/ampliable desde el panel.
INSERT INTO mensajes_biblicos (texto, referencia, categoria) VALUES
  ('Mira que te mando que te esfuerces y seas valiente: no temas ni desmayes, porque Jehová tu Dios será contigo en donde quiera que fueres.', 'Josué 1:9', 'general'),
  ('Jehová es mi pastor; nada me faltará.', 'Salmos 23:1', 'general'),
  ('Todo lo puedo en Cristo que me fortalece.', 'Filipenses 4:13', 'general'),
  ('Enséñanos de tal modo á contar nuestros días, que traigamos al corazón sabiduría.', 'Salmos 90:12', 'cumpleanos'),
  ('Es por la misericordia de Jehová que no somos consumidos, porque nunca decayeron sus misericordias. Nuevas son cada mañana; grande es tu fidelidad.', 'Lamentaciones 3:22-23', 'cumpleanos');
