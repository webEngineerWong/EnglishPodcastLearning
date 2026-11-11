import { Body, Controller, Delete, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { courses: true } } }
    }).then((rows) =>
      rows.map((c) => ({ id: c.id, name: c.name, color: c.color, sortOrder: c.sortOrder, courseCount: c._count.courses }))
    );
  }

  create(name: string, color?: string) {
    return this.prisma.category.create({ data: { name, color } });
  }

  async remove(id: string) {
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }
}

export class CreateCategoryDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto.name, dto.color);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService]
})
export class CategoriesModule {}
