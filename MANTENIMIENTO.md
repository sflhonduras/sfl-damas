# Mantenimiento del Sistema SFL FIHNEC

Guía práctica para actualizar dependencias sin arriesgar que algo se rompa.
Escrita el 6 de septiembre de 2026.

## Filosofía general

**No actualizar por actualizar.** Si algo funciona, no hay urgencia de tocarlo.
Las únicas razones reales para actualizar una librería son: (1) una
vulnerabilidad de seguridad conocida, o (2) que necesites de verdad una
función nueva que trae esa versión.

## 1. Nunca dejes que las versiones se actualicen solas

- Sube siempre `package-lock.json` a Git (tanto en `backend/` como en
  `frontend/`) — es lo que garantiza que tú, Claude, y Render/Netlify
  instalen exactamente las mismas versiones cada vez.
- Nunca corras `npm update` sin un motivo específico — actualiza librerías
  una por una, a propósito, no todas de golpe.

## 2. Ritmo de revisión

| Qué revisar | Cuándo |
|---|---|
| `npm audit` (vulnerabilidades de seguridad) | Cada 2-3 meses, o al cerrar cada nivel del ciclo SFL |
| `npm outdated` (qué hay desactualizado en general) | 2 veces al año — al terminar el ciclo completo de los 4 niveles |
| Actualizar una librería específica | Solo cuando surja la necesidad real, no por calendario |
| Backup/branch de Neon antes de un cambio | Cada vez que se vaya a tocar la ESTRUCTURA de la base de datos (una migración nueva) |

## 3. Antes de actualizar algo, consúltalo

Cuando `npm outdated` o `npm audit` muestren algo, tráelo a la conversación
antes de instalar nada. Juntos revisamos qué tipo de cambio es:

- **Parche** (ej. 18.2.0 → 18.2.1): casi siempre seguro, solo arregla bugs.
- **Menor** (ej. 18.2.0 → 18.3.0): generalmente seguro, agrega funciones sin
  romper nada existente.
- **Mayor** (ej. 18.x → 19.x): aquí sí hay que leer qué cambió antes de
  tocar nada — puede romper cosas a propósito.

## 4. Actualiza de una en una

Nunca actualices varias librerías en el mismo cambio. Si algo se rompe
después, sabrás exactamente cuál fue la causa — no tendrás que adivinar
entre varios cambios mezclados.

## 5. Regla de oro: nunca durante un evento en vivo

Ninguna actualización de dependencias, por chica que parezca, se sube
mientras haya gente registrándose en un evento real. Solo en momentos
tranquilos, entre ciclos.

## 6. Sigue la disciplina de versionado que ya usamos

Cada cambio que se sube a producción debe llevar:
- Una entrada nueva en `CHANGELOG.md` (en la raíz del proyecto)
- El número de versión actualizado en `frontend/src/version.js`
- Una etiqueta de Git (`git tag vX.X.X`) en ese mismo commit

Esto es lo que permite volver atrás rápido (`git checkout vX.X.X`) si algo
sale mal después de una actualización, mientras se investiga con calma.

## Regla de versionado (acordada el 13 de agosto de 2026, ajustada al
estándar real de SemVer el 4 de septiembre de 2026)

- **PATCH** (v1.0.1, v1.0.2...): corrige un bug, sin agregar nada nuevo.
- **MINOR** (v1.1.0, v1.2.0...): agrega algo nuevo, sin romper lo que ya
  funcionaba.
- **MAJOR** (v2.0.0): cambio que rompe compatibilidad con lo anterior —
  se decide a mano entre Carlos y Claude, nunca automático.
