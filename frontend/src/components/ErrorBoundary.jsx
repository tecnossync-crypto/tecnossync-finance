import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Tras publicar una versión nueva, una pestaña vieja pide archivos que ya no existen:
// se recarga una sola vez para traer la versión actual.
const isChunkError = (e) => /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError|Loading chunk/i.test(String(e?.message || e));

export function reloadOnceForNewVersion() {
  try {
    if (sessionStorage.getItem('ledger.reloaded')) return false;
    sessionStorage.setItem('ledger.reloaded', '1');
  } catch { /* sin storage: recarga igual */ }
  window.location.reload();
  return true;
}

// Si una pantalla falla, solo esa muestra el aviso: el menú y el resto de la app siguen funcionando.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) {
    if (isChunkError(error) && reloadOnceForNewVersion()) return;
    console.error(error);
  }

  componentDidUpdate(prev) {
    // al cambiar de pantalla se limpia el error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);
    return (
      <div className="card max-w-lg mx-auto mt-6 p-6 text-center">
        <div className="mx-auto h-11 w-11 rounded-xl bg-danger-50 text-danger grid place-items-center mb-3"><AlertTriangle size={20} /></div>
        <h2 className="text-[18px] font-semibold">{chunk ? 'Hay una versión nueva' : 'Esta pantalla tuvo un problema'}</h2>
        <p className="text-text-muted text-[13.5px] mt-1.5">
          {chunk ? 'Recarga para usar la última versión.' : 'Tus datos están a salvo. Prueba de nuevo; si sigue pasando, avísanos qué estabas haciendo.'}
        </p>
        <div className="flex justify-center gap-2 mt-5">
          {!chunk && <button className="btn-outline" onClick={() => this.setState({ error: null })}>Reintentar</button>}
          <button className="btn-primary" onClick={() => window.location.reload()}><RotateCcw size={15} /> Recargar</button>
        </div>
      </div>
    );
  }
}
