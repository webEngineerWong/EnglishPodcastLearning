import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { fileURLToPath } from 'url';

const r = (p: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), p);

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'renderer-dist' },
  resolve: {
    alias: [
      { find: '@elp/types', replacement: r('../../packages/types/src/index.ts') },
      { find: '@elp/api-client', replacement: r('../../packages/api-client/src/index.ts') },
      { find: '@elp/learning-core', replacement: r('../../packages/learning-core/src/index.ts') },
      { find: '@elp/player', replacement: r('../../packages/player/src/index.ts') },
      { find: '@elp/ui', replacement: r('../../packages/ui/src/index.ts') }
    ]
  }
});
