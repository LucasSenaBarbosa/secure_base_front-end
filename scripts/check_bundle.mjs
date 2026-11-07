// Confere o tamanho do JS baixado na primeira tela (entrada + modulepreload do index.html).
// Uso: node scripts/check_bundle.mjs [pasta-do-build] — padrão: dist
// Limite: 300 KB sem compressão. Em nov/2026 o pacote inicial tinha ~211 KB; o limite
// pega regressões como uma página ou o three.js voltando a ser importado direto na entrada.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT_KB = 300;
const dist = process.argv[2] ?? 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+\.js)"/g),
].map((m) => m[1]);

if (files.length === 0) {
  console.error('Nenhum script de entrada encontrado em index.html.');
  process.exit(1);
}

let total = 0;
for (const file of new Set(files)) {
  const kb = statSync(join(dist, file)).size / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(8)} KB  ${file}`);
}
console.log(`${total.toFixed(1).padStart(8)} KB  total inicial (limite ${LIMIT_KB} KB)`);

const heavy = files.filter((f) => /\/(three|echarts)-/.test(f));
if (heavy.length) {
  console.error(`Bibliotecas pesadas carregadas na primeira tela: ${heavy.join(', ')}`);
  process.exit(1);
}
if (total > LIMIT_KB) {
  console.error(`O pacote inicial passou de ${LIMIT_KB} KB.`);
  process.exit(1);
}
