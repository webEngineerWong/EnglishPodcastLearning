'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, EmptyState, Spinner, useI18n } from '@elp/ui';
import { formatDuration, formatTime } from '@elp/player';
import { BookOpen, Bookmark, FileUp, Headphones, Library, Play, Timer } from 'lucide-react';
import { useDashboard } from '@/lib/hooks';
import { PageHeader, CourseCover } from '@/components/shell';

function StatCard({ label, value, hint, Icon }: { label: string; value: string; hint?: string; Icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          {Icon && <Icon size={14} className="text-muted-foreground/70" />}
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_LINKS = [
  { href: '/courses', label: '课程库', Icon: Library },
  { href: '/vocabulary', label: '生词本', Icon: BookOpen },
  { href: '/favorites', label: '收藏', Icon: Bookmark },
  { href: '/import', label: '导入课程', Icon: FileUp }
] as const;

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading } = useDashboard();

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!data) return <EmptyState title={t('empty')} />;

  const c = data.continueLearning;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting()} 👋`}
        subtitle={new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      />

      {/* 继续学习 */}
      {c && (
        <Card className="mb-6 overflow-hidden border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <CourseCover url={null} title={c.title} className="h-20 w-20 shrink-0 rounded-lg text-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Headphones size={13} />
                {t('continueLearning')}
              </div>
              <div className="mt-0.5 truncate text-base font-semibold">{c.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.audioName ?? ''}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Timer size={12} />
                  {formatTime(c.positionMs)}
                </span>
                <span className="hidden truncate sm:inline">{new Date(c.lastLearnedAt).toLocaleString()}</span>
              </div>
            </div>
            <Button
              size="md"
              onClick={() => router.push(`/courses/${c.courseId}?resume=${c.positionMs}`)}
              aria-label={t('continueLearning')}
            >
              <Play size={14} fill="currentColor" />
              继续学习
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 统计卡 */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t('todayMs')} value={formatDuration(data.todayMs)} Icon={Timer} />
        <StatCard label={t('totalMs')} value={formatDuration(data.totalMs)} Icon={Headphones} />
        <StatCard label={t('streakDays')} value={`${data.streakDays} ${t('days')}`} />
        <StatCard label={t('courses')} value={String(data.courseCount)} hint={`${t('completedCount')} ${data.completedCount}`} Icon={Library} />
        <StatCard label={t('vocabularyCount')} value={String(data.vocabularyCount)} Icon={BookOpen} />
        <StatCard label={t('favoriteCourses')} value={String(data.favoriteCourseCount)} Icon={Bookmark} />
      </div>

      {/* 快速入口 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3 text-sm shadow-[var(--shadow-sm)] transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon size={16} />
            </span>
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 最近学习 */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('recentCourses')}</h2>
              <Link href="/courses" className="flex items-center gap-1 text-xs text-primary hover:underline">
                {t('courses')} →
              </Link>
            </div>
            {data.recentCourses.length === 0 ? (
              <EmptyState title={t('empty')} hint="从导入中心开始添加课程" />
            ) : (
              <div className="space-y-2">
                {data.recentCourses.map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}${course.lastPositionMs ? `?resume=${course.lastPositionMs}` : ''}`}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <CourseCover url={null} title={course.title} className="h-10 w-10 shrink-0 rounded-md text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{course.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {course.lastLearnedAt ? new Date(course.lastLearnedAt).toLocaleString() : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{course.lastPositionMs ? formatTime(course.lastPositionMs) : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近播放 */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">最近播放记录</h2>
            {data.recentSessions.length === 0 ? (
              <EmptyState title={t('empty')} />
            ) : (
              <div className="space-y-2">
                {data.recentSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                        <Headphones size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.courseTitle ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <Badge tone="muted">{formatDuration(s.durationMs)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近导入 */}
      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('recentImports')}</h2>
            <Link href="/import" className="flex items-center gap-1 text-xs text-primary hover:underline">
              {t('importCenter')} →
            </Link>
          </div>
          {data.recentImports.length === 0 ? (
            <EmptyState title={t('empty')} hint="上传 PDF 对照文本 + MP3 音频 + SRT 字幕" />
          ) : (
            <div className="space-y-2">
              {data.recentImports.map((j) => (
                <Link
                  key={j.id}
                  href={`/import/${j.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.name ?? j.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(j.createdAt).toLocaleString()} · {j.files.length} 个文件
                    </div>
                  </div>
                  <Badge tone={j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'danger' : 'warning'}>{j.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
