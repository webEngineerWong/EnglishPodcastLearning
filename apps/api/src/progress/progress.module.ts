import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

  /**
   * 内存态"当前播放"（供负一屏小组件拉取播放/暂停状态，单用户模式够用）。
   * 心跳每 2s 刷新；播放中 15s 未上报视为已停止（App 被杀），暂停态保留 5 分钟展示。
   */
  static readonly nowPlayingMap = new Map<
    string,
    { courseId: string; title: string; audioName?: string; coverUrl?: string; subtitle?: string; positionMs: number; isPlaying: boolean; rate?: number; durationMs?: number | null; updatedAt: number }
  >();

  /**
   * 心跳保存：前端播放器每 ~5s 上报当前位置与本次学习时长增量。
   * 幂等 upsert 到 LearningProgress，并把 delta 累积到一个开着的 LearningSession。
   */
  async heartbeat(input: {
    courseId: string;
    audioAssetId?: string;
    positionMs: number;
    deltaMs: number;
    isPlaying?: boolean;
    /** 播放倍速（负一屏进度插值用） */
    rate?: number;
    /** 音频总时长 ms（负一屏进度条分母） */
    durationMs?: number;
    courseTitle?: string;
    audioName?: string;
    coverUrl?: string;
    subtitle?: string;
  }) {
    const { id: userId } = await this.users.userForRequest();
    const delta = Math.max(0, Math.min(input.deltaMs, 10_000)); // 防御：单次心跳最多记 10s

    // 负一屏小组件的播放状态源（Widget 进程与 App 无共享存储，经 API 中转）
    if (typeof input.isPlaying === 'boolean') {
      ProgressService.nowPlayingMap.set(userId, {
        courseId: input.courseId,
        title: input.courseTitle ?? ProgressService.nowPlayingMap.get(userId)?.title ?? '',
        audioName: input.audioName,
        coverUrl: input.coverUrl,
        subtitle: input.subtitle,
        positionMs: Math.round(input.positionMs),
        isPlaying: input.isPlaying,
        rate: input.rate,
        durationMs: input.durationMs ?? null,
        updatedAt: Date.now()
      });
    }

    // audioAssetId 可空；PG 复合唯一键不约束 NULL 行，改用 findFirst+update/create
    const existing = await this.prisma.learningProgress.findFirst({
      where: { userId, courseId: input.courseId, audioAssetId: input.audioAssetId ?? null },
      orderBy: { lastLearnedAt: 'desc' }
    });
    const progress = existing
      ? await this.prisma.learningProgress.update({
          where: { id: existing.id },
          data: { positionMs: Math.round(input.positionMs), lastLearnedAt: new Date() }
        })
      : await this.prisma.learningProgress.create({
          data: {
            userId,
            courseId: input.courseId,
            audioAssetId: input.audioAssetId,
            positionMs: Math.round(input.positionMs),
            lastLearnedAt: new Date()
          }
        });

    // 学习会话：30 分钟内的连续心跳归入同一 session
    const now = new Date();
    const last = await this.prisma.learningSession.findFirst({
      where: { userId, courseId: input.courseId, endedAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) } },
      orderBy: { startedAt: 'desc' }
    });
    if (last) {
      await this.prisma.learningSession.update({
        where: { id: last.id },
        data: { endedAt: now, durationMs: last.durationMs + delta, audioAssetId: input.audioAssetId ?? last.audioAssetId }
      });
    } else {
      await this.prisma.learningSession.create({
        data: { userId, courseId: input.courseId, audioAssetId: input.audioAssetId, startedAt: now, endedAt: now, durationMs: delta }
      });
    }
    return progress;
  }

  async get(courseId: string, audioAssetId?: string) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.learningProgress.findFirst({
      where: { userId, courseId, ...(audioAssetId ? { audioAssetId } : {}) },
      orderBy: { lastLearnedAt: 'desc' }
    });
  }

  async markCompleted(courseId: string) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.learningProgress.updateMany({
      where: { userId, courseId },
      data: { completedAt: new Date() }
    });
  }
}

export class HeartbeatDto {
  @IsString() courseId!: string;
  @IsOptional() @IsString() audioAssetId?: string;
  @IsInt() @Min(0) positionMs!: number;
  @IsInt() @Min(0) deltaMs!: number;
  @IsOptional() @IsBoolean() isPlaying?: boolean;
  /** 播放倍速（负一屏进度插值用） */
  @IsOptional() @IsNumber() rate?: number;
  /** 音频总时长 ms（负一屏进度条分母） */
  @IsOptional() @IsInt() durationMs?: number;
  @IsOptional() @IsString() courseTitle?: string;
  @IsOptional() @IsString() audioName?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() subtitle?: string;
}

export class CompleteDto {
  @IsString() courseId!: string;
}

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private service: ProgressService) {}

  @Post('heartbeat')
  heartbeat(@Body() dto: HeartbeatDto) {
    return this.service.heartbeat(dto);
  }

  @Post('complete')
  complete(@Body() dto: CompleteDto) {
    return this.service.markCompleted(dto.courseId);
  }

  @Get()
  get(@Query('courseId') courseId: string, @Query('audioAssetId') audioAssetId?: string) {
    return this.service.get(courseId, audioAssetId);
  }
}

@Module({
  controllers: [ProgressController],
  providers: [ProgressService, UserResolver]
})
export class ProgressModule {}
