-- Portal de autoconsulta y gestión para Servidores SFL (mismo patrón que ya usa
-- Participantes: acceso con DNI + PIN de 4 dígitos).
-- A diferencia de Participantes (que reciben su PIN solos al inscribirse), los
-- Servidores los agrega Carlos manualmente, así que aquí generamos el PIN para
-- TODOS los que ya existen de una vez, y cualquier servidor nuevo lo recibe
-- automáticamente al crearse (ver backend/src/routes/servidores.js).
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS pin TEXT;

UPDATE servidores
SET pin = LPAD((FLOOR(RANDOM() * 9000) + 1000)::text, 4, '0')
WHERE pin IS NULL;
