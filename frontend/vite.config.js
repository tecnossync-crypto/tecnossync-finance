import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, proxy: { '/api': 'http://localhost:4100' } },
  build: {
    rollupOptions: {
      // Librerías en archivos aparte: cambian poco, así el navegador las reutiliza entre versiones
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], icons: ['lucide-react'] } },
    },
  },
});
