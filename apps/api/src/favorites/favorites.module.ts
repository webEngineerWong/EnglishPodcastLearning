import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

  async list(type?: 'COURSE' | 'PARAGRAPH', limit = 100) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.favorite.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        course: { select: { title: true } },
        paragraph: { select: { textEn: true, textZh: true } }
      }
    }).then((rows) =>
      rows.map((f) => ({
        id: f.id,
        type: f.type,
        courseId: f.courseId,
        courseTitle: f.course?.title ?? null,
        paragraphId: f.paragraphId,
        excerptEn: f.paragraph?.textEn ?? null,
        excerptZh: f.paragraph?.textZh ?? null,
        note: f.note,
        createdAt: f.createdAt
      }))
    );
  }

  async addCourse(courseId: string, note?: string) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.favorite.upsert({
      where: { userId_type_courseId: { userId, type: 'COURSE', courseId } },
      update: { note: note ?? undefined },
      create: { userId, courseId, type: 'COURSE', note }
    });
  }

  async addParagraph(paragraphId: string, note?: string) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.favorite.create({ data: { userId, paragraphId, type: 'PARAGRAPH', note } });
  }

  async remove(id: string) {
    const { id: userId } = await this.users.userForRequest();
    await this.prisma.favorite.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  async isCourseFavorite(courseId: string): Promise<boolean> {
    const { id: userId } = await this.users.userForRequest();
    const row = await this.prisma.favorite.findFirst({ where: { userId, courseId, type: 'COURSE' } });
    return Boolean(row);
  }
}

export class AddFavoriteDto {
  @IsIn(['COURSE', 'PARAGRAPH'])
  type!: 'COURSE' | 'PARAGRAPH';

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  paragraphId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private service: FavoritesService) {}

  @Get()
  list(@Query('type') type?: string, @Query('limit') limit?: string) {
    const t = type === 'COURSE' || type === 'PARAGRAPH' ? type : undefined;
    return this.service.list(t, limit ? Number(limit) : 100);
  }

  @Post()
  async add(@Body() dto: AddFavoriteDto) {
    if (dto.type === 'COURSE') {
      if (!dto.courseId) throw new Error('courseId required');
      return this.service.addCourse(dto.courseId, dto.note);
    }
    if (!dto.paragraphId) throw new Error('paragraphId required');
    return this.service.addParagraph(dto.paragraphId, dto.note);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [FavoritesController],
  providers: [FavoritesService, UserResolver]
})
export class FavoritesModule {}
