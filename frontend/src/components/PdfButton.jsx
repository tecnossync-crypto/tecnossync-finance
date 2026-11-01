import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadPdf, pdfName } from '../lib/pdf';
import { useToast, cx } from './ui';

// Descarga la hoja visible (.print-sheet) como PDF
export default function PdfButton({ name, ticket, className = 'btn-primary', label = 'Descargar PDF' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const el = document.querySelector('.print-sheet');
    if (!el) return;
    setBusy(true);
    try { await downloadPdf(el, pdfName(name || document.title), { ticket }); }
    catch (e) { toast('No se pudo generar el PDF', 'error'); console.error(e); }
    finally { setBusy(false); }
  };
  return (
    <button className={cx(className, 'no-print')} onClick={run} disabled={busy}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {busy ? 'Generando…' : label}
    </button>
  );
}
