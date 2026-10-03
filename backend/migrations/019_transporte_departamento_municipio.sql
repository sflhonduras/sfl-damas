-- Reemplaza la lista fija de 6 "Ciudades" en Transporte por Departamento/Municipio
-- completos, igual que ya se usa en Participantes y Servidores. Se agregan columnas
-- nuevas sin borrar "ciudad" — los registros viejos que solo tienen ciudad se siguen
-- mostrando igual (por compatibilidad), pero los nuevos ya usan departamento/municipio.
ALTER TABLE transportes ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE transportes ADD COLUMN IF NOT EXISTS municipio TEXT;
