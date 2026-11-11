import { Body, Controller, Get, Module, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

  async me() {
    const u = await this.users.userForRequest();
    return this.prisma.user.findUnique({ where: { id: u.id }, select: { id: true, email: true, name: true, locale: true, createdAt: true } });
  }

  async updateLocale(locale: string) {
    const u = await this.users.userForRequest();
    return this.prisma.user.update({
      where: { id: u.id },
      data: { locale },
      select: { id: true, email: true, name: true, locale: true, createdAt: true }
    });
  }
}

class UpdateUserDto {
  /** 界面语言 */
  @IsIn(['zh', 'en'])
  locale!: string;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  me() {
    return this.usersService.me();
  }

  @Patch('me')
  update(@Body() dto: UpdateUserDto) {
    return this.usersService.updateLocale(dto.locale);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserResolver]
})
export class UsersModule {}
