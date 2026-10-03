-- Migración v8: permite el rol especial "cocina" (acceso mínimo: solo ve qué evento
-- está activo y cuántos participantes + servidores van a asistir).
-- Seguro correr varias veces.

ALTER TABLE usuarios_admin DROP CONSTRAINT IF EXISTS usuarios_admin_rol_check;
ALTER TABLE usuarios_admin ADD CONSTRAINT usuarios_admin_rol_check CHECK (rol IN ('admin', 'consulta', 'cocina'));
