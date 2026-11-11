import * as fs from 'fs';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { StorageService, StoredObject } from './storage.interface';

/** 本地磁盘存储（开发默认）。root 默认 <repo>/data/storage */
@Injectable()
export class LocalStorageService implements StorageService {
  readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), '../../data/storage'));
    fs.mkdirSync(this.root, { recursive: true });
  }

  private resolveKey(key: string): string {
    // 防目录穿越：规范化后必须仍在 root 内
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new NotFoundException(`Invalid storage key: ${key}`);
    }
    return full;
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return { key, url: `/storage/file/${key}`, sizeBytes: buffer.byteLength, mimeType };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    await fs.promises.rm(full, { force: true });
  }

  async getSignedUrl(key: string): Promise<string> {
    // 本地模式：返回 API 自身的流式直链（长期有效）
    return `/storage/file/${key}`;
  }

  async getStream(key: string, range?: { start: number; end: number }): Promise<NodeJS.ReadableStream> {
    const full = this.resolveKey(key);
    if (range) {
      return fs.createReadStream(full, { start: range.start, end: range.end });
    }
    return fs.createReadStream(full);
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; mimeType: string; lastModified: Date } | null> {
    const full = this.resolveKey(key);
    try {
      const st = await fs.promises.stat(full);
      return { sizeBytes: st.size, mimeType: guessMime(key), lastModified: st.mtime };
    } catch {
      return null;
    }
  }
}

export function guessMime(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };
  return map[ext] ?? 'application/octet-stream';
}
