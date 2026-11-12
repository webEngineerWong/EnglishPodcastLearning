import { BadRequestException, Body, Controller, Inject, Injectable, Module, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.tokens';
import { fixFilename } from '../common/filename';
import type { StorageService } from '../storage/storage.interface';

const AUDIO_MIME = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'video/mp4'];
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.aac', '.mp4'];
const DOC_EXT = ['.pdf', '.txt', '.srt'];
const DOC_MIME = ['application/pdf', 'text/plain'];

const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB ?? 200) || 200) * 1024 * 1024;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

@Injectable()
export class UploadsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService
  ) {}

  /** 生成受控存储 key：uploads/<date>/<rand><ext> */
  private buildKey(originalName: string, prefix: string): string {
    const ext = extOf(originalName);
    const date = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}/${date}/${Date.now()}-${rand}${ext}`;
  }

  private validate(name: string, mimetype: string, kind: 'audio' | 'document', size: number) {
    if (size > MAX_BYTES) {
      throw new BadRequestException(`文件超过大小限制 ${MAX_BYTES / 1024 / 1024}MB`);
    }
    const ext = extOf(name);
    if (kind === 'audio') {
      if (!AUDIO_EXT.includes(ext) || (mimetype && !AUDIO_MIME.includes(mimetype) && !mimetype.startsWith('audio/'))) {
        throw new BadRequestException(`不支持的音频类型: ${name}`);
      }
    } else {
      if (!DOC_EXT.includes(ext) || (mimetype && !DOC_MIME.includes(mimetype) && mimetype !== 'application/octet-stream')) {
        throw new BadRequestException(`不支持的文档类型: ${name}`);
      }
    }
  }

  async uploadAudio(file: Express.Multer.File, courseId: string) {
    file.originalname = fixFilename(file.originalname);
    this.validate(file.originalname, file.mimetype, 'audio', file.size);
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException(`Course ${courseId} not found`);

    const key = this.buildKey(file.originalname, 'audio');
    await this.storage.upload(file.buffer, key, file.mimetype || 'audio/mpeg');
    const order = await this.prisma.audioAsset.count({ where: { courseId } });
    const asset = await this.prisma.audioAsset.create({
      data: {
        courseId,
        storageKey: key,
        originalName: file.originalname,
        mimeType: file.mimetype || 'audio/mpeg',
        sizeBytes: file.size,
        order
      }
    });
    await this.prisma.storageObject.upsert({
      where: { key },
      update: {},
      create: { key, mimeType: asset.mimeType, sizeBytes: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex') }
    });
    const url = await this.storage.getSignedUrl(key, 7200);
    return { ...asset, url };
  }

  async uploadDocument(file: Express.Multer.File, courseId?: string, kind?: 'pdf' | 'txt' | 'srt', role?: 'source' | 'notes') {
    file.originalname = fixFilename(file.originalname);
    this.validate(file.originalname, file.mimetype, 'document', file.size);
    const isNotes = role === 'notes';
    if (isNotes) {
      // 学习笔记：仅允许 PDF，原样保存（不做解析）
      const ext = extOf(file.originalname);
      if (ext !== '.pdf' || (file.mimetype && file.mimetype !== 'application/pdf' && file.mimetype !== 'application/octet-stream')) {
        throw new BadRequestException('学习笔记仅支持 PDF 文件');
      }
    }
    if (courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
      if (!course) throw new NotFoundException(`Course ${courseId} not found`);
    }
    const key = this.buildKey(file.originalname, 'documents');
    await this.storage.upload(file.buffer, key, file.mimetype || 'application/pdf');
    const detected = kind ?? (extOf(file.originalname).replace('.', '') as 'pdf' | 'txt' | 'srt');
    const asset = await this.prisma.documentAsset.create({
      data: {
        courseId,
        kind: detected,
        role: isNotes ? 'notes' : 'source',
        storageKey: key,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/pdf',
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex')
      }
    });
    const url = await this.storage.getSignedUrl(key, 7200);
    return { ...asset, url };
  }
}

export class UploadQueryDto {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsIn(['pdf', 'txt', 'srt']) kind?: 'pdf' | 'txt' | 'srt';
  /** source = 对照文本等（默认）；notes = 学习笔记（仅 PDF，原样保存） */
  @IsOptional() @IsIn(['source', 'notes']) role?: 'source' | 'notes';
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private service: UploadsService) {}

  @Post('audio')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  async audio(
    @Query('courseId') queryCourseId?: string,
    @Body() dto?: UploadQueryDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException('缺少 file 字段');
    // courseId 兼容 query 与 form 字段两种传法（api-client 走 query）
    const courseId = queryCourseId || dto?.courseId;
    if (!courseId) throw new BadRequestException('缺少 courseId');
    return this.service.uploadAudio(file, courseId);
  }

  @Post('document')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  async document(
    @Query('courseId') queryCourseId?: string,
    @Query('kind') queryKind?: string,
    @Query('role') queryRole?: string,
    @Body() dto?: UploadQueryDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException('缺少 file 字段');
    const courseId = queryCourseId || dto?.courseId;
    const kind = (queryKind || dto?.kind) as 'pdf' | 'txt' | 'srt' | undefined;
    const role = (queryRole || dto?.role) as 'source' | 'notes' | undefined;
    return this.service.uploadDocument(file, courseId, kind, role);
  }
}

@Module({
  controllers: [UploadsController],
  providers: [UploadsService]
})
export class UploadsModule {}
