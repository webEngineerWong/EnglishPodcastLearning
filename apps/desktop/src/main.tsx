/**
 * Electron 渲染端入口：功能与 Web 端对齐。
 * 复用共享 packages（ui / player / api-client / types），本地文件导入走主进程 IPC。
 * 页面：Dashboard / Courses / CourseDetail / Import（含校对）/ Vocabulary / Favorites
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { I18nProvider, ThemeProvider, ToastProvider, useI18n, useToast, BilingualReader, MaterialReader, findActiveParagraph, Button, Card, CardContent, Badge, EmptyState, Icon, Spinner, Input, Select, Modal, Tabs, Tooltip, TrendChart, type DisplayMode } from '@elp/ui';
import { AudioPlayer, MiniPlayer, PlayerProvider, formatTime, useGlobalPlayer, useKeyboardShortcuts } from '@elp/player';
import defaultAppIcon from './default-app-icon.png';
import type { ImportJobDto, NotesDocumentDto, TranscriptParagraphDto } from '@elp/types';
import { ApiClient } from '@elp/api-client';
import { desktop } from './bridge';
import { cachedAudioUrl, warmAudioCache } from './audioCache';
import '@elp/ui/src/styles/tokens.css';
import './index.css';

const QueryCtx = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function App() {
  return (
    <QueryClientProvider client={QueryCtx}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <PlayerHost>
              <DesktopApp />
            </PlayerHost>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** 全局播放器宿主：Mini Player 页面切换常驻；学习心跳统一从这里上报 */
function PlayerHost({ children }: { children: React.ReactNode }) {
  const api = useApiClient();
  return (
    <PlayerProvider
      heartbeat={(info) =>
        void api.heartbeat({ courseId: info.courseId, audioAssetId: info.audioAssetId, positionMs: info.positionMs, deltaMs: 5000 }).catch(() => undefined)
      }
    >
      {children}
    </PlayerProvider>
  );
}

type Route =
  | { page: 'dashboard' }
  | { page: 'courses' }
  | { page: 'course'; id: string }
  | { page: 'import'; jobId?: string }
  | { page: 'vocabulary' }
  | { page: 'favorites' };

function toast(msg: string, ok = false) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.className = 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-success/40 bg-success px-4 py-2 text-sm text-success-foreground shadow-lg ' + (ok ? '' : '!border-destructive/40 !bg-destructive !text-destructive-foreground');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function useApiClient() {
  return useMemo(() => {
    const base = typeof window !== 'undefined' && (window as unknown as { ELP_API_BASE?: string }).ELP_API_BASE;
    return new ApiClient({ baseUrl: base || 'http://localhost:3001' });
  }, []);
}

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
  };
}

// 课程封面：有 coverUrl 用图，否则默认方图封面（与 iOS 端一致）
function CourseCover({ url, title, className }: { url?: string | null; title: string; className?: string }) {
  return url ? (
    <img src={url} alt={title} className={'shrink-0 object-cover ' + (className ?? '')} />
  ) : (
    <img src={defaultAppIcon} alt={title} className={'shrink-0 object-cover ' + (className ?? '')} />
  );
}

// ==================== 布局 ====================

