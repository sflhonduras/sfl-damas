import path from 'path';
import { fileURLToPath } from 'url';
import pptxgen from 'pptxgenjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../assets/logo_informe.png');

// Mismos colores institucionales de FIHNEC usados en el resto del sistema (branding).
const NEGRO = '0D0805';
const DORADO = 'FDC41F';
const CAFE = '9A6136';
const NARANJA = 'F59D24';
const VERDE = '007334';
const CREMA = 'E9CFAE';
const BLANCO = 'FFFFFF';
const GRIS_TEXTO = 'C9C0B8';

function fondoBase(slide, W, H, conLogoGrande) {
  slide.background = { color: NEGRO };
  if (conLogoGrande) {
    slide.addImage({ path: LOGO_PATH, x: 5.15, y: 0.55, w: 3, h: 3.12, transparency: 88, line: { type: 'none' } });
  } else {
    slide.addImage({ path: LOGO_PATH, x: W - 1.15, y: 0.35, w: 0.65, h: 0.68, transparency: 55, line: { type: 'none' } });
  }
  slide.addShape('rect', { x: 0, y: H - 0.22, w: 7.2, h: 0.11, fill: { color: DORADO } });
  slide.addShape('rect', { x: 4.35, y: H - 0.11, w: 6.4, h: 0.045, fill: { color: VERDE } });
  slide.addShape('rect', { x: 5.28, y: H - 0.2, w: 4.8, h: 0.09, fill: { color: NARANJA } });
  slide.addShape('rect', { x: 4.35, y: H - 0.28, w: 3.03, h: 0.09, fill: { color: CAFE } });
}

function graficaBarras(pres, slide, datos, opts) {
  const filas = (datos || []).slice(0, 8); // limita a 8 para que quepa bien en la diapositiva
  if (filas.length === 0) {
    slide.addText('Sin datos en esta categoría.', {
      x: opts.x, y: opts.y + (opts.h / 2) - 0.2, w: opts.w, h: 0.4,
      align: 'center', fontFace: 'Calibri', fontSize: 12, color: GRIS_TEXTO, italic: true
    });
    return;
  }
  const data = [{
    name: 'Participantes',
    labels: filas.map(f => f.etiqueta),
    values: filas.map(f => f.total)
  }];
  slide.addChart(pres.ChartType.bar, data, {
    ...opts,
    barDir: 'bar',
    showTitle: false, showLegend: false,
    showValue: true, dataLabelColor: BLANCO, dataLabelFontSize: 10, dataLabelPosition: 'outEnd',
    catAxisLabelColor: CREMA, catAxisLabelFontSize: 11,
    valAxisLabelColor: GRIS_TEXTO, valAxisLabelFontSize: 10,
    valGridLine: { color: '3A2E24', size: 1 },
    catGridLine: { style: 'none' },
    plotArea: { fill: { color: NEGRO } },
    chartArea: { fill: { color: NEGRO } }
  });
}

