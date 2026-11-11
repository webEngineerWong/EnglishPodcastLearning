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
