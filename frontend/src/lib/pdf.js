// Descarga una hoja (.print-sheet) como PDF, sin pasar por el diálogo de imprimir.
// Las librerías se cargan solo al usarlo, así no pesan en el resto de la app.

const LETTER = { w: 215.9, h: 279.4 }; // mm
const PX_PER_MM = 96 / 25.4;
const SCALE = 2;

export async function downloadPdf(el, filename, { ticket = false } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  await document.fonts?.ready;

  const widthPx = Math.round((ticket ? 72 : LETTER.w) * PX_PER_MM);
  let cuts = []; // dónde puede cortarse la página sin partir una fila (px dentro de la hoja)
  const canvas = await html2canvas(el, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: 1280, // la hoja se arma con el diseño de escritorio aunque estés en el teléfono
    onclone: (doc, clone) => {
      clone.classList.add('pdf-render');
      clone.style.width = `${widthPx}px`;
      const top = clone.getBoundingClientRect().top;
      cuts = [...clone.querySelectorAll('tr, .break-inside-avoid, header, footer, section, p')]
        .map((n) => n.getBoundingClientRect())
        .flatMap((r) => [r.top - top, r.bottom - top]);
    },
  });

  const pxH = canvas.height / SCALE; // alto de la hoja en px CSS
  if (ticket) {
    const pdf = new jsPDF({ unit: 'mm', format: [80, pxH / PX_PER_MM + 8] });
    pdf.addImage(canvas, 'JPEG', 4, 4, 72, pxH / PX_PER_MM, undefined, 'FAST');
    pdf.save(`${filename}.pdf`);
    return;
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageH = LETTER.h * PX_PER_MM;
  const margin = 12 * PX_PER_MM; // la primera página trae su margen superior en la hoja; las demás lo reciben aquí
  cuts = [...new Set(cuts.map(Math.round))].sort((a, b) => a - b);
  let y = 0;
  let first = true;
  while (y < pxH - 1) {
    const room = pageH - margin * (first ? 1 : 2);
    let end = Math.min(y + room, pxH);
    if (end < pxH) {
      // último borde de fila que entra en la página (si no hay ninguno razonable, corte directo)
      const best = cuts.filter((c) => c > y + room * 0.5 && c <= end).pop();
      if (best) end = best;
    }
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.ceil((end - y) * SCALE);
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.floor(y * SCALE), canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (!first) pdf.addPage();
    pdf.addImage(slice, 'JPEG', 0, first ? 0 : 12, LETTER.w, (end - y) / PX_PER_MM, undefined, 'FAST');
    first = false;
    y = end;
  }
  pdf.save(`${filename}.pdf`);
}

// Nombre de archivo seguro a partir de un título
export const pdfName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
