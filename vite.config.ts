import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: 'API_BASE_URL',
  plugins: [react()],
  server: { port: 5173 },
});
