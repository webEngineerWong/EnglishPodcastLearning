import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import type { StorageService, StoredObject } from './storage.interface';
import { guessMime } from './local-storage.service';

/**
 * Cloudflare R2 存储（S3 兼容 API，私有 bucket + 限时签名 URL）。
 * 未配置密钥时不可用；本地开发使用 STORAGE_DRIVER=local。
 */
@Injectable()
export class R2StorageService implements StorageService {
  private readonly logger = new Logger('R2Storage');
  private client: S3Client;
  private bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET ?? 'elp-private';
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('R2 credentials missing; set STORAGE_DRIVER=local or configure R2_* env vars');
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType })
    );
    this.logger.log(`uploaded ${key} (${buffer.byteLength} bytes)`);
    return { key, url: `/storage/signed/${encodeURIComponent(key)}`, sizeBytes: buffer.byteLength, mimeType };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`delete ${key} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async getSignedUrl(key: string, ttlSec = Number(process.env.R2_SIGNED_URL_TTL ?? 3600)): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: Math.min(Math.max(ttlSec, 60), 604800) });
  }

  async getStream(key: string, range?: { start: number; end: number }): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {})
      })
    );
    return res.Body as Readable;
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; mimeType: string; lastModified: Date } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        sizeBytes: res.ContentLength ?? 0,
        mimeType: res.ContentType ?? guessMime(key),
        lastModified: res.LastModified ?? new Date()
      };
    } catch {
      return null;
    }
  }
}
