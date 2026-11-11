/** esbuild 编译主进程与 preload 到 dist-electron */
import * as esbuild from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  minify: false
};

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await esbuild.context({
    ...common,
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'dist-electron'
  });
  await ctx.watch();
  console.log('[build-main] watching...');
} else {
  await esbuild.build({
    ...common,
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'dist-electron'
  });
  console.log('[build-main] done');
}
