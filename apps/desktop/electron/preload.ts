/**
 * Preload：仅暴露最小安全 API，渲染进程无任何 Node 权限。
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  /** 系统文件选择对话框；返回用户显式选择的已验证路径 */
  selectFiles: (opts?: { extensions?: string[]; multiple?: boolean }) =>
    ipcRenderer.invoke('dialog:select-files', opts) as Promise<string[]>,
  /** 读取用户显式选择的本地文件（主进程做类型/大小校验） */
  readLocalFile: (path: string, maxBytes?: number) =>
    ipcRenderer.invoke('fs:read-file', path, maxBytes) as Promise<{ name: string; data: ArrayBuffer }>,
  getApiBaseUrl: () => ipcRenderer.invoke('app:api-base-url') as Promise<string>,
  getPlatform: () => ipcRenderer.invoke('app:platform') as Promise<string>,
  /** 音频磁盘缓存：查询是否已缓存 */
  resolveAudioCache: (key: string) => ipcRenderer.invoke('audio-cache:resolve', key) as Promise<{ cached: boolean }>,
  /** 音频磁盘缓存：后台下载（进行中复用同一任务），不阻塞播放 */
  downloadAudioCache: (url: string, key: string) =>
    ipcRenderer.invoke('audio-cache:fetch', url, key) as Promise<{ ok: boolean; sizeBytes: number }>,
  /** 音频磁盘缓存：读取缓存字节（未缓存时 reject） */
  readAudioCache: (key: string) => ipcRenderer.invoke('audio-cache:read', key) as Promise<ArrayBuffer>,
  /** 托盘/全局快捷键命令订阅，返回取消函数 */
  onTrayCommand: (handler: (cmd: string) => void) => {
    const listener = (_e: unknown, cmd: string) => handler(cmd);
    ipcRenderer.on('tray-command', listener);
    return () => ipcRenderer.removeListener('tray-command', listener);
  }
};

contextBridge.exposeInMainWorld('elp', api);

export type DesktopApi = typeof api;
