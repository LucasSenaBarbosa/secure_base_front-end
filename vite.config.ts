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
  };
});