function DesktopApp() {
  const { t } = useI18n();
  const { resolved, setMode } = useThemeCtl();
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const player = useGlobalPlayer();
  // Mini Player：页面切换常驻；当前课程详情页隐藏（详情页有完整播放器）
  const showMini = player.track !== null && !(route.page === 'course' && route.id === player.track.courseId);
  const nav = [
    { page: 'dashboard' as const, name: 'dashboard' as const, label: t('dashboard') },
    { page: 'courses' as const, name: 'library' as const, label: t('courses') },
    { page: 'import' as const, name: 'import' as const, label: t('importCenter') },
    { page: 'vocabulary' as const, name: 'vocabulary' as const, label: t('vocabulary') },
    { page: 'favorites' as const, name: 'favorites' as const, label: t('favorites') }
  ];
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-card pt-10">
        <div className="mb-4 px-4 text-sm font-semibold">{t('appName')}</div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((n) => (
            <button
              key={n.page}
              className={'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ' + (route.page === n.page ? 'bg-primary/12 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}
              onClick={() => setRoute({ page: n.page } as Route)}
            >
              <Icon name={n.name} size="sm" className="shrink-0" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center justify-between px-3 pb-4 text-[10px] text-muted-foreground">
          <span>Electron · macOS</span>
          <button className="rounded px-1 hover:bg-accent" aria-label="theme" onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? <Icon name="sun" size="sm" /> : <Icon name="moon" size="sm" />}
          </button>
        </div>
      </aside>
      <main className={showMini ? 'flex-1 overflow-y-auto p-6 pb-24' : 'flex-1 overflow-y-auto p-6'}>
        {route.page === 'dashboard' && <Dash onOpenCourse={(id) => setRoute({ page: 'course', id })} onOpenImport={() => setRoute({ page: 'import' })} />}
        {route.page === 'courses' && <Courses onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'course' && <CourseDetailPage id={route.id} onBack={() => setRoute({ page: 'courses' })} />}
        {route.page === 'import' && <ImportPage initialJobId={'jobId' in route ? route.jobId : undefined} onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'vocabulary' && <VocabularyPage />}
        {route.page === 'favorites' && <FavoritesPage />}
      </main>
      {showMini && player.track && (
        <MiniPlayer
          engine={player.engine}
          state={player.state}
          track={player.track}
          onClose={player.close}
          onOpen={() => player.track && setRoute({ page: 'course', id: player.track.courseId })}
          leftRem={12.75}
        />
      )}
    </div>
  );
}

function useThemeCtl() {
  const [resolved, setResolvedState] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const update = () => setResolvedState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    update();
  }, []);
  const setMode = (m: 'light' | 'dark' | 'system') => {
    localStorage.setItem('elp-theme', m);
    document.documentElement.classList.toggle('dark', m === 'dark' || (m === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
    setResolvedState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  };
  return { resolved, setMode };
}

// ==================== Dashboard ====================

/** 学习趋势卡：近 7/14/30 天逐日学习时长（Recharts，与 Web 端一致） */
function TrendCard() {
  const { t } = useI18n();
  const api = useApiClient();
  const [days, setDays] = useState(14);
  const { data: trend } = useQuery({ queryKey: ['trend', days], queryFn: () => api.getTrend({ days }) });

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon name="trendingUp" size="sm" className="text-primary" />
            {t('learningTrend')}
          </h2>
          <div className="flex items-center gap-1">
            {([7, 14, 30] as const).map((d) => (
              <Button key={d} size="sm" variant={days === d ? 'active' : 'ghost'} onClick={() => setDays(d)}>
                {t(d === 7 ? 'last7Days' : d === 14 ? 'last14Days' : 'last30Days')}
              </Button>
            ))}
          </div>
        </div>
        {trend ? <TrendChart points={trend} /> : <div className="flex h-52 items-center justify-center"><Spinner /></div>}
      </CardContent>
    </Card>
  );
}

function Dash({ onOpenCourse, onOpenImport }: { onOpenCourse: (id: string) => void; onOpenImport: () => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const { data, isError } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboardStats(), refetchInterval: 60_000, retry: 2 });

  if (isError) {
    return (
      <Card className="p-6 text-center">
        <div className="text-sm">无法连接 API（{api.baseUrl}）</div>
        <div className="mt-1 text-xs text-muted-foreground">请确认后端已启动：docker compose up -d 或 pnpm dev:api</div>
      </Card>
    );
  }
  if (!data) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold">{t('dashboard')}</h1>
      {data.continueLearning && (
        <Card className="mb-4 border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <div className="text-xs font-medium text-primary">{t('continueLearning')}</div>
              <div className="truncate text-base font-semibold">{data.continueLearning.title}</div>
              <div className="text-xs text-muted-foreground">
                {data.continueLearning.audioName ?? ''} · 上次 {formatTime(data.continueLearning.positionMs)} · {new Date(data.continueLearning.lastLearnedAt).toLocaleString()}
              </div>
            </div>
            <Button onClick={() => onOpenCourse(data.continueLearning!.courseId)}><Icon name="play" size="sm" fill="currentColor" className="mr-1" />继续</Button>
          </CardContent>
        </Card>
      )}
      <div className="mb-6 grid grid-cols-3 gap-3 md:grid-cols-6">
        {(
          [
            [t('todayMs'), formatMinutes(data.todayMs)],
            [t('totalMs'), formatMinutes(data.totalMs)],
            [t('streakDays'), String(data.streakDays)],
            [t('courses'), String(data.courseCount)],
            [t('completedCount'), String(data.completedCount)],
            [t('vocabularyCount'), String(data.vocabularyCount)]
          ] as [string, string][]
        ).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <TrendCard />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('recentCourses')}</h2>
            {data.recentCourses.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t('empty')}</div>
            ) : (
              <div className="space-y-1.5">
                {data.recentCourses.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => onOpenCourse(c.id)}
                  >
                    <span className="min-w-0 truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.lastPositionMs ? formatTime(c.lastPositionMs) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('recentImports')}</h2>
            {data.recentImports.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t('empty')}</div>
            ) : (
              <div className="space-y-1.5">
                {data.recentImports.slice(0, 5).map((j) => (
                  <button
                    key={j.id}
                    className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={onOpenImport}
                  >
                    <span className="min-w-0 truncate">{j.name ?? j.id}</span>
                    <Badge tone={j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'danger' : 'warning'}>{j.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return min + ' 分钟';
  return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分';
}

// ==================== Courses ====================

function Courses({ onOpenCourse }: { onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', difficulty: 3, categoryId: '' });
  const { data } = useQuery({ queryKey: ['courses', search], queryFn: () => api.listCourses({ search, limit: 50 }) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });

  const toggleFav = useMutation({
    mutationFn: (c: { id: string; favorite?: boolean }) => api.setCourseFavorite(c.id, !c.favorite),
    onSuccess: () => invalidate(['courses'])
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteCourse(id),
    onSuccess: () => invalidate(['courses', 'dashboard'])
  });
  const create = useMutation({
    mutationFn: () => api.createCourse({ title: form.title, difficulty: form.difficulty, categoryId: form.categoryId || undefined }),
    onSuccess: () => {
      setShowCreate(false);
      setForm({ title: '', difficulty: 3, categoryId: '' });
      invalidate(['courses']);
    }
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('courses')}</h1>
        <Button onClick={() => setShowCreate(true)}><Icon name="plus" size="sm" />{t('createCourse')}</Button>
      </div>
      <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<Icon name="inbox" size={32} />} title={t('empty')} hint="去导入中心上传资料" />
      ) : (
        <div className="space-y-2">
          {data.items.map((c) => (
            <Card key={c.id} className="group overflow-hidden transition-shadow hover:shadow-md">
              <CourseCover url={c.coverUrl ? api.baseUrl + c.coverUrl : null} title={c.title} className="h-24 w-full text-xl" />
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpenCourse(c.id)}>
                    <div className="truncate font-medium group-hover:text-primary">{c.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">{c.categoryName ? c.categoryName + ' · ' : ''}<Icon name="audio" size={11} />{c.playCount != null ? c.playCount + ' 次' : c.audioCount} · L{c.difficulty}</span>
                    </div>
                  </button>
                  <button
                    className={c.favorite ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary'}
                    aria-label={t('favorites')}
                    onClick={() => toggleFav.mutate(c)}
                  >
                    <Icon name="favorites" size="md" className={c.favorite ? 'fill-current' : ''} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{c.lastLearnedAt ? '上次学习 ' + new Date(c.lastLearnedAt).toLocaleDateString() : ''}</span>
                  <button
                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => {
                      if (confirm(t('deleteConfirm'))) del.mutate(c.id);
                    }}
                  >
                    {t('delete')}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          open={showCreate}
          title={t('createCourse')}
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t('cancel')}
              </Button>
              <Button disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()}>
                {t('confirm')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Input placeholder="课程标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {t('difficulty')} L{d}
                </option>
              ))}
            </Select>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">{t('category')}…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==================== Course Detail ====================

type CourseTab = 'subtitles' | 'materials' | 'notes';

function CourseDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const coverRef = React.useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const { data: course } = useQuery({ queryKey: ['course', id], queryFn: () => api.getCourse(id) });
  // 全局播放器：Mini Player 页面切换常驻，详情页只负责装载曲目
  const player = useGlobalPlayer();
  const engine = player.engine;
  const state = player.state;
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('both');
  const [autoScrollOn, setAutoScrollOn] = useState(true);
  const [tab, setTab] = useState<CourseTab>('subtitles');
  const loopParagraphRef = useRef<{ id: string | null }>({ id: null });

  const audio = course?.audios?.[0];

  useEffect(() => {
    if (!course || !audio) return;
    const remoteUrl = audio.url?.startsWith('http') ? audio.url : 'http://localhost:3001' + audio.url;
    // 磁盘缓存优先（秒开 + 锁屏/后台续播不耗流量）；未命中远程立即播放并后台静默缓存
    void (async () => {
      const cached = await cachedAudioUrl(course.id, audio.id, audio.originalName);
      const targetUrl = cached ?? remoteUrl;
      // 同曲目已在全局播放器（Mini Player 切走再回来）：不重载，播放不中断
      if (player.track?.audioId === audio.id && player.engine.getState().src === targetUrl) return;
      await player.loadTrack(
        { courseId: course.id, courseTitle: course.title, audioId: audio.id, audioName: audio.originalName, coverUrl: course.coverUrl ?? null },
        targetUrl,
        { startMs: course.lastPositionMs ?? 0, autoplay: false }
      );
      if (!cached) warmAudioCache(course.id, audio.id, audio.originalName, remoteUrl);
    })();
    // 系统媒体元数据（PC 锁屏 / 系统媒体浮窗 / 蓝牙控制）
    const cover = course.coverUrl
      ? course.coverUrl.startsWith('http') ? course.coverUrl : 'http://localhost:3001' + course.coverUrl
      : undefined;
    engine.setMediaMetadata({
      title: audio.originalName || course.title,
      artist: course.title,
      album: '英语学习',
      artwork: cover
    });
    // 学习心跳由 PlayerHost 的全局 PlayerProvider 接管
  }, [id, course && audio?.id]);

  useEffect(() => {
    if (!course?.transcript) return;
    const active = findActiveParagraph(course.transcript.paragraphs, state.currentTimeMs);
    if (active && active.id !== activeIdRef.current) {
      activeIdRef.current = active.id;
      setActiveId(active.id);
    }
  }, [state.currentTimeMs]);

  const clickParagraph = useCallback(
    (p: TranscriptParagraphDto) => {
      if (typeof p.startTimeMs === 'number') {
        engine.seek(p.startTimeMs);
        activeIdRef.current = p.id;
        setActiveId(p.id);
        if (!engine.getState().playing) void engine.play();
      } else {
        toast(t('noTimestamp'));
      }
    },
    [engine, t]
  );

  const toggleParagraphLoop = useCallback(() => {
    const current = loopParagraphRef.current.id === activeIdRef.current ? null : activeIdRef.current;
    loopParagraphRef.current.id = current;
    const p = course?.transcript?.paragraphs.find((x) => x.id === current);
    if (current && p && typeof p.startTimeMs === 'number') {
      engine.setLoopMode('paragraph', { startMs: p.startTimeMs, endMs: p.endTimeMs ?? p.startTimeMs + 5000 });
      engine.seek(p.startTimeMs);
    } else {
      engine.setLoopMode('off');
    }
  }, [course, engine]);

  useKeyboardShortcuts(engine, { onLoopParagraph: toggleParagraphLoop });

  const addToVocab = useCallback(
    async (p: TranscriptParagraphDto) => {
      const words = (p.textEn ?? '')
        .replace(/[^A-Za-z'\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const word = words[0];
      if (word) {
        await api.addVocabulary({ word, exampleSentence: p.textEn ?? '', sourceCourseId: id, sourceParagraphId: p.id });
        toast(t('addToVocab') + ': ' + word, true);
        invalidate(['vocabulary', 'dashboard']);
      }
    },
    [api, id, t, invalidate]
  );

  const favParagraph = useCallback(
    async (p: TranscriptParagraphDto) => {
      await api.addParagraphFavorite(p.id);
      toast(t('favoriteSentence'), true);
      invalidate(['favorites']);
    },
    [api, t, invalidate]
  );

  const copyParagraph = useCallback(
    async (p: TranscriptParagraphDto) => {
      await navigator.clipboard.writeText([p.textEn, p.textZh].filter(Boolean).join('\n'));
      toast(t('copyText'), true);
    },
    [t]
  );

  // 学习资料面板 —— 按自身时间戳跟随音频滚动（hooks 必须在早退之前）
  const materials = course?.materials ?? [];
  const notesDocs = useMemo(() => course?.notesDocuments ?? [], [course]);
  const materialActiveIds = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const m of materials) {
      const active = findActiveParagraph(m.paragraphs, state.currentTimeMs);
      map[m.id] = active?.id ?? null;
    }
    return map;
  }, [materials, state.currentTimeMs]);

  if (!course) return <Spinner />;
  const paragraphs = course.transcript?.paragraphs ?? [];

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <Icon name="arrowLeft" size="sm" />
          {t('courses')}
        </Button>
        {/* 双语模式/自动滚动仅在实时字幕标签下显示（与 Web 端对齐） */}
        {tab === 'subtitles' && (
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              {(
                [
                  ['both', t('bilingual')],
                  ['en', t('onlyEn')],
                  ['zh', t('onlyZh')]
                ] as [DisplayMode, string][]
              ).map(([m, l]) => (
                <button key={m} className={'px-2.5 py-1 text-xs ' + (mode === m ? 'bg-primary text-primary-foreground' : '')} onClick={() => setMode(m)}>
                  {l}
                </button>
              ))}
            </div>
            <Button variant={autoScrollOn ? 'active' : 'outline'} size="sm" onClick={() => setAutoScrollOn(!autoScrollOn)}>
              <Icon name="arrowDown" size="sm" />
              {t('autoScroll')}
            </Button>
          </div>
        )}
      </div>
      <h1 className="mb-2 text-xl font-semibold">{course.title}</h1>
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <button
          className={course.favorite ? 'text-warning' : 'hover:text-warning'}
          onClick={() => void api.setCourseFavorite(id, !course.favorite).then(() => invalidate(['course', 'courses', 'favorites']))}
        >
          <span className="inline-flex items-center gap-1"><Icon name="favorites" size={12} className={course.favorite ? 'fill-current' : ''} />{course.favorite ? '已收藏' : '收藏课程'}</span>
        </button>
        {state.loopMode === 'paragraph' && <Badge tone="warning"><Icon name="repeatOne" size={11} className="mr-1" />单句循环（L 键）</Badge>}
        {audio && <span className="flex items-center gap-1"><Icon name="audio" size={12} />{audio.originalName}</span>}
        <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => coverRef.current?.click()}>
          <Icon name="imagePlus" size={12} />
          设置封面
        </button>
        {/* 下载音频（签名 URL 直下；本地存储 ?download=1 强制 attachment） */}
        {audio?.url && (
          <a
            href={audio.url.startsWith('http') ? audio.url : api.baseUrl + (audio.url.startsWith('/storage/') ? `${audio.url}?download=1` : audio.url)}
            download={audio.originalName}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Icon name="arrowDown" size={12} />
            下载音频
          </a>
        )}
        <input
          ref={coverRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void api
              .uploadCourseCover(id, file)
              .then(() => {
                toast('封面已更新', true);
                invalidate(['course']);
              })
              .catch((err) => toast(err instanceof Error ? err.message : '封面上传失败'));
            e.target.value = '';
          }}
        />
      </div>
      {audio ? (
        <div className="mb-4">
          <AudioPlayer engine={engine} state={state} title={audio.originalName} onToggleParagraphLoop={toggleParagraphLoop} />
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="py-5 text-center text-sm text-muted-foreground">{t('noAudio')}</CardContent>
        </Card>
      )}

      {/* 标签栏：实时字幕 | 学习资料 | 学习笔记（切标签不打断音频） */}
      <div className="mb-4">
        <Tabs<CourseTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'subtitles', label: t('tabSubtitles') },
            ...(materials.length > 0 ? [{ value: 'materials' as const, label: t('studyMaterials') }] : []),
            ...(notesDocs.length > 0 || course.notes ? [{ value: 'notes' as const, label: t('notes') }] : [])
          ]}
        />
      </div>

      {tab === 'subtitles' &&
        (paragraphs.length === 0 ? (
          <EmptyState title={t('noTranscript')} />
        ) : (
          <BilingualReader
            paragraphs={paragraphs}
            activeParagraphId={activeId}
            mode={mode}
            autoScroll={autoScrollOn}
            onParagraphClick={clickParagraph}
            renderParagraphActions={(p) => (
              <>
                <button className="rounded px-1 text-xs hover:bg-accent" title={t('favoriteSentence')} onClick={(e) => { e.stopPropagation(); void favParagraph(p); }}>
                  <Icon name="star" size={13} />
                </button>
                <button className="rounded px-1 text-xs hover:bg-accent" title={t('addToVocab')} onClick={(e) => { e.stopPropagation(); void addToVocab(p); }}>
                  <Icon name="bookPlus" size={13} />
                </button>
                <button className="rounded px-1 text-xs hover:bg-accent" title={t('copyText')} onClick={(e) => { e.stopPropagation(); void copyParagraph(p); }}>
                  ⧉
                </button>
              </>
            )}
          />
        ))}

      {tab === 'materials' && (
        <div className="space-y-5">
          {materials.map((m) => (
            <div key={m.id}>
              {m.title && <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Icon name="pdf" size={12} />{m.title}</div>}
              <MaterialReader
                paragraphs={m.paragraphs}
                activeParagraphId={materialActiveIds[m.id] ?? null}
                followAudio={autoScrollOn}
              />
            </div>
          ))}
        </div>
      )}

      {tab === 'notes' && <NotesPanel courseId={id} notes={course.notes} docs={notesDocs} />}

    </div>
  );
}

