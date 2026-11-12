import { BadRequestException, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.tokens';
import type { StorageService } from '../storage/storage.interface';

/** RFC 6266：filename* 正确编码中文文件名；filename 提供纯 ASCII 兜底 */
function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService
  ) {}

  /** 课程文档以 inline 方式输出（学习笔记 PDF 预览用） */
  async streamDocumentInline(id: string, res: Response, download?: string): Promise<void> {
    const doc = await this.prisma.documentAsset.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    await this.streamPdf(res, doc.storageKey, doc.originalName, download);
  }

  /** 校对页预览：按 ImportFile 输出原始 PDF（学习笔记不解析，仅预览） */
  async streamImportFileInline(fileId: string, res: Response): Promise<void> {
    const f = await this.prisma.importFile.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException(`ImportFile ${fileId} not found`);
    await this.streamPdf(res, f.storageKey, f.originalName);
  }

  /** inline PDF 流式输出：Range 请求照 /storage/file 音频接口实现；
   *  刻意不设置 X-Frame-Options / CSP frame-ancestors，允许 Web(:3000) 跨源 iframe 内嵌。 */
  private async streamPdf(res: Response, key: string, originalName: string, download?: string): Promise<void> {
    const meta = await this.storage.getMetadata(key);
    if (!meta) throw new NotFoundException(`Object not found: ${key}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(download ? 'attachment' : 'inline', originalName));
    res.setHeader('Accept-Ranges', 'bytes');
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
          stream.pipe(res);
          return;
        }
      }
    }
    res.setHeader('Content-Length', meta.sizeBytes);
    const stream = await this.storage.getStream(key);
    stream.pipe(res);
  }

  /** 删除学习笔记文档（仅允许 role = notes）；内容寻址存储可能共享文件，有其他引用时不物理删除 */
  async remove(id: string): Promise<{ deleted: boolean; fileRemoved: boolean }> {
    const doc = await this.prisma.documentAsset.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    if (doc.role !== 'notes') throw new BadRequestException('仅允许删除学习笔记文档');
    const [otherDocs, importFiles] = await Promise.all([
      this.prisma.documentAsset.count({ where: { storageKey: doc.storageKey, id: { not: id } } }),
      this.prisma.importFile.count({ where: { storageKey: doc.storageKey } })
    ]);
    await this.prisma.documentAsset.delete({ where: { id } });
    let fileRemoved = false;
    if (otherDocs === 0 && importFiles === 0) {
      await this.storage.delete(doc.storageKey);
      fileRemoved = true;
    }
    return { deleted: true, fileRemoved };
  }
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  /** 内嵌预览：inline PDF，支持 Range（照音频 /storage/file 实现）；?download=1 转为附件下载 */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response, @Query('download') download?: string) {
    await this.service.streamDocumentInline(id, res, download);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
