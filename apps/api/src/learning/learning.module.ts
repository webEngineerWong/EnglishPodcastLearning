import { Body, Controller, Get, HttpException, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';
import { localDayKey } from '../stats/trend';

const ACTIVITIES = ['listening', 'reading', 'vocab', 'notes'] as const;
type ActivityKey = (typeof ACTIVITIES)[number];

function localDayKeyStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class LearningService {
  constructor(private prisma: PrismaService, private users: UserResolver) {}

  /** 行为停留上报：客户端每 30s 增量上报，按 用户+本地日期+行为 幂等累加（单次上限 1h 防御） */
  async addActivity(input: { activity: ActivityKey; seconds: number; date?: string }) {
    const { id: userId } = await this.users.userForRequest();
    const date = input.date ?? localDayKeyStr();
    const seconds = Math.max(0, Math.min(Math.round(input.seconds), 3600));
    const existing = await this.prisma.learningActivity.findUnique({
      where: { userId_date_activity: { userId, date, activity: input.activity } }
    });
    if (existing) {
      await this.prisma.learningActivity.update({ where: { id: existing.id }, data: { seconds: existing.seconds + seconds } });
    } else {
      await this.prisma.learningActivity.create({ data: { userId, date, activity: input.activity, seconds } });
    }
    return { ok: true };
  }

  /** 今日时间分配（各行为停留秒数，客户端换算百分比） */
  async timeDistribution(date?: string) {
    const { id: userId } = await this.users.userForRequest();
    const day = date ?? localDayKeyStr();
    const rows = await this.prisma.learningActivity.findMany({ where: { userId, date: day } });
    const get = (a: ActivityKey) => rows.find((r) => r.activity === a)?.seconds ?? 0;
    return { listening: get('listening'), reading: get('reading'), vocab: get('vocab'), notes: get('notes') };
  }

  /** AI 学习洞察：外部 LLM 生成 2-3 条；Key 走环境变量，失败/超时抛 502 由前端隐藏模块 */
  async insights(input: {
    today_minutes?: number;
    avg_minutes?: number;
    vocab_count?: number;
    streak_days?: number;
    replay_rate?: number;
    completion_rate?: number;
  }) {
    const key = process.env.AI_API_KEY;
    if (!key) throw new HttpException('AI insights not configured', 503);
    const num = (v?: number) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const systemPrompt =
      '你是英语学习App的数据分析模块。根据用户学习数据生成2-3条洞察建议。' +
      '要求：中文，标题≤12字，描述≤25字，语气积极务实。只返回JSON数组，不要任何其他内容。' +
      '格式：[{"icon":"emoji","title":"标题","desc":"描述"}]';
    const userPrompt =
      `今日学习：${num(input.today_minutes)}分钟\n` +
      `历史日均：${num(input.avg_minutes)}分钟\n` +
      `生词本单词数：${num(input.vocab_count)}\n` +
      `连续学习天数：${num(input.streak_days)}\n` +
      `段落重听率：${num(input.replay_rate)}%\n` +
      `课程完成率：${num(input.completion_rate)}%`;
    const model = process.env.AI_MODEL ?? 'gpt-4o-mini';
    // 供应商可换：任意 OpenAI 兼容端点（AI_BASE_URL 如 https://api.deepseek.com）
    const baseUrl = (process.env.AI_BASE_URL ?? 'https://codexfree.xiaotuxp.com').replace(/\/+$/, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';
      const jsonText = content.replace(/```json|```/g, '').trim();
      const start = jsonText.indexOf('[');
      const end = jsonText.lastIndexOf(']');
      if (start < 0 || end <= start) throw new Error('AI response is not a JSON array');
      const arr = JSON.parse(jsonText.slice(start, end + 1)) as { icon?: unknown; title?: unknown; desc?: unknown }[];
      const insights = arr
        .filter((i) => i && typeof i.title === 'string' && typeof i.desc === 'string')
        .slice(0, 3)
        .map((i) => ({
          icon: typeof i.icon === 'string' ? i.icon.slice(0, 4) : '💡',
          title: String(i.title).slice(0, 16),
          desc: String(i.desc).slice(0, 40)
        }));
      return { insights };
    } catch {
      throw new HttpException('AI insights unavailable', 502);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class ActivityDto {
  @IsIn(ACTIVITIES as unknown as string[]) activity!: ActivityKey;
  @IsInt() @Min(0) @Max(3600) seconds!: number;
  /** 客户端本地日期 YYYY-MM-DD（跨时区归日以客户端为准） */
  @IsOptional() @IsString() date?: string;
}

export class InsightsDto {
  @IsOptional() @IsInt() today_minutes?: number;
  @IsOptional() @IsInt() avg_minutes?: number;
  @IsOptional() @IsInt() vocab_count?: number;
  @IsOptional() @IsInt() streak_days?: number;
  @IsOptional() @IsInt() replay_rate?: number;
  @IsOptional() @IsInt() completion_rate?: number;
}

@ApiTags('learning')
@Controller('learning')
export class LearningController {
  constructor(private service: LearningService) {}

  @Post('activity')
  activity(@Body() dto: ActivityDto) {
    return this.service.addActivity(dto);
  }

  @Get('time-distribution')
  timeDistribution(@Query('date') date?: string) {
    return this.service.timeDistribution(date);
  }

  @Post('insights')
  insights(@Body() dto: InsightsDto) {
    return this.service.insights(dto);
  }
}

@Module({
  controllers: [LearningController],
  providers: [LearningService, UserResolver]
})
export class LearningModule {}
