// Se actualiza junto con una entrada nueva en CHANGELOG.md (en la raíz del proyecto) y una
// etiqueta de Git (ej. "git tag v1.1.0") en ese mismo commit.
// Regla de versionado (acordada el 13 de agosto de 2026):
//   - Cambio SOLO de backend, sin tocar frontend  -> sube el PATCH (v1.0.1, v1.0.2...)
//   - Cualquier cambio que toque frontend          -> sube el MINOR (v1.1.0, v1.2.0...) y el patch vuelve a 0
//   - Cambio realmente grande (módulo nuevo enorme, rediseño total, etc.) -> sube el MAJOR (v2.0.0),
//     decidido a mano entre Carlos y Claude, nunca automático.
export const VERSION = 'v1.0.0';
export const FECHA_VERSION = '3 de octubre de 2026';
