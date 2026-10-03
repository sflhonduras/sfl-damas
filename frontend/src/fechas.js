// Utilidades de fecha que evitan el error clásico de "resta un día":
// un campo DATE de Postgres llega como "2026-07-10" (sin hora). Si se hace
// `new Date("2026-07-10")`, JavaScript lo interpreta como medianoche UTC,
// y al mostrarlo en una zona horaria detrás de UTC (como Honduras, UTC-6)
// se ve como un día antes. Aquí construimos la fecha con año/mes/día locales.

export function parsearFechaLocal(fechaISO) {
  if (!fechaISO) return null;
  const soloFecha = fechaISO.slice(0, 10); // por si viene con hora/zona
  const [anio, mes, dia] = soloFecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatearFecha(fechaISO) {
  const d = parsearFechaLocal(fechaISO);
  if (!d) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Formato corto DD/MM/AAAA (ej. "03/08/2026"), útil en tablas y tarjetas donde no cabe la
// fecha larga. Reutiliza parsearFechaLocal para no recorrerse un día por zona horaria.
export function formatearFechaCorta(fechaISO) {
  const d = parsearFechaLocal(fechaISO);
  if (!d) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Formato largo con día de la semana: "Viernes 14 de Agosto del 2026".
export function formatearFechaLarga(fechaISO) {
  const d = parsearFechaLocal(fechaISO);
  if (!d) return '';
  const diaSemana = DIAS_SEMANA[d.getDay()];
  return `${diaSemana} ${d.getDate()} de ${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)} del ${d.getFullYear()}`;
}

// Muestra "10 al 12 de julio de 2026" si hay fecha fin, o solo la fecha si no.
export function formatearRangoFechas(fechaInicioISO, fechaFinISO) {
  const inicio = parsearFechaLocal(fechaInicioISO);
  if (!inicio) return '';
  if (!fechaFinISO) return formatearFecha(fechaInicioISO);
  const fin = parsearFechaLocal(fechaFinISO);
  if (inicio.getTime() === fin.getTime()) return formatearFecha(fechaInicioISO);

  const mismoMes = inicio.getMonth() === fin.getMonth() && inicio.getFullYear() === fin.getFullYear();
  if (mismoMes) {
    return `${inicio.getDate()} al ${fin.getDate()} de ${MESES[inicio.getMonth()]} de ${inicio.getFullYear()}`;
  }
  return `${formatearFecha(fechaInicioISO)} al ${formatearFecha(fechaFinISO)}`;
}

export function formatearFechaHora(fechaConHoraISO) {
  if (!fechaConHoraISO) return '';
  const d = new Date(fechaConHoraISO); // este sí trae hora real, se puede convertir normal
  const fecha = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const hora = d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
  return `${fecha}, ${hora}`;
}

// Convierte una hora en formato 24h ("14:00", como la guarda <input type="time">)
// a formato de 12 horas con AM/PM ("2:00 PM").
export function formatearHora12(horaTexto) {
  if (!horaTexto) return '';
  const [hStr, mStr] = horaTexto.split(':');
  let horas = parseInt(hStr, 10);
  if (Number.isNaN(horas)) return horaTexto; // por si ya viene en otro formato
  const minutos = (mStr || '00').padStart(2, '0');
  const sufijo = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${horas}:${minutos} ${sufijo}`;
}
