import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const apiBaseUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL?.trim();

  if (mode === 'production') {
    if (!apiBaseUrl) {
      throw new Error('VITE_API_BASE_URL precisa estar definida para o build de produção.');
    }

    let apiUrl: URL;
    try {
      apiUrl = new URL(apiBaseUrl);
    } catch {
      throw new Error('VITE_API_BASE_URL precisa ser uma URL absoluta válida.');
    }

    if (
      !['http:', 'https:'].includes(apiUrl.protocol)
      || apiUrl.hostname === 'localhost'
      || apiUrl.hostname.endsWith('.localhost')
      || apiUrl.hostname === '::1'
      || /^127(?:\.\d{1,3}){3}$/.test(apiUrl.hostname)
    ) {
      throw new Error('VITE_API_BASE_URL não pode apontar para localhost no build de produção.');
    }
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
    build: {
      // three.js + R3F (~1 MB) é baixado só nas páginas 3D; o limite cobre esse arquivo de biblioteca.
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        output: {
          // Bibliotecas em arquivos próprios: mudam pouco, então o navegador as reaproveita do cache entre deploys.
          manualChunks(id: string) {
            // Utilitários internos usados pela entrada: sem isto o Rollup os coloca no arquivo do three
            // e a primeira tela passa a baixar o three.js inteiro.
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](three|three-stdlib|@react-three|postprocessing|maath|troika-|meshline|camera-controls|@monogrid)/.test(id)) return 'three';
            if (/[\\/]node_modules[\\/](echarts|echarts-liquidfill|zrender)[\\/]/.test(id)) return 'echarts';
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
