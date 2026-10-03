-- Migración v12: historial de inscripciones. Guarda una copia de cómo estaba una inscripción
-- justo ANTES de que se sobrescriba (alguien se reinscribe a un ciclo nuevo) o se elimine
-- (un admin usa "Eliminar" en Participantes). No reemplaza a "inscripciones" — es un respaldo
-- que crece con el tiempo, para nunca volver a perder la fecha de graduación de nadie.

CREATE TABLE IF NOT EXISTS inscripciones_historial (
  id SERIAL PRIMARY KEY,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id),
  ciclo INTEGER,
  fecha_graduacion DATE,
  promocion_graduacion TEXT,
  registrado_en TIMESTAMP,
  origen TEXT,
  motivo TEXT NOT NULL, -- 'reactivado' (se reinscribió a ciclo nuevo) | 'eliminado' (admin borró) | 'editado' (admin cambió fecha/promoción/ciclo a mano)
  archivado_en TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_historial_participante ON inscripciones_historial(participante_id, evento_id);
