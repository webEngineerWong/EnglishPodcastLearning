import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';
import { bucketTrend } from './trend';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.tokens';
import type { StorageService } from '../storage/storage.interface';
import { ProgressService } from '../progress/progress.module';

async function coverUrlOf(storage: StorageService, coverKey: string | null | undefined): Promise<string | null> {
  if (!coverKey) return null;
  try {
    return await storage.getSignedUrl(coverKey);
  } catch {
    return null;
  }
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private users: UserResolver,
    @Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService
  ) {}

  async dashboard() {
    const { id: userId } = await this.users.userForRequest();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [todayAgg, totalAgg, sessions, recentProgress, courseCount, completedCount, vocabCount, favCount, recentImports] =
      await Promise.all([
        this.prisma.learningSession.aggregate({
          // 以 endedAt 归属：跨午夜进行中的学习也计入今天
          where: { userId, endedAt: { gte: todayStart } },
          _sum: { durationMs: true }
        }),
        this.prisma.learningSession.aggregate({ where: { userId }, _sum: { durationMs: true } }),
        this.prisma.learningSession.findMany({
          where: { userId },
          orderBy: { startedAt: 'desc' },
          take: 8,
          include: { course: { select: { title: true } } }
        }),
        this.prisma.learningProgress.findMany({
          where: { userId },
          orderBy: { lastLearnedAt: 'desc' },
          take: 8,
          include: { course: { select: { id: true, title: true, updatedAt: true, createdAt: true, difficulty: true, status: true, tags: true, categoryId: true, description: true, coverKey: true } }, audioAsset: { select: { id: true, originalName: true } } }
        }),
        this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.learningProgress.count({ where: { userId, completedAt: { not: null } } }),
        this.prisma.userVocabulary.count({ where: { userId } }),
        this.prisma.favorite.count({ where: { userId, type: 'COURSE' } }),
        this.prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { files: true } })
      ]);

    // 连续学习天数（基于 session 日期）
    const sessionDates = await this.prisma.learningSession.findMany({
      where: { userId },
      select: { startedAt: true },
      orderBy: { startedAt: 'desc' },
      take: 400
    });
    const uniqueDays = [...new Set(sessionDates.map((s) => dayKey(s.startedAt)))];
    let streak = 0;
    const cursor = new Date(now);
    if (!uniqueDays.includes(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      if (!uniqueDays.includes(dayKey(cursor))) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const continueItem = recentProgress[0]
      ? {
          courseId: recentProgress[0].courseId,
          title: recentProgress[0].course.title,
          audioAssetId: recentProgress[0].audioAssetId,
          audioName: recentProgress[0].audioAsset?.originalName ?? null,
          positionMs: recentProgress[0].positionMs,
          lastLearnedAt: recentProgress[0].lastLearnedAt
        }
      : null;

    // 当前播放状态（负一屏小组件显示 ▶/⏸）：播放中心跳 2s 刷新、15s 未更新视为停止上报
    // （App 被杀/断网）；暂停态保留 5 分钟，让负一屏继续显示课程卡片与播放按钮（Spotify 式）
    const np = ProgressService.nowPlayingMap.get(userId);
    const fresh = np && Date.now() - np.updatedAt < (np.isPlaying ? 15_000 : 300_000);
    const nowPlaying =
      np && fresh
        ? {
            courseId: np.courseId,
            title: np.title,
            audioName: np.audioName ?? null,
            coverUrl: np.coverUrl ?? null,
            subtitle: np.subtitle ?? null,
            positionMs: np.positionMs,
            isPlaying: np.isPlaying,
            updatedAt: np.updatedAt,
            rate: np.rate ?? 1,
            durationMs: np.durationMs ?? null
          }
        : null;

    // 剩余学习内容（ms）：已发布课程音频总时长 − 各课程最新进度（按课程钳到 ≥0），预估完课时间用
    const [publishedAudios, watchedRows] = await Promise.all([
      this.prisma.audioAsset.findMany({ where: { course: { status: 'PUBLISHED' } }, select: { courseId: true, durationSec: true } }),
      this.prisma.learningProgress.findMany({
        where: { userId },
        orderBy: { lastLearnedAt: 'desc' },
        distinct: ['courseId'],
        select: { courseId: true, positionMs: true }
      })
    ]);
    const durationByCourse = new Map<string, number>();
    for (const a of publishedAudios) durationByCourse.set(a.courseId, (durationByCourse.get(a.courseId) ?? 0) + (a.durationSec ?? 0) * 1000);
    const watchedByCourse = new Map(watchedRows.map((r) => [r.courseId, r.positionMs]));
    let remainingMs = 0;
    for (const [courseId, totalMs] of durationByCourse) {
      remainingMs += Math.max(0, totalMs - (watchedByCourse.get(courseId) ?? 0));
    }

    return {
      todayMs: todayAgg._sum.durationMs ?? 0,
      totalMs: totalAgg._sum.durationMs ?? 0,
      streakDays: streak,
      courseCount,
      completedCount,
      vocabularyCount: vocabCount,
      favoriteCourseCount: favCount,
      continueLearning: continueItem,
      nowPlaying,
      remainingMs,
      recentCourses: await Promise.all(
        recentProgress.map(async (p) => ({
          id: p.course.id,
          title: p.course.title,
          description: p.course.description,
          difficulty: p.course.difficulty,
          status: p.course.status,
          tags: p.course.tags,
          categoryId: p.course.categoryId,
          categoryName: null,
          audioCount: 0,
          coverUrl: await coverUrlOf(this.storage, (p.course as any).coverKey),
          lastLearnedAt: p.lastLearnedAt,
          lastPositionMs: p.positionMs,
          createdAt: p.course.createdAt,
          updatedAt: p.course.updatedAt
        }))
      ),
      recentSessions: sessions.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: s.course?.title ?? null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs: s.durationMs
      })),
      recentImports: recentImports.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        totalFiles: j.totalFiles,
        processedFiles: j.processedFiles,
        failedFiles: j.failedFiles,
        error: j.error,
        files: j.files.map((f) => ({
          id: f.id,
          jobId: f.jobId,
          kind: f.kind,
          originalName: f.originalName,
          status: f.status,
          error: f.error,
          paragraphCount: f.paragraphCount,
          sizeBytes: f.sizeBytes,
          createdAt: f.createdAt
        })),
        createdAt: j.createdAt,
        updatedAt: j.updatedAt
      }))
    };
  }

  async sessions(limit = 50) {
    const { id: userId } = await this.users.userForRequest();
    return this.prisma.learningSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { course: { select: { title: true } } }
    }).then((rows) =>
      rows.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: s.course?.title ?? null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs: s.durationMs
      }))
    );
  }

  async trend(days = 14) {
    const { id: userId } = await this.users.userForRequest();

    const count = Math.max(1, Math.min(90, Math.floor(days) || 14));
    // 窗口起点：本地时区 (today - days + 1) 的零点
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1));

    const rows = await this.prisma.learningSession.findMany({
      // 以 endedAt 归属；进行中（endedAt 为空）的会话按 startedAt 归属
      where: {
        userId,
        OR: [{ endedAt: { gte: windowStart } }, { endedAt: null, startedAt: { gte: windowStart } }]
      },
      select: { startedAt: true, endedAt: true, durationMs: true }
    });

    return bucketTrend(rows, count, now);
  }
}

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private service: StatsService) {}

  @Get('dashboard')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('sessions')
  sessions(@Query('limit') limit?: string) {
    return this.service.sessions(limit ? Number(limit) : 50);
  }

  @Get('trend')
  trend(@Query('days') days?: string) {
    return this.service.trend(days ? Number(days) : 14);
  }
}

@Module({
  controllers: [StatsController],
  providers: [StatsService, UserResolver]
})
export class StatsModule {}