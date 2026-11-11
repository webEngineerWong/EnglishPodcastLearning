import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

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
          include: { course: { select: { id: true, title: true, updatedAt: true, createdAt: true, difficulty: true, status: true, tags: true, categoryId: true, description: true } }, audioAsset: { select: { id: true, originalName: true } } }
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

    return {
      todayMs: todayAgg._sum.durationMs ?? 0,
      totalMs: totalAgg._sum.durationMs ?? 0,
      streakDays: streak,
      courseCount,
      completedCount,
      vocabularyCount: vocabCount,
      favoriteCourseCount: favCount,
      continueLearning: continueItem,
      recentCourses: recentProgress.map((p) => ({
        id: p.course.id,
        title: p.course.title,
        description: p.course.description,
        difficulty: p.course.difficulty,
        status: p.course.status,
        tags: p.course.tags,
        categoryId: p.course.categoryId,
        categoryName: null,
        audioCount: 0,
        lastLearnedAt: p.lastLearnedAt,
        lastPositionMs: p.positionMs,
        createdAt: p.course.createdAt,
        updatedAt: p.course.updatedAt
      })),
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
}

@Module({
  controllers: [StatsController],
  providers: [StatsService, UserResolver]
})
export class StatsModule {}
