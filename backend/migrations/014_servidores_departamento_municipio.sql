-- Agrega Departamento y Municipio a Servidores SFL, con la misma lista que usa
-- Participantes (frontend/src/listas.js). Antes de esto, Servidores no capturaba
-- ubicación geográfica en absoluto — solo "Zona" (organizacional, no geográfica).
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS municipio TEXT;