// Genera el PPTX del informe ejecutivo con los datos reales (vivos o congelados, ya
// resueltos antes de llamar esta función). Devuelve un Buffer — nunca se guarda en disco.
export async function generarInformePptx(datos) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  const W = 13.3, H = 7.5;

  const nivelRomano = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[datos.evento_orden] || String(datos.evento_orden);
  const [tituloNivel, subtitulo] = (datos.evento_nombre || '').split(/:\s*/, 2);
  const fechaTexto = new Date(datos.congelado_en || datos.calculado_en).toLocaleDateString('es-HN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // ---------- Portada ----------
  let s = pres.addSlide();
  fondoBase(s, W, H, true);
  s.addText('INFORME EJECUTIVO · JUNTA DIRECTIVA DE FIHNEC', {
    x: 0, y: 2.55, w: W, h: 0.5, align: 'center',
    fontFace: 'Calibri', fontSize: 14, color: DORADO, charSpacing: 3, bold: true
  });
  s.addText(`SFL Nivel ${nivelRomano}`, {
    x: 0, y: 3.0, w: W, h: 1.1, align: 'center', fontFace: 'Calibri', fontSize: 48, color: BLANCO, bold: true
  });
  if (subtitulo) {
    s.addText(subtitulo, {
      x: 0, y: 3.95, w: W, h: 0.5, align: 'center', fontFace: 'Calibri', fontSize: 18, color: CREMA
    });
  }
  s.addText(`Generado automáticamente al cierre del nivel · ${fechaTexto}`, {
    x: 0, y: 6.55, w: W, h: 0.35, align: 'center', fontFace: 'Calibri', fontSize: 11, color: GRIS_TEXTO
  });

  // ---------- KPIs ----------
  s = pres.addSlide();
  fondoBase(s, W, H, false);
  s.addText(`Resumen de Nivel ${nivelRomano}`, { x: 0.6, y: 0.45, w: 8, h: 0.5, fontFace: 'Calibri', fontSize: 26, color: BLANCO, bold: true });
  if (subtitulo) s.addText(subtitulo, { x: 0.6, y: 0.95, w: 8, h: 0.35, fontFace: 'Calibri', fontSize: 13, color: GRIS_TEXTO });

  const kpis = [
    { valor: String(datos.inscritos), etiqueta: 'Inscritos', color: DORADO },
    { valor: String(datos.registrados), etiqueta: 'Registrados', color: NARANJA },
    { valor: datos.desercion != null ? String(datos.desercion) : '—', etiqueta: 'Deserción', color: 'D9534F' },
    { valor: datos.porcentaje_desercion != null ? `${datos.porcentaje_desercion}%` : '—', etiqueta: '% Deserción', color: CREMA }
  ];
  const kpiW = 2.85, gap = 0.28, startX = (W - (kpiW * 4 + gap * 3)) / 2;
  kpis.forEach((k, i) => {
    const x = startX + i * (kpiW + gap);
    s.addShape('roundRect', { x, y: 1.9, w: kpiW, h: 2.0, rectRadius: 0.08, fill: { color: '1C1410' }, line: { color: '3A2E24', width: 1 } });
    s.addText(k.valor, { x, y: 2.15, w: kpiW, h: 1.05, align: 'center', fontFace: 'Calibri', fontSize: 40, bold: true, color: k.color, margin: 0 });
    s.addText(k.etiqueta.toUpperCase(), { x, y: 3.35, w: kpiW, h: 0.4, align: 'center', fontFace: 'Calibri', fontSize: 12, color: GRIS_TEXTO, charSpacing: 1.5, margin: 0 });
  });
  if (datos.sin_requisitos > 0) {
    s.addText(
      `Registrados = ${datos.registrados_con_requisito} con requisito + ${datos.sin_requisitos} sin requisito`,
      { x: 0.6, y: 4.35, w: W - 1.2, h: 0.4, fontFace: 'Calibri', fontSize: 12, color: GRIS_TEXTO, italic: true }
    );
  }

  // ---------- Perfil demográfico: una diapositiva por categoría, Con y Sin Requisito lado a lado ----------
  function diapositivaPerfil(titulo, subtitulo, datosCR, datosSR, color) {
    const sl = pres.addSlide();
    fondoBase(sl, W, H, false);
    sl.addText(titulo, { x: 0.6, y: 0.45, w: 10, h: 0.5, fontFace: 'Calibri', fontSize: 26, color: BLANCO, bold: true });
    sl.addText(subtitulo, { x: 0.6, y: 0.95, w: 10, h: 0.35, fontFace: 'Calibri', fontSize: 13, color: GRIS_TEXTO });

    sl.addText(`CON REQUISITO (${(datosCR || []).reduce((s2, f) => s2 + f.total, 0)})`, { x: 0.6, y: 1.55, w: 5.8, h: 0.35, fontFace: 'Calibri', fontSize: 12, color: CREMA, charSpacing: 1, bold: true });
    graficaBarras(pres, sl, datosCR, { x: 0.6, y: 2.0, w: 5.9, h: 4.6, chartColors: [color] });

    sl.addText(`SIN REQUISITO (${(datosSR || []).reduce((s2, f) => s2 + f.total, 0)})`, { x: 6.8, y: 1.55, w: 5.8, h: 0.35, fontFace: 'Calibri', fontSize: 12, color: '#F3DAD6', charSpacing: 1, bold: true });
    graficaBarras(pres, sl, datosSR, { x: 6.8, y: 2.0, w: 5.9, h: 4.6, chartColors: ['D9534F'] });
  }

  diapositivaPerfil('Estado civil', `De los ${datos.registrados} registrados en Nivel ${nivelRomano}`, datos.estado_civil?.con_requisito, datos.estado_civil?.sin_requisito, NARANJA);
  diapositivaPerfil('Cargo en FIHNEC', `De los ${datos.registrados} registrados en Nivel ${nivelRomano}`, datos.cargo_fihnec?.con_requisito, datos.cargo_fihnec?.sin_requisito, DORADO);
  diapositivaPerfil('Distribución por departamento', `Registrados en Nivel ${nivelRomano}`, datos.departamento?.con_requisito, datos.departamento?.sin_requisito, VERDE);

  return pres.write({ outputType: 'nodebuffer' });
}
