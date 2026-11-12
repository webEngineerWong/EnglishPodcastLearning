import { BadRequestException, Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';
import { FavoritesService } from '../favorites/favorites.module';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.tokens';
import type { StorageService } from '../storage/storage.interface';

const COURSE_INCLUDE_BASE = {
  category: { select: { id: true, name: true } },
  audios: { orderBy: { order: 'asc' as const }, select: { id: true, originalName: true, durationSec: true, sizeBytes: true, order: true, storageKey: true } },
  _count: { select: { audios: true } }
};

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private users: UserResolver,
    private favorites: FavoritesService,
    @Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService
  ) {}

  async list(query: {
    search?: string;
    categoryId?: string;
    favorite?: boolean;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { id: userId } = await this.users.userForRequest();
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    let favoriteCourseIds: string[] | null = null;
    if (query.favorite) {
      const favs = await this.prisma.favorite.findMany({ where: { userId, type: 'COURSE' }, select: { courseId: true } });
      favoriteCourseIds = favs.map((f) => f.courseId!).filter(Boolean);
    }

    const where = {
      ...(query.status ? { status: query.status as 'DRAFT' | 'PUBLISHED' } : { status: 'PUBLISHED' as const }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(favoriteCourseIds ? { id: { in: favoriteCourseIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { description: { contains: query.search, mode: 'insensitive' as const } },
              { tags: { has: query.search } }
            ]
          }
        : {})
    };

    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: COURSE_INCLUDE_BASE
      }),
      this.prisma.course.count({ where })
    ]);

    // 附加收藏状态与最近进度
    const favSet = new Set(favoriteCourseIds ?? (await this.prisma.favorite.findMany({ where: { userId, type: 'COURSE' }, select: { courseId: true } })).map((f) => f.courseId!));
    const progress = await this.prisma.learningProgress.findMany({
      where: { userId, courseId: { in: rows.map((r) => r.id) } },
      orderBy: { lastLearnedAt: 'desc' }
    });
    const progressMap = new Map(progress.map((p) => [p.courseId, p]));

    const items = rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      status: c.status,
      tags: c.tags,
      categoryId: c.categoryId,
      categoryName: c.category?.name ?? null,
      audioCount: c._count.audios,
      favorite: favSet.has(c.id),
      lastLearnedAt: progressMap.get(c.id)?.lastLearnedAt ?? null,
      lastPositionMs: progressMap.get(c.id)?.positionMs ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));

    return { items, total, page, limit };
  }

  async detail(id: string) {
    const { id: userId } = await this.users.userForRequest();
    const c = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        audios: { orderBy: { order: 'asc' } },
        documents: true,
        transcripts: { include: { paragraphs: { orderBy: { order: 'asc' } } } }
      }
    });
    if (!c) throw new NotFoundException(`Course ${id} not found`);

    const favorite = await this.favorites.isCourseFavorite(id);
    const progress = await this.prisma.learningProgress.findFirst({
      where: { userId, courseId: id },
      orderBy: { lastLearnedAt: 'desc' }
    });

    // subtitle transcript = 主字幕（点击跳转）；material transcripts = 学习资料（跟随滚动）
    const mapParagraphs = (rows: typeof c.transcripts[number]['paragraphs']) =>
      rows.map((p) => ({
        id: p.id,
        order: p.order,
        type: p.type,
        textEn: p.textEn,
        textZh: p.textZh,
        startTimeMs: p.startTimeMs,
        endTimeMs: p.endTimeMs,
        pageStart: p.pageStart,
        pageEnd: p.pageEnd,
        confidence: p.confidence,
        reviewStatus: p.reviewStatus
      }));
    const subtitleRow =
      c.transcripts.find((t) => t.kind === 'subtitle') ?? c.transcripts[0] ?? null;
    const transcript = subtitleRow
      ? {
          id: subtitleRow.id,
          courseId: c.id,
          kind: 'subtitle' as const,
          title: subtitleRow.title,
          status: subtitleRow.status,
          paragraphs: mapParagraphs(subtitleRow.paragraphs)
        }
      : null;
    const materials = c.transcripts
      .filter((t) => t.kind === 'material')
      .map((t) => ({
        id: t.id,
        courseId: c.id,
        kind: 'material' as const,
        title: t.title,
        status: t.status,
        paragraphs: mapParagraphs(t.paragraphs)
      }));

    const audiosWithUrl = await Promise.all(
      c.audios.map(async (a) => ({
        id: a.id,
        courseId: a.courseId,
        originalName: a.originalName,
        url: await this.storage.getSignedUrl(a.storageKey, 7200),
        durationSec: a.durationSec,
        sizeBytes: a.sizeBytes,
        order: a.order,
        createdAt: a.createdAt
      }))
    );
    const documentsWithUrl = await Promise.all(
      c.documents.map(async (d) => ({
        id: d.id,
        courseId: d.courseId,
        kind: d.kind,
        role: d.role,
        originalName: d.originalName,
        url: await this.storage.getSignedUrl(d.storageKey, 7200),
        sizeBytes: d.sizeBytes,
        sha256: d.sha256,
        createdAt: d.createdAt
      }))
    );
    // 学习笔记（role=notes）：url 指向 inline 文件接口，前端用 assetUrl() 补全
    const notesDocuments = c.documents
      .filter((d) => d.role === 'notes')
      .map((d) => ({
        id: d.id,
        originalName: d.originalName,
        url: `/api/documents/${d.id}/file`,
        sizeBytes: d.sizeBytes
      }));

    // 课程封面（锁屏/灵动岛卡片与移动端展示用）
    const coverUrl = c.coverKey ? await this.storage.getSignedUrl(c.coverKey, 7200) : null;

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      notes: c.notes,
      difficulty: c.difficulty,
      status: c.status,
      tags: c.tags,
      categoryId: c.categoryId,
      categoryName: c.category?.name ?? null,
      audioCount: c.audios.length,
      favorite,
      lastLearnedAt: progress?.lastLearnedAt ?? null,
      lastPositionMs: progress?.positionMs ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      audios: audiosWithUrl,
      documents: documentsWithUrl,
      notesDocuments,
      coverUrl,
      transcript,
      materials
    };
  }

  /** 设置课程封面（锁屏/灵动岛卡片）：支持 png/jpg/webp，≤10MB */
  async setCover(id: string, file: Express.Multer.File) {
    await this.ensure(id);
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = file.originalname.toLowerCase().replace(/^.*(\.\w+)$/, '$1');
    if (!allowed.includes(ext)) throw new BadRequestException(`不支持的封面格式: ${file.originalname}`);
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('封面图片不能超过 10MB');
    const date = new Date().toISOString().slice(0, 10);
    const key = `covers/${date}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    await this.storage.upload(file.buffer, key, file.mimetype || 'image/png');
    await this.prisma.course.update({ where: { id }, data: { coverKey: key } });
    const coverUrl = await this.storage.getSignedUrl(key, 7200);
    return { coverKey: key, coverUrl };
  }

  async create(input: {
    title: string;
    description?: string;
    notes?: string;
    difficulty?: number;
    tags?: string[];
    categoryId?: string;
  }) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.course.create({
      data: {
        title: input.title,
        description: input.description,
        notes: input.notes,
        difficulty: input.difficulty ?? 3,
        tags: input.tags ?? [],
        categoryId: input.categoryId || undefined,
        createdById: userId,
        status: 'PUBLISHED'
      }
    });
  }

  async update(id: string, input: Partial<Parameters<CoursesService['create']>[0]>) {
    await this.ensure(id);
    return this.prisma.course.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        notes: input.notes,
        difficulty: input.difficulty,
        tags: input.tags,
        categoryId: input.categoryId
      }
    });
  }

  async remove(id: string) {
    await this.ensure(id);
    // 级联清理存储文件
    const assets = await this.prisma.audioAsset.findMany({ where: { courseId: id }, select: { storageKey: true } });
    const docs = await this.prisma.documentAsset.findMany({ where: { courseId: id }, select: { storageKey: true } });
    await this.prisma.course.delete({ where: { id } });
    for (const key of [...assets.map((a) => a.storageKey), ...docs.map((d) => d.storageKey)]) {
      await this.storage.delete(key);
    }
    return { deleted: true };
  }

  private async ensure(id: string) {
    const c = await this.prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException(`Course ${id} not found`);
    return c;
  }
}

export class CreateCourseDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED']) status?: string;
}

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private service: CoursesService, private favorites: FavoritesService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('favorite') favorite?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.service.list({
      search,
      categoryId,
      favorite: favorite === 'true' || favorite === '1',
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.service.create(dto);
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  async setCover(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('缺少 file 字段');
    return this.service.setCover(id, file);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateCourseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/favorite')
  favoriteOn(@Param('id') id: string) {
    return this.favorites.addCourse(id);
  }

  @Delete(':id/favorite')
  async favoriteOff(@Param('id') id: string) {
    const favs = await this.favorites.list('COURSE', 1000);
    const fav = favs.find((f) => f.courseId === id);
    if (fav) await this.favorites.remove(fav.id);
    return { favorite: false };
  }
}

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, UserResolver, FavoritesService]
})
export class CoursesModule {}
