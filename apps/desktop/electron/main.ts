/**
 * Electron 主进程：安全基线（contextIsolation + 无 Node 权限渲染端）+ 窗口/托盘/全局快捷键/本地文件导入 IPC。
 */
import { app, BrowserWindow, Tray, Menu, globalShortcut, dialog, ipcMain, nativeImage, shell, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// 独立 userData：避免与 dev 版互相持有单实例锁/缓存（必须在首次 getPath('userData') 前设置）
app.setName('English Podcast Learning');

const isDev = !!process.env.ELP_DEV;
const API_BASE_DEFAULT = 'http://localhost:3001';
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.srt', '.mp3', '.m4a', '.wav', '.mp4']);
const MAX_FILE_BYTES = 200 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function resourceIcon(): Electron.NativeImage {
  // 16x16 模板图标；打包后走 resources
  const iconPath = path.join(__dirname, '../resources/trayicon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'English Podcast Learning',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0b0f1c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require('electron')；渲染进程仍无 Node 权限
      webSecurity: true
    }
  });

  if (isDev && process.env.ELP_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELP_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer-dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => (mainWindow = null));
}

function sendTrayCommand(cmd: string) {
  mainWindow?.webContents.send('tray-command', cmd);
}

function createTray() {
  try {
    tray = new Tray(resourceIcon());
    const menu = Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: '播放 / 暂停', click: () => sendTrayCommand('play-pause') },
      { label: '快退 5 秒', click: () => sendTrayCommand('skip-back') },
      { label: '快进 5 秒', click: () => sendTrayCommand('skip-forward') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]);
    tray.setToolTip('English Podcast Learning');
    tray.setContextMenu(menu);
  } catch (e) {
    console.error('tray failed', e);
  }
}

/** 读取本地 API 配置（userData/config.json） */
function getApiBaseUrl(): string {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (typeof cfg.apiBaseUrl === 'string' && cfg.apiBaseUrl.startsWith('http')) return cfg.apiBaseUrl;
  } catch {
    /* 默认 */
  }
  return process.env.ELP_API_BASE ?? API_BASE_DEFAULT;
}

function registerIpc() {
  // 文件选择对话框（渲染端无 Node 权限，仅能通过此 IPC 拿到用户显式选择的文件）
  ipcMain.handle('dialog:select-files', async (_e, opts?: { extensions?: string[]; multiple?: boolean }) => {
    const exts = (opts?.extensions ?? Array.from(ALLOWED_EXTENSIONS)).map((e) => (e.startsWith('.') ? e : '.' + e));
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: [opts?.multiple === false ? 'openFile' : 'openFile', 'multiSelections'],
      filters: [{ name: '学习资料', extensions: exts.map((e) => e.slice(1)) }]
    });
    if (result.canceled) return [];
    // 路径与扩展名双重验证
    return result.filePaths.filter((p) => ALLOWED_EXTENSIONS.has(path.extname(p).toLowerCase()));
  });

  // 读取用户显式选择的本地文件（限制类型与大小）
  ipcMain.handle('fs:read-file', async (_e, filePath: string, maxBytes?: number) => {
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`不支持的文件类型: ${ext}`);
    const st = await fs.promises.stat(resolved);
    const limit = Math.min(maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
    if (st.size > limit) throw new Error(`文件过大（>${Math.round(limit / 1024 / 1024)}MB）`);
    const buf = await fs.promises.readFile(resolved);
    return { name: path.basename(resolved), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });

  registerAudioCacheIpc();

  ipcMain.handle('app:api-base-url', () => getApiBaseUrl());
  ipcMain.handle('app:platform', () => `${process.platform}-${process.arch}`);
}

// ==================== 音频磁盘缓存（PC 端锁屏/续播预加载） ====================
// userData/audio-cache/{courseId}-{audioId}.{ext}；打开课程命中缓存即本地秒开，
// 未命中远程播放 + 后台静默下载供下次使用。进行中下载共享同一 Promise 防重复。

const audioCacheInflight = new Map<string, Promise<{ ok: boolean; sizeBytes: number }>>();

function audioCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'audio-cache');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** key 白名单校验（courseId-audioId.ext），防路径穿越 */
function audioCachePath(key: string): string | null {
  if (!/^[A-Za-z0-9._-]{1,150}$/.test(key)) return null;
  return path.join(audioCacheDir(), key);
}

function registerAudioCacheIpc() {
  ipcMain.handle('audio-cache:resolve', (_e, key: string) => {
    const p = audioCachePath(key);
    try {
      return { cached: !!(p && fs.existsSync(p) && fs.statSync(p).size > 0) };
    } catch {
      return { cached: false };
    }
  });

  ipcMain.handle('audio-cache:fetch', (_e, url: string, key: string) => {
    const p = audioCachePath(key);
    if (!p || !/^https?:\/\//i.test(url)) return Promise.resolve({ ok: false, sizeBytes: 0 });
    if (fs.existsSync(p) && fs.statSync(p).size > 0) {
      return Promise.resolve({ ok: true, sizeBytes: fs.statSync(p).size });
    }
    let job = audioCacheInflight.get(key);
    if (!job) {
      job = (async () => {
        const resp = await net.fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.byteLength === 0) throw new Error('EMPTY_BODY');
        if (buf.byteLength > MAX_FILE_BYTES) throw new Error('文件过大');
        // 先写临时文件再原子改名，避免半截文件被当作有效缓存
        const tmp = `${p}.tmp-${Date.now()}`;
        await fs.promises.writeFile(tmp, buf);
        await fs.promises.rename(tmp, p);
        console.log(`[audio-cache] saved ${key} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
        return { ok: true, sizeBytes: buf.byteLength };
      })().catch((e) => {
        console.warn('[audio-cache] download failed:', key, e instanceof Error ? e.message : e);
        return { ok: false, sizeBytes: 0 };
      }).finally(() => audioCacheInflight.delete(key));
      audioCacheInflight.set(key, job);
    }
    return job;
  });

  ipcMain.handle('audio-cache:read', async (_e, key: string) => {
    const p = audioCachePath(key);
    if (!p || !fs.existsSync(p)) throw new Error('NOT_CACHED');
    const buf = await fs.promises.readFile(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  });
}

console.log('[main] booting, userData =', app.getPath('userData'));
const gotLock = app.requestSingleInstanceLock();
console.log('[main] single-instance lock:', gotLock);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    createTray();

    // 全局快捷键（应用未聚焦也可用）
    globalShortcut.register('CommandOrControl+Alt+E', () => {
      if (!mainWindow) return;
      mainWindow.isVisible() && mainWindow.isFocused() ? mainWindow.hide() : mainWindow.show();
    });
    globalShortcut.register('CommandOrControl+Alt+P', () => sendTrayCommand('play-pause'));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  });
}

app.on('quit', () => console.log('[main] quitting, exitCode =', process.exitCode));
app.on('window-all-closed', () => {
  // macOS 惯例：不退出，留在托盘
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
