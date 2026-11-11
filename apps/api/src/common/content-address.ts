/**
 * 内容寻址辅助（借鉴 GitHub blob 模型）：
 * 同一 sha256 的文件全平台只存一份；已有对象直接复用 key，不重复写盘。
 * 同名不同内容 / 同内容不同名：按 sha256 判重，与文件名无关 —— 中文名/英文名一视同仁。
 */
import { createHash } from 'crypto';

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** 存储键：imports/<日期>/<sha8>-<安全文件名> —— 同 sha 同名得到同一个 key（天然幂等） */
export function contentKey(sha256: string, originalName: string, prefix = 'imports'): string {
  const date = new Date().toISOString().slice(0, 10);
  // 保留中文与常用字符；控制字符与路径分隔符全部替换
  const safe = originalName.replace(/[^\w.\-\u4e00-\u9fff\u3400-\u4dbf]/g, '_').slice(0, 120);
  return `${prefix}/${date}/${sha256.slice(0, 8)}-${safe}`;
}
