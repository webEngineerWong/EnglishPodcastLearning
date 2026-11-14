/**
 * 离线下载模块（iOS 沙盒存储）
 * 音频 + 课程详情（双语文本）缓存到 documents/downloads/，清单存 AsyncStorage。
 * 离线播放用本地 file:// URI；离线读字幕用缓存的 detail JSON。
 *
 * 容错设计：对 expo-file-system 进行安全导入与运行时探测，
 * 若当前安装的原生二进制尚未包含 FileSystem 模块，则优雅降级，防止应用顶层崩溃白屏。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CourseDetail } from './App';

let fsModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  fsModule = require('expo-file-system');
} catch (e) {
  console.warn('[Offline] expo-file-system native module unavailable:', e);
}

export function isOfflineAvailable(): boolean {
  try {
    return !!(fsModule && fsModule.Paths && fsModule.Paths.document && fsModule.File && fsModule.Directory);
  } catch {
    return false;
  }
}

const MANIFEST_KEY = 'elp-downloads';

export type OfflineEntry = {
  courseId: string;
  title: string;
  audioId: string;
  originalName: string;
  /** 音频本地 file:// URI（expo-audio 可直接 replace 播放） */
  audioUri: string;
  /** 课程详情 JSON（含双语文本）本地 file:// URI */
  courseJsonPath: string;
  sizeBytes: number;
  downloadedAt: string;
};

type Manifest = Record<string, OfflineEntry>;

function downloadsDir(): any {
  if (!isOfflineAvailable()) return null;
  try {
    const dir = new fsModule.Directory(fsModule.Paths.document, 'downloads');
    if (!dir.exists) dir.create({ idempotent: true });
    return dir;
  } catch (e) {
    console.warn('[Offline] Failed to get downloads directory:', e);
    return null;
  }
}

function extOf(originalName: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(originalName.trim());
  return m ? m[1].toLowerCase() : 'mp3';
}

/** 拼接 API 地址（本地驱动返回 /storage/... 相对路径；R2 为完整 presigned URL） */
export function resolveUrl(apiBase: string, url: string): string {
  return url.startsWith('http') ? url : apiBase + url;
}

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as Manifest) : {};
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

/** 该课程已下载且音频文件仍在沙盒（清单失效时顺手清理） */
export async function getOfflineEntry(courseId: string): Promise<OfflineEntry | null> {
  if (!isOfflineAvailable()) return null;
  try {
    const manifest = await readManifest();
    const entry = manifest[courseId];
    if (!entry) return null;
    if (!new fsModule.File(entry.audioUri).exists) {
      delete manifest[courseId];
      await writeManifest(manifest);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/** 列出全部已下载课程（课程列表/学习台展示离线标记用） */
export async function listOfflineEntries(): Promise<OfflineEntry[]> {
  if (!isOfflineAvailable()) return [];
  try {
    const manifest = await readManifest();
    const entries: OfflineEntry[] = [];
    for (const entry of Object.values(manifest)) {
      if (new fsModule.File(entry.audioUri).exists) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

export type DownloadProgress = {
  /** 0~1（totalBytes 未知时为 0） */
  ratio: number;
  /** 已传输字节 */
  bytesWritten: number;
  /** 总字节（服务器未给 Content-Length 时为 -1） */
  totalBytes: number;
};

/**
 * 下载课程音频 + 缓存课程详情 JSON。进度回调以 1% 为步长，避免高频重渲。
 * 下载前 detail 由调用方现场获取（签名 URL TTL 7200s，足够完成下载）。
 */
export async function downloadCourse(
  apiBase: string,
  detail: CourseDetail,
  onProgress?: (p: DownloadProgress) => void
): Promise<OfflineEntry> {
  if (!isOfflineAvailable()) {
    throw new Error('原生离线模块未就绪，请重新构建安装 iOS 客户端');
  }
  const audio = detail.audios?.[0];
  if (!audio?.url) throw new Error('NO_AUDIO');

  const dir = downloadsDir();
  if (!dir) throw new Error('OFFLINE_UNAVAILABLE');
  const dest = new fsModule.File(dir, `${detail.id}-${audio.id}.${extOf(audio.originalName)}`);
  // DownloadTask 不支持覆盖：重下前先删旧文件
  if (dest.exists) dest.delete();
  let totalBytes = 0;
  let lastRatio = -1;

  const task = fsModule.File.createDownloadTask(resolveUrl(apiBase, audio.url), dest, {
    onProgress: ({ bytesWritten, totalBytes: total }: { bytesWritten: number; totalBytes: number }) => {
      totalBytes = total > 0 ? total : bytesWritten;
      const ratio = total > 0 ? bytesWritten / total : 0;
      if (ratio - lastRatio >= 0.01) {
        lastRatio = ratio;
        onProgress?.({ ratio, bytesWritten, totalBytes: total });
      }
    }
  });
  const file = await task.downloadAsync();
  if (!file?.exists) throw new Error('DOWNLOAD_FAILED');

  const detailFile = new fsModule.File(dir, `${detail.id}.json`);
  detailFile.write(JSON.stringify(detail));

  const entry: OfflineEntry = {
    courseId: detail.id,
    title: detail.title,
    audioId: audio.id,
    originalName: audio.originalName,
    audioUri: file.uri,
    courseJsonPath: detailFile.uri,
    sizeBytes: totalBytes || dest.size,
    downloadedAt: new Date().toISOString()
  };
  const manifest = await readManifest();
  manifest[detail.id] = entry;
  await writeManifest(manifest);
  return entry;
}

/** 删除本地音频 + 详情 JSON + 清单项 */
export async function removeOfflineEntry(courseId: string): Promise<void> {
  const manifest = await readManifest();
  const entry = manifest[courseId];
  if (entry) {
    if (isOfflineAvailable()) {
      for (const uri of [entry.audioUri, entry.courseJsonPath]) {
        try {
          if (new fsModule.File(uri).exists) new fsModule.File(uri).delete();
        } catch {
          // 单个文件删除失败不阻塞清单清理
        }
      }
    }
    delete manifest[courseId];
    await writeManifest(manifest);
  }
}

/** 断网回退：读取缓存的课程详情（双语文本可离线阅读） */
export async function loadCachedDetail(courseId: string): Promise<CourseDetail | null> {
  if (!isOfflineAvailable()) return null;
  try {
    const manifest = await readManifest();
    const entry = manifest[courseId];
    if (!entry) return null;
    const file = new fsModule.File(entry.courseJsonPath);
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as CourseDetail;
  } catch {
    return null;
  }
}

/** 字节转 MB 展示 */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 MB';
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