/** 学习笔记标签：iframe 内嵌 PDF 预览 + 上传/删除；「新标签页打开」由主进程转系统浏览器 */
function NotesPanel({ courseId, notes, docs }: { courseId: string; notes?: string | null; docs: NotesDocumentDto[] }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const doc = docs.find((d) => d.id === selectedId) ?? docs[0];
  const src = doc ? (doc.url.startsWith('http') ? doc.url : api.baseUrl + doc.url) : undefined;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await api.uploadDocument(courseId, file, { role: 'notes' });
      toast(file.name, true);
      invalidate(['course', 'courses']);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('uploadFailed'));
    }
  };

  const remove = async (d: NotesDocumentDto) => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await api.deleteDocument(d.id);
      setSelectedId(null);
      invalidate(['course', 'courses']);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('uploadFailed'));
    }
  };

  return (
    <div className="space-y-4">
      {notes && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t('notes')}</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notes}</p>
          </CardContent>
        </Card>
      )}
      {docs.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {docs.length > 1 && (
                <Select className="max-w-56" value={doc?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName}
                    </option>
                  ))}
                </Select>
              )}
              <div className="flex-1" />
              {/* target=_blank：主进程 setWindowOpenHandler 转系统浏览器打开 */}
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent"
              >
                <Icon name="arrowRight" size="sm" />
                {t('openInNewTab')}
              </a>
              <a
                href={src ? `${src}?download=1` : undefined}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent"
              >
                <Icon name="arrowDown" size="sm" />
                {t('download')}
              </a>
              <Button size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                <Icon name="import" size="sm" />
                {t('uploadNotes')}
              </Button>
              {doc && (
                <Button size="sm" variant="destructive" onClick={() => void remove(doc)}>
                  <Icon name="trash" size="sm" />
                {t('delete')}
                </Button>
              )}
              <input
                ref={uploadRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {doc && src && (
              <iframe
                key={doc.id}
                title={doc.originalName}
                src={`${src}#view=FitH`}
                className="w-full rounded-lg border border-border bg-card"
                style={{ height: 'max(600px, calc(100vh - 16rem))' }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Import（上传 + 任务 + 校对） ====================

interface DraftParagraph {
  order: number;
  type: 'PARAGRAPH' | 'HEADING';
  textEn?: string | null;
  textZh?: string | null;
  confidence: number;
  warnings?: string[];
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  reviewStatus: string;
}

function ImportPage({ initialJobId, onOpenCourse }: { initialJobId?: string; onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const bridge = desktop();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [page, setPage] = useState(1);

  // 导入任务历史列表（与 Web 端一致，20 条/页）
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['importJobs', page],
    queryFn: () => api.listImportJobs({ page, limit: 20 })
  });

  const { data: job } = useQuery({
    queryKey: ['importJob', jobId],
    queryFn: () => api.getImportJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['RUNNING', 'PENDING'].includes(q.state.data.status) ? 3000 : false)
  });

  const pickAndImport = async () => {
    if (!bridge) {
      setMsg('仅桌面端支持本地文件导入');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const paths = await bridge.selectFiles({ multiple: true });
      if (paths.length === 0) return;
      const form = new FormData();
      for (const p of paths) {
        const f = await bridge.readLocalFile(p);
        form.append('files', new File([f.data], f.name));
      }
      const res = await fetch(api.baseUrl + '/api/import', { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? '上传失败 (' + res.status + ')');
      }
      const json = (await res.json()) as { id: string };
      setJobId(json.id);
      setPage(1);
      setMsg('已创建导入任务（' + paths.length + ' 个文件），解析中…');
      invalidate(['dashboard', 'importJobs']);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('importCenter')}</h1>
      <Card className="mb-4">
        <CardContent className="py-8 text-center">
          <div className="mb-2 flex justify-center"><Icon name="inbox" size={32} className="text-primary" /></div>
          <div className="text-sm">{t('importHint')}</div>
          <div className="mt-1 text-xs text-muted-foreground">同名的 PDF/MP3/双 SRT 自动匹配并合成双语课程（SRT 提供真实时间戳）</div>
          <Button className="mt-4" onClick={() => void pickAndImport()} disabled={busy}>
            {busy ? <Spinner className="mr-2" /> : null}
            选择本地文件（PDF / MP3 / SRT / TXT）
          </Button>
          {msg && <div className="mt-3 text-xs text-primary">{msg}</div>}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('importJobs')}</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const r = await api.rescan();
                  toast(`跨任务聚合完成：${r.grouped} 个文件已配对`, true);
                  invalidate(['importJobs']);
                  if (jobId) invalidate(['importJob']);
                } catch (e) {
                  toast(e instanceof Error ? e.message : '聚合失败');
                }
              }}
              title="分次上传的 MP3/字幕/文本会按集数自动凑组"
            >
              <Icon name="scanSearch" size="sm" className="mr-1 inline" /> 重新匹配
            </Button>
          </div>
          {jobsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !jobs || jobs.items.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="space-y-2">
              {jobs.items.map((j) => (
                <button
                  key={j.id}
                  className={
                    'flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm hover:bg-muted/50 ' +
                    (jobId === j.id ? 'border-primary' : 'border-border')
                  }
                  onClick={() => setJobId(j.id)}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.name ?? j.id}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(j.createdAt).toLocaleString()} · {j.files.length} 个文件
                      {j.failedFiles > 0 && <span className="text-destructive"> · {j.failedFiles} 失败</span>}
                    </div>
                  </div>
                  <Badge tone={j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'danger' : j.status === 'REVIEWING' ? 'warning' : 'default'}>
                    {j.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          {jobs && jobs.total > 20 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <Icon name="chevronLeft" size="sm" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {Math.ceil(jobs.total / 20)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(jobs.total / 20)} onClick={() => setPage(page + 1)}>
                <Icon name="chevronRight" size="sm" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {jobId && job && <JobPanel job={job} onOpenCourse={onOpenCourse} onClose={() => setJobId(null)} />}
    </div>
  );
}

function JobPanel({ job, onOpenCourse, onClose }: { job: ImportJobDto; onOpenCourse: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const { show: showToast } = useToast();
  const [fileId, setFileId] = useState<string | null>(null);
  const [notesPreviewId, setNotesPreviewId] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<DraftParagraph[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editEn, setEditEn] = useState('');
  const [editZh, setEditZh] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');

  const loadDraft = async (fid: string) => {
    const d = await api.getImportFileDraft(fid);
    setParagraphs(d.paragraphs as unknown as DraftParagraph[]);
    setEditing(null);
    setSelected(new Set());
  };

  /** 点击文件：学习笔记进预览说明；对照文本/字幕进段落草稿 */
  const selectFile = (f: ImportJobDto['files'][number]) => {
    if (f.kind === 'pdf' && f.docRole === 'notes') {
      setNotesPreviewId(f.id);
      setFileId(null);
      setParagraphs([]);
    } else {
      setNotesPreviewId(null);
      setFileId(f.id);
      void loadDraft(f.id);
    }
  };

  const changeRole = async (f: ImportJobDto['files'][number], role: 'source' | 'notes') => {
    try {
      await api.setImportFileRole(f.id, role);
      invalidate(['importJob', 'importJobs']);
      if (role === 'notes') {
        setNotesPreviewId(f.id);
        setFileId(null);
        setParagraphs([]);
      } else {
        setNotesPreviewId(null);
        setFileId(f.id);
        await loadDraft(f.id);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  };

  const op = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      if (fileId) await loadDraft(fileId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  };

  const publish = useMutation({
    mutationFn: (input?: { title?: string }) => api.publishJob(job.id, input),
    onSuccess: (r) => {
      const cid = (r as unknown as { courseId?: string }).courseId;
      invalidate(['courses', 'dashboard', 'importJobs']);
      showToast('已发布课程');
      if (cid) onOpenCourse(cid);
    },
    onError: (e) => showToast(e instanceof Error ? e.message : '发布失败', 'error')
  });

  const retry = useMutation({
    mutationFn: (fid: string) => api.retryImportFile(job.id, fid),
    onSuccess: () => invalidate(['importJobs'])
  });

  const textFiles = job.files.filter((f) => ['pdf', 'txt'].includes(f.kind) && f.docRole !== 'notes');
  const notesFiles = job.files.filter((f) => f.kind === 'pdf' && f.docRole === 'notes');
  const audioFiles = job.files.filter((f) => ['mp3', 'm4a', 'wav', 'mp4'].includes(f.kind));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{job.name ?? job.id}</span>
          <div className="flex items-center gap-2">
            <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}>{job.status}</Badge>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="收起">
              <Icon name="close" size="sm" />
            </Button>
          </div>
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          {textFiles.length} {t('textFilesUnit')} · {audioFiles.length} {t('audioFilesUnit')}
          {notesFiles.length > 0 && <> · {notesFiles.length} {t('notesPdfUnit')}</>}
        </div>
        <div className="space-y-1.5">
          {job.files.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <button
                className={'min-w-0 truncate text-left ' + (fileId === f.id || notesPreviewId === f.id ? 'font-medium text-primary' : 'hover:underline')}
                onClick={() => selectFile(f)}
              >
                {f.originalName} {f.paragraphCount != null && <span className="text-xs text-muted-foreground">· {f.paragraphCount} 段</span>}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {f.kind === 'pdf' && (
                  <>
                    <Badge tone={f.docRole === 'notes' ? 'warning' : 'muted'}>
                      {f.docRole === 'notes' ? (<span className="inline-flex items-center gap-1"><Icon name="pencil" size={11} />{t('notes')}</span>) : t('roleSource')}
                    </Badge>
                    <Select
                      className="h-7 w-28 text-xs"
                      value={f.docRole ?? 'source'}
                      onChange={(e) => void changeRole(f, e.target.value as 'source' | 'notes')}
                    >
                      <option value="source">{t('roleSource')}</option>
                      <option value="notes">{t('notes')}</option>
                    </Select>
                  </>
                )}
                <Badge tone={f.status === 'FAILED' ? 'danger' : f.status === 'DUPLICATE' ? 'warning' : f.status === 'MATCHED' ? 'success' : 'muted'} title={f.status === 'SKIPPED' ? '已存储，未找到同集数的文本/字幕' : undefined}>
                  {f.status === 'SKIPPED' ? '待文本' : f.status}
                </Badge>
                {f.status === 'FAILED' && (
                  <Button size="sm" variant="outline" onClick={() => retry.mutate(f.id)}>
                    {t('retry')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 学习笔记预览：不做段落校对，原样保存 */}
        {notesPreviewId && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="warning"><Icon name="pencil" size={11} className="mr-1" />{t('notes')}</Badge>
              <span className="text-sm text-muted-foreground">{t('notesPdfHint')}</span>
            </div>
            <iframe
              title="notes-preview"
              src={`${api.baseUrl}/api/import/files/${notesPreviewId}/raw#view=FitH`}
              className="w-full rounded-lg border border-border bg-card"
              style={{ height: 'max(480px, calc(100vh - 24rem))' }}
            />
          </div>
        )}

        {fileId && paragraphs.length > 0 && job.status !== 'COMPLETED' && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{t('review')}</span>
              <span className="text-xs text-muted-foreground">{paragraphs.length} 段</span>
              <div className="flex-1" />
              {selected.size >= 2 && (
                <Button size="sm" onClick={() => op(() => api.mergeFileParagraphs(fileId, Array.from(selected).sort((a, b) => a - b)))}>
                  合并选中 {selected.size} 段
                </Button>
              )}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {paragraphs.map((p, i) => {
                const lowConf = p.confidence < 0.5;
                return (
                  <div key={i} className={'rounded-md border px-3 py-2 ' + (lowConf ? 'border-l-4 border-l-amber-400' : '') + (selected.has(i) ? ' border-primary bg-primary/5' : ' border-border')}>
                    {editing === i ? (
                      <div className="space-y-2">
                        <textarea className="w-full rounded border border-input bg-transparent p-2 text-sm" value={editEn} onChange={(e) => setEditEn(e.target.value)} placeholder="English" />
                        <textarea className="w-full rounded border border-input bg-transparent p-2 text-sm" value={editZh} onChange={(e) => setEditZh(e.target.value)} placeholder="中文" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => op(async () => { await api.updateFileParagraph(fileId, i, { textEn: editEn, textZh: editZh }); setEditing(null); })}>
                            {t('save')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1.5"
                          checked={selected.has(i)}
                          onChange={(e) => {
                            const s = new Set(selected);
                            if (e.target.checked) s.add(i);
                            else s.delete(i);
                            setSelected(s);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">{p.textEn ?? <span className="italic text-muted-foreground">（无英文）</span>}</div>
                          <div className="text-sm text-muted-foreground">{p.textZh}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {typeof p.startTimeMs === 'number' && <span className="inline-flex items-center gap-1"><Icon name="timer" size={10} />{Math.floor(p.startTimeMs / 1000)}s</span>}
                            {lowConf && <span className="text-warning">置信度 {Math.round(p.confidence * 100)}%</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-xs">
                          <button className="rounded px-1 hover:bg-accent" aria-label={t('edit')} onClick={() => { setEditing(i); setEditEn(p.textEn ?? ''); setEditZh(p.textZh ?? ''); }}><Icon name="pencil" size={12} /></button>
                          <button className="rounded px-1 hover:bg-accent" aria-label={t('moveUp')} onClick={() => op(() => api.reorderFileParagraph(fileId, i, 'up'))}><Icon name="arrowUp" size={12} /></button>
                          <button className="rounded px-1 hover:bg-accent" aria-label={t('moveDown')} onClick={() => op(() => api.reorderFileParagraph(fileId, i, 'down'))}><Icon name="arrowDown" size={12} /></button>
                          <button className="rounded px-1 text-destructive hover:bg-accent" aria-label={t('delete')} onClick={() => op(() => api.deleteFileParagraph(fileId, i))}><Icon name="trash" size={12} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 发布（学习笔记不单独生成课程，附到对应课程） */}
        {job.status !== 'COMPLETED' && job.files.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 text-xs text-muted-foreground">
              {textFiles.length > 0
                ? `${t('publishHint')}，每个文本文件生成一个课程${notesFiles.length > 0 ? `；${t('publishNotesHint')}` : ''}`
                : audioFiles.length > 0
                  ? `将发布为仅音频课程（无文本），文本可稍后在课程页补传${notesFiles.length > 0 ? `；${t('publishNotesHint')}` : ''}`
                  : t('notesOnlyCannotPublish')}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input placeholder="课程标题（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <Button disabled={publish.isPending} onClick={() => publish.mutate(title ? { title } : undefined)}>
                <Icon name="check" size="sm" />
              {t('confirm')} & {t('publish')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Vocabulary ====================

function VocabularyPage() {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState('');
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['vocabulary', search], queryFn: () => api.listVocabulary({ search: search || undefined }) });

  const lookup = async (word: string) => {
    setLookingUp(word);
    try {
      const r = await api.lookupWord(word);
      if (r.source === 'none') toast(`词典未收录「${word}」`);
      else toast(r.source === 'cache' ? `${word}：已有词典释义` : `已获取「${word}」释义`, true);
      invalidate(['vocabulary']);
    } catch (e) {
      toast(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLookingUp(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('vocabulary')}</h1>
      <Input placeholder="搜索单词…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('empty')} hint="在课程详情页点段落的加入生词按钮" />
      ) : (
        <div className="space-y-2">
          {data.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{v.word}</span>
                    <Badge tone={v.status === 'MASTERED' ? 'success' : v.status === 'LEARNING' ? 'warning' : 'muted'}>
                      {v.status === 'NEW' ? t('newWord') : v.status === 'LEARNING' ? t('learning') : t('mastered')}
                    </Badge>
                  </div>
                  {v.exampleSentence && <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{v.exampleSentence}”</div>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {v.sourceCourseTitle ? t('source') + ': ' + v.sourceCourseTitle + ' · ' : ''}复习 {v.reviewCount} 次
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={lookingUp !== null}
                    onClick={() => void lookup(v.word)}
                    aria-label={`查词典：${v.word}`}
                  >
                    <Icon name="search" size={12} />
                    {lookingUp === v.word ? '查询中…' : '查词典'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const next = v.status === 'NEW' ? 'LEARNING' : v.status === 'LEARNING' ? 'MASTERED' : 'NEW';
                      await api.updateVocabulary(v.id, { status: next });
                      invalidate(['vocabulary', 'dashboard']);
                    }}
                  >
                    状态
                    <Icon name="arrowRight" size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm(t('deleteConfirm'))) return;
                      await api.removeVocabulary(v.id);
                      invalidate(['vocabulary', 'dashboard']);
                    }}
                  >
                    {t('delete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Favorites ====================

function FavoritesPage() {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const [type, setType] = useState<'COURSE' | 'PARAGRAPH' | undefined>(undefined);
  const { data, isLoading } = useQuery({ queryKey: ['favorites', type ?? 'all'], queryFn: () => api.listFavorites(type ? { type } : undefined) });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('favorites')}</h1>
      <div className="mb-4 flex gap-2">
        {(
          [
            [undefined, '全部'],
            ['COURSE', t('courses')],
            ['PARAGRAPH', t('favoriteSentence')]
          ] as [typeof type, string][]
        ).map(([v, label]) => (
          <Button key={label} variant={type === v ? 'active' : 'outline'} size="sm" onClick={() => setType(v)}>
            {label}
          </Button>
        ))}
      </div>
      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div className="space-y-2">
          {data.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  {f.type === 'COURSE' ? (
                    <div className="flex items-center gap-1.5 text-sm font-medium"><Icon name="favorites" size={13} className="text-primary" />{f.courseTitle ?? '课程'}</div>
                  ) : (
                    <div className="text-sm">
                      <div className="line-clamp-2">{f.excerptEn}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.excerptZh}</div>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  onClick={async () => {
                    await api.removeFavorite(f.id);
                    invalidate(['favorites', 'courses']);
                  }}
                >
                  <Icon name="close" size="sm" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== 托盘命令 + 启动 ====================

function useTrayCommands() {
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    return bridge.onTrayCommand((cmd) => {
      const audio = document.querySelector('audio');
      if (!audio) return;
      if (cmd === 'play-pause') audio.paused ? void audio.play() : audio.pause();
      if (cmd === 'skip-back') audio.currentTime = Math.max(0, audio.currentTime - 5);
      if (cmd === 'skip-forward') audio.currentTime = audio.currentTime + 5;
    });
  }, []);
}

function Root() {
  useTrayCommands();
  const [apiBase, setApiBase] = useState<string | null>(null);
  useEffect(() => {
    const bridge = desktop();
    if (bridge) void bridge.getApiBaseUrl().then(setApiBase);
    else setApiBase('http://localhost:3001');
  }, []);
  if (!apiBase) return <Spinner />;
  (window as unknown as { ELP_API_BASE?: string }).ELP_API_BASE = apiBase;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null, React.createElement(Root))
);
