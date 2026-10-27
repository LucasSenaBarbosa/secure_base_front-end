import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function ensureProtoboard(): Plugin {
  return {
    name: 'ensure-protoboard',
    buildStart() {
      const file = 'public/models/protoboard.glb';
      if (existsSync(file)) return;
      const result = spawnSync(process.execPath, ['scripts/generate_protoboard.mjs'], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error('Não foi possível gerar a protoboard.');
    },
  };
}

export default defineConfig({ plugins: [ensureProtoboard(), react()], server: { port: 5173 } });
