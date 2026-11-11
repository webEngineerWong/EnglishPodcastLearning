import { Controller, Get, Header, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { STORAGE_SERVICE_TOKEN } from './storage.tokens';
import type { StorageService } from './storage.interface';
import { guessMime } from './local-storage.service';

/**
 * 文件访问端点（不带 /api 前缀）：
 * GET /storage/file/<key>      本地直链，支持 Range（音频拖动进度必需）
 * GET /storage/signed/<key>    返回限时签名 URL（R2 私有桶）
 */
@Controller('storage')
export class StorageController {
  constructor(@Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService) {}

  @Get('file/*')
  @Header('Accept-Ranges', 'bytes')
  async file(@Param() params: { [key: string]: string }, @Res() res: Response, @Query('download') download?: string) {
    // Express 5 通配符参数可能落在 0 号键；兼容两种形态
    const raw = params['*'] ?? params[0] ?? '';
    const key = decodeURIComponent(raw);
    const meta = await this.storage.getMetadata(key);
    if (!meta) throw new NotFoundException(`Object not found: ${key}`);

    const mime = guessMime(key);
    const rangeHeader = res.req.headers.range;
    if (rangeHeader && typeof meta.sizeBytes === 'number' && meta.sizeBytes > 0) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), meta.sizeBytes - 1) : meta.sizeBytes - 1;
        if (start <= end && start < meta.sizeBytes) {
          const stream = await this.storage.getStream(key, { start, end });
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.sizeBytes}`);
          res.setHeader('Content-Length', end - start + 1);
          res.setHeader('Content-Type', mime);
          if (download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop() ?? 'file')}`);
          stream.pipe(res);
          return;
        }
      }
    }
    res.setHeader('Content-Length', meta.sizeBytes);
    res.setHeader('Content-Type', mime);
    if (download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop() ?? 'file')}`);
    const stream = await this.storage.getStream(key);
    stream.pipe(res);
  }

  @Get('signed/*')
  async signed(@Param() params: { [key: string]: string }, @Query('ttl') ttl?: string) {
    const raw = params['*'] ?? params[0] ?? '';
    const key = decodeURIComponent(raw);
    const url = await this.storage.getSignedUrl(key, ttl ? Number(ttl) : undefined);
    if (url.startsWith('http')) return { url, expiresIn: Number(process.env.R2_SIGNED_URL_TTL ?? 3600) };
    return { url, expiresIn: null, local: true };
  }
}
