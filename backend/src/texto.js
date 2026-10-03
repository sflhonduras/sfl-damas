// Convierte "carlos suazo" o "CARLOS SUAZO" en "Carlos Suazo".
// Respeta conectores comunes en español (de, del, la, las, los, y) en minúscula,
// salvo que sean la primera palabra.
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

export function normalizarNombre(texto) {
  if (!texto) return texto;
  const palabras = String(texto).trim().toLowerCase().split(/\s+/);
  return palabras
    .map((palabra, i) => {
      if (i > 0 && CONECTORES.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ');
}

// Deja solo dígitos (para teléfonos).
export function soloDigitos(texto) {
  if (!texto) return texto;
  return String(texto).replace(/[^\d]/g, '');
}
