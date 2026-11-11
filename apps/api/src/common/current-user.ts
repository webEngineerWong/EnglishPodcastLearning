import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

/**
 * 第一版单用户模式：
 * 所有请求默认绑定 DEFAULT_USER_EMAIL（不存在时自动创建）。
 * 数据结构已支持多用户，未来接入鉴权只需替换 userForRequest 的解析逻辑
 * （例如从 Authorization header 解析 JWT）。
 */
export interface CurrentUser {
  id: string;
  email: string | null;
  locale: string;
}

@Injectable()
export class UserResolver {
  constructor(private prisma: PrismaService) {}

  async userForRequest(): Promise<CurrentUser> {
    const email = process.env.DEFAULT_USER_EMAIL ?? 'local@elp.dev';
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Local User', locale: 'zh' }
    });
    return { id: user.id, email: user.email, locale: user.locale };
  }
}
