'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, EmptyState, Spinner, useI18n } from '@elp/ui';
import { formatDuration, formatTime } from '@elp/player';
import { useDashboard } from '@/lib/hooks';
import { PageHeader } from '@/components/shell';

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading } = useDashboard();

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!data) return <EmptyState title={t('empty')} />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('dashboard')} subtitle={`${new Date().toLocaleDateString()} · Keep listening, keep learning.`} />

      {/* 继续学习 */}
      {data.continueLearning && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-xs font-medium text-primary">{t('continueLearning')}</div>
              <div className="mt-0.5 text-base font-semibold">{data.continueLearning.title}</div>
              <div className="text-xs text-muted-foreground">
                {data.continueLearning.audioName ?? ''} · 上次播放到 {formatTime(data.continueLearning.positionMs)} ·{' '}
                {new Date(data.continueLearning.lastLearnedAt).toLocaleString()}
              </div>
            </div>
            <Button
              onClick={() =>
                router.push(`/courses/${data.continueLearning!.courseId}?resume=${data.continueLearning!.positionMs}`)
              }
            >
              ▶ 继续学习
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 统计卡 */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t('todayMs')} value={formatDuration(data.todayMs)} />
        <StatCard label={t('totalMs')} value={formatDuration(data.totalMs)} />
        <StatCard label={t('streakDays')} value={`${data.streakDays} ${t('days')}`} />
        <StatCard label={t('courses')} value={String(data.courseCount)} hint={`${t('completedCount')} ${data.completedCount}`} />
        <StatCard label={t('vocabularyCount')} value={String(data.vocabularyCount)} />
        <StatCard label={t('favoriteCourses')} value={String(data.favoriteCourseCount)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 最近学习 */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('recentCourses')}</h2>
              <Link href="/courses" className="text-xs text-primary hover:underline">
                {t('courses')} →
              </Link>
            </div>
            {data.recentCourses.length === 0 ? (
              <EmptyState icon="📚" title={t('empty')} hint="从导入中心开始添加课程" />
            ) : (
              <div className="space-y-2">
                {data.recentCourses.map((c) => (
                  <Link
                    key={c.id}
                    href={`/courses/${c.id}${c.lastPositionMs ? `?resume=${c.lastPositionMs}` : ''}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.lastLearnedAt ? new Date(c.lastLearnedAt).toLocaleString() : ''}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.lastPositionMs ? formatTime(c.lastPositionMs) : ''}</span>
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
              <EmptyState icon="🎧" title={t('empty')} />
            ) : (
              <div className="space-y-2">
                {data.recentSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.courseTitle ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</div>
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
            <Link href="/import" className="text-xs text-primary hover:underline">
              {t('importCenter')} →
            </Link>
          </div>
          {data.recentImports.length === 0 ? (
            <EmptyState icon="📥" title={t('empty')} hint="上传 PDF 对照文本 + MP3 音频 + SRT 字幕" />
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
