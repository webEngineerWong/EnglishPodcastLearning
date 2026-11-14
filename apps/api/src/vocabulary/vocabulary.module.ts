import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';

@Injectable()
export class VocabularyService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

  async list(query?: { status?: string; search?: string; limit?: number }) {
    const { id: userId } = await this.users.userForRequest();
    const rows = await this.prisma.userVocabulary.findMany({
      where: {
        userId,
        ...(query?.status ? { status: query.status as 'NEW' | 'LEARNING' | 'MASTERED' } : {}),
        ...(query?.search ? { vocabulary: { word: { contains: query.search, mode: 'insensitive' } } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: query?.limit ?? 200,
      include: {
        vocabulary: true,
        sourceCourse: { select: { title: true } }
      }
    });
    return rows.map((uv) => ({
      id: uv.id,
      word: uv.vocabulary.word,
      phonetic: uv.vocabulary.phonetic,
      definitionZh: uv.vocabulary.definitionZh,
      definitionEn: uv.vocabulary.definitionEn,
      exampleSentence: uv.exampleSentence,
      status: uv.status,
      reviewCount: uv.reviewCount,
      sourceCourseId: uv.sourceCourseId,
      sourceCourseTitle: uv.sourceCourse?.title ?? null,
      sourceParagraphId: uv.sourceParagraphId,
      createdAt: uv.createdAt
    }));
  }

  async add(input: {
    word: string;
    phonetic?: string;
    definitionZh?: string;
    definitionEn?: string;
    exampleSentence?: string;
    sourceParagraphId?: string;
    sourceCourseId?: string;
  }) {
    const { id: userId } = await this.users.userForRequest();
    const word = input.word.trim().toLowerCase();
    const vocab = await this.prisma.vocabulary.upsert({
      where: { word },
      update: {
        phonetic: input.phonetic ?? undefined,
        definitionZh: input.definitionZh ?? undefined,
        definitionEn: input.definitionEn ?? undefined
      },
      create: {
        word,
        phonetic: input.phonetic,
        definitionZh: input.definitionZh,
        definitionEn: input.definitionEn
      }
    });
    const entry = await this.prisma.userVocabulary.upsert({
      where: { userId_vocabularyId: { userId, vocabularyId: vocab.id } },
      update: {
        exampleSentence: input.exampleSentence ?? undefined,
        sourceParagraphId: input.sourceParagraphId ?? undefined,
        sourceCourseId: input.sourceCourseId ?? undefined
      },
      create: {
        userId,
        vocabularyId: vocab.id,
        exampleSentence: input.exampleSentence,
        sourceParagraphId: input.sourceParagraphId,
        sourceCourseId: input.sourceCourseId
      }
    });
    return { ...entry, word: vocab.word };
  }

  async update(id: string, input: { status?: string; definitionZh?: string; exampleSentence?: string }) {
    const { id: userId } = await this.users.userForRequest();
    const data: Record<string, unknown> = { lastReviewedAt: new Date() };
    if (input.status) {
      data.status = input.status;
      data.reviewCount = { increment: 1 };
    }
    if (input.exampleSentence !== undefined) data.exampleSentence = input.exampleSentence;
    const entry = await this.prisma.userVocabulary.update({ where: { id }, data });
    if (input.definitionZh) {
      await this.prisma.vocabulary.update({ where: { id: entry.vocabularyId }, data: { definitionZh: input.definitionZh } });
    }
    return entry;
  }

  async remove(id: string) {
    const { id: userId } = await this.users.userForRequest();
    await this.prisma.userVocabulary.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  async stats() {
    const { id: userId } = await this.users.userForRequest();
    const grouped = await this.prisma.userVocabulary.groupBy({
      by: ['status'],
      where: { userId },
      _count: true
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  /**
   * 词典查询（生词释义真实数据源，绝不虚构）：
   * 1. 本地 Vocabulary 共享词表缓存命中 → source=cache
   * 2. dictionaryapi.dev 查音标/英文释义/发音音频 + MyMemory 中译（免费匿名接口，失败留 null）
   * 3. 结果写回共享词表缓存；查不到 → source=none
   * 只读缓存写共享词表，不动 UserVocabulary（查询行为不污染用户生词本）。
   */
  async lookup(rawWord: string) {
    const word = rawWord.trim().toLowerCase().slice(0, 80);
    if (!word) return { word, source: 'none' as const };

    const cached = await this.prisma.vocabulary.findUnique({ where: { word } });
    if (cached && (cached.phonetic || cached.definitionEn || cached.definitionZh)) {
      return {
        word,
        phonetic: cached.phonetic,
        definitionEn: cached.definitionEn,
        definitionZh: cached.definitionZh,
        audioUrl: null,
        source: 'cache' as const
      };
    }

    let definitionEn: string | null = null;
    let phonetic: string | null = null;
    let audioUrl: string | null = null;
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const entries = (await res.json()) as DictionaryApiEntry[];
        const first = entries[0];
        phonetic = first?.phonetic || first?.phonetics?.find((p) => p.text)?.text || null;
        audioUrl = first?.phonetics?.find((p) => p.audio)?.audio || null;
        const defs = (first?.meanings?.[0]?.definitions ?? []).slice(0, 3).map((d) => d.definition);
        definitionEn = defs.join('; ') || null;
      } else if (res.status !== 404) {
        // 限流/服务异常：不缓存、返回 none，客户端可直接重试
        return { word, source: 'none' as const };
      }
    } catch {
      // 网络不可达：返回 none（不虚构），不写缓存
      return { word, source: 'none' as const };
    }

    let definitionZh: string | null = null;
    if (definitionEn) {
      try {
        const tr = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`, {
          signal: AbortSignal.timeout(8000)
        });
        const body = (await tr.json()) as { responseData?: { translatedText?: string } };
        const text = body.responseData?.translatedText;
        // MyMemory 查不到时回显原文或给出警告文案：过滤掉，保持「无数据」而非错误数据
        if (text && !/INVALID|NO QUERY|QUERY LIMIT/i.test(text) && text.toLowerCase() !== word) definitionZh = text;
      } catch {
        /* 中译失败留 null */
      }
    }

    if (!definitionEn && !definitionZh) return { word, phonetic, source: 'none' as const };

    const saved = await this.prisma.vocabulary.upsert({
      where: { word },
      update: { phonetic: phonetic ?? undefined, definitionEn: definitionEn ?? undefined, definitionZh: definitionZh ?? undefined },
      create: { word, phonetic, definitionEn, definitionZh }
    });
    return {
      word,
      phonetic: saved.phonetic,
      definitionEn: saved.definitionEn,
      definitionZh: saved.definitionZh,
      audioUrl,
      source: 'dictionary' as const
    };
  }
}

/** dictionaryapi.dev 响应（仅取用到的字段） */
interface DictionaryApiEntry {
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { definitions?: { definition?: string }[] }[];
}

export class AddVocabularyDto {
  @IsString()
  @MaxLength(80)
  word!: string;

  @IsOptional() @IsString() @MaxLength(80) phonetic?: string;
  @IsOptional() @IsString() @MaxLength(2000) definitionZh?: string;
  @IsOptional() @IsString() @MaxLength(2000) definitionEn?: string;
  @IsOptional() @IsString() @MaxLength(2000) exampleSentence?: string;
  @IsOptional() @IsString() sourceParagraphId?: string;
  @IsOptional() @IsString() sourceCourseId?: string;
}

export class UpdateVocabularyDto {
  @IsOptional() @IsIn(['NEW', 'LEARNING', 'MASTERED']) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) definitionZh?: string;
  @IsOptional() @IsString() @MaxLength(2000) exampleSentence?: string;
}

@ApiTags('vocabulary')
@Controller('vocabulary')
export class VocabularyController {
  constructor(private service: VocabularyService) {}

  @Get()
  list(@Query('status') status?: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    return this.service.list({ status, search, limit: limit ? Number(limit) : undefined });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('lookup/:word')
  lookup(@Param('word') word: string) {
    return this.service.lookup(word);
  }

  @Post()
  add(@Body() dto: AddVocabularyDto) {
    return this.service.add(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVocabularyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [VocabularyController],
  providers: [VocabularyService, UserResolver]
})
export class VocabularyModule {}
