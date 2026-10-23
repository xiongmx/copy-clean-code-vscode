import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/extension.mjs'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: false,
  minify: false,
  legalComments: 'eof',
  metafile: true,
  logLevel: 'info'
});
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/build-meta.json', JSON.stringify(result.metafile, null, 2) + '\n');
await import('./notices.mjs');
