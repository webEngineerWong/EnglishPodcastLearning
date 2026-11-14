/**
 * PC 端音频磁盘缓存（Electron 桥接封装）：
 * - 打开课程时命中缓存转本地 Blob URL 秒开（锁屏/后台续播不再耗流量、不卡网络）；
 * - 未命中则调用方用远程 URL 立即播放，同时 warmAudioCache 后台静默下载供下次使用。
 * Blob URL 按课程缓存（上限 4 个，超出释放最早的，避免内存常驻过多音频）。
 */
import { desktop } from './bridge';

const MAX_BLOB_URLS = 4;
const blobUrls = new Map<string, string>(); // key -> objectURL（插入序即最近使用序）

function cacheKeyOf(courseId: string, audioId: string, originalName: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(originalName.trim());
  const ext = m ? m[1].toLowerCase() : 'mp3';
  return `${courseId}-${audioId}.${ext}`;
}

function rememberBlobUrl(key: string, url: string): void {
  if (blobUrls.has(key)) blobUrls.delete(key);
  blobUrls.set(key, url);
  while (blobUrls.size > MAX_BLOB_URLS) {
    const oldestKey = blobUrls.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const oldest = blobUrls.get(oldestKey);
    blobUrls.delete(oldestKey);
    if (oldest) URL.revokeObjectURL(oldest);
  }
}

/** 命中缓存时返回可直接播放的本地 Blob URL；非桌面环境/未缓存/读取失败返回 null */
export async function cachedAudioUrl(courseId: string, audioId: string, originalName: string): Promise<string | null> {
  const bridge = desktop();
  if (!bridge) return null;
  const key = cacheKeyOf(courseId, audioId, originalName);
  const existing = blobUrls.get(key);
  if (existing) {
    // 刷新 LRU 序
    blobUrls.delete(key);
    blobUrls.set(key, existing);
    return existing;
  }
  try {
    const { cached } = await bridge.resolveAudioCache(key);
    if (!cached) return null;
    const data = await bridge.readAudioCache(key);
    const url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    rememberBlobUrl(key, url);
    return url;
  } catch {
    return null;
  }
}

/** 后台静默缓存（不阻塞播放）；已缓存或下载中时主进程自动去重 */
export function warmAudioCache(courseId: string, audioId: string, originalName: string, remoteUrl: string): void {
  const bridge = desktop();
  if (!bridge) return;
  const key = cacheKeyOf(courseId, audioId, originalName);
  void bridge
    .resolveAudioCache(key)
    .then(({ cached }) => (cached ? null : bridge.downloadAudioCache(remoteUrl, key)))
    .catch(() => undefined);
}
