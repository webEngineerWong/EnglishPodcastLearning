/** 桌面端开发编排：esbuild watch + vite renderer + electron */
import { spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

const procs = [];
const run = (cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  procs.push(p);
  return p;
};

const tryConnect = (port, host) =>
  new Promise((ok) => {
    const s = net.connect({ port, host }, () => {
      s.destroy();
      ok(true);
    });
    s.on('error', () => {
      s.destroy();
      ok(false);
    });
  });

const waitPort = async (port, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    // vite 监听 localhost，可能落在 ::1 或 127.0.0.1
    if (await tryConnect(port, 'localhost')) return true;
    if (await tryConnect(port, '127.0.0.1')) return true;
    if (await tryConnect(port, '::1')) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const esbuildProc = run(process.execPath, [path.join(dir, 'build-main.mjs'), '--watch']);
const viteProc = run('npx', ['vite', '--port', '5173', '--strictPort']);

const ok = await waitPort(5173);
if (!ok) {
  console.error('vite dev server 未就绪');
  process.exit(1);
}

const electronBin = path.join(root, 'node_modules/.bin/electron');
const electronProc = run(electronBin, ['.'], {
  env: { ...process.env, ELP_DEV: '1', ELP_RENDERER_URL: 'http://localhost:5173' }
});

const cleanup = () => {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
};
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
electronProc.on('exit', () => {
  cleanup();
  process.exit(0);
});
