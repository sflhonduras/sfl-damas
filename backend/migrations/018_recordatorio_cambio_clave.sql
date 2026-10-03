-- Recordatorio de cambio de contraseña cada 90 días, para todos los usuarios del panel
-- EXCEPTO el Super Administrador. El DEFAULT now() aplica a todos los usuarios que ya
-- existen hoy, así que el conteo de 90 días arranca desde hoy para todos — nadie recibe
-- la pregunta de sorpresa mañana mismo.
ALTER TABLE usuarios_admin ADD COLUMN IF NOT EXISTS password_actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now();

-- Si alguien elige "Más tarde" en vez de cambiarla, se pospone otros 90 días desde ese
-- momento, sin necesidad de que haya cambiado la contraseña de verdad.
ALTER TABLE usuarios_admin ADD COLUMN IF NOT EXISTS password_cambio_pospuesto_en TIMESTAMPTZ;
