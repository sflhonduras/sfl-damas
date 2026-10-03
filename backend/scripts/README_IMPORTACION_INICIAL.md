# Importación inicial de participantes (SFL Damas)

A diferencia de SFL-Hombres, SFL Damas no tiene un botón de "Importar Excel" en el panel.
El historial de participantes de eventos pasados se carga **una sola vez**, al momento de
arrancar el sistema, con el script `importar_excel_participantes.js`.

## Cuándo correrlo

Después de `npm run migrate` (que crea las tablas y los 4 niveles base), y antes de poner
el sistema en producción con usuarios reales. Se puede correr más de una vez sin duplicar
nada (empareja por DNI y por participante+evento), pero está pensado para una sola carga
real al arrancar.

## Formato esperado del Excel

Primera fila = encabezados exactos de columna (respetando mayúsculas, tildes y espacios).

| Columna                        | Obligatoria | Qué va                                                   |
|---------------------------------|:-----------:|-----------------------------------------------------------|
| Número de Identidad (DNI)       | Sí           | Solo dígitos (se limpia cualquier guion o espacio)        |
| Nombre completo                 | Sí           |                                                             |
| Número de Celular               | No           |                                                             |
| Capítulo al que pertenece       | No           |                                                             |
| Zona                            | No           |                                                             |
| Departamento                    | No           |                                                             |
| Municipio                       | No           |                                                             |
| Cargo en FIHNEC                 | No           |                                                             |
| Estado Civil                    | No           |                                                             |
| Hijos (Cantidad)                | No           | Número                                                     |
| Observacion                     | No           |                                                             |
| SFL 1 / SFL 2 / SFL 3 / SFL 4   | No           | Escribe `Registrado` (o `Si`/`Sí`) si ya asistió a ese nivel |
| SFL 1 Ciclo / SFL 2 Ciclo / ...  | No           | Número de ciclo/edición de ese nivel (si se dejó vacío, se asume ciclo 1) |

Cualquier fila sin DNI o sin nombre se omite. Si el mismo DNI aparece más de una vez en el
archivo, solo se toma la primera fila.

## Cómo correrlo

```bash
cd backend
node scripts/importar_excel_participantes.js /ruta/al/archivo.xlsx
# o si los datos están en una hoja que no es la primera del archivo:
node scripts/importar_excel_participantes.js /ruta/al/archivo.xlsx "NombreDeLaHoja"
```

Al terminar, imprime un resumen: cuántos participantes se crearon, cuántos ya existían,
cuántas filas se omitieron (sin DNI/nombre, o duplicadas dentro del mismo archivo), y
cuántas inscripciones se crearon.

## Si el Excel real tiene columnas distintas

Este script asume los mismos encabezados que usó originalmente SFL-Hombres para su propia
carga inicial. Si el archivo real de SFL Damas trae otros nombres de columna, hay que
ajustar los nombres entre corchetes (`fila['...']`) dentro de
`importar_excel_participantes.js` antes de correrlo — Carlos y Claude pueden hacerlo juntos
en cuanto el archivo real esté disponible, mostrándole el archivo a Claude Code.
