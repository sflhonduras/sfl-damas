-- Refuerzo de seguridad del PIN (4 dígitos), para Participantes y Servidores por igual:
--   1) Bloqueo tras 3 intentos fallidos, por 30 minutos.
--   2) Todos deben cambiar su PIN la próxima vez que entren (aplica también a los que ya
--      existen hoy, no solo a los nuevos — por eso el DEFAULT TRUE aplica a todas las filas).
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS debe_cambiar_pin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS intentos_fallidos_pin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

ALTER TABLE servidores ADD COLUMN IF NOT EXISTS debe_cambiar_pin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS intentos_fallidos_pin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
