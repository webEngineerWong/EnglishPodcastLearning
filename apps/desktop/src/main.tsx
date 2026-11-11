/**
 * Electron 渲染端入口：功能与 Web 端对齐。
 * 复用共享 packages（ui / player / api-client / types），本地文件导入走主进程 IPC。
 * 页面：Dashboard / Courses / CourseDetail / Import（含校对）/ Vocabulary / Favorites
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { I18nProvider, ThemeProvider, useI18n, BilingualReader, findActiveParagraph, Button, Card, CardContent, Badge, EmptyState, Spinner, Input, Select, Modal, type DisplayMode } from '@elp/ui';
import { AudioPlayer, formatTime, useAudioEngine, usePlayerState, useKeyboardShortcuts } from '@elp/player';
import type { ImportJobDto, TranscriptParagraphDto } from '@elp/types';
import { ApiClient } from '@elp/api-client';
import { desktop } from './bridge';
import './index.css';

const QueryCtx = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function App() {
  return (
    <QueryClientProvider client={QueryCtx}>
      <ThemeProvider>
        <I18nProvider>
          <DesktopApp />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
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
  el.className = 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-lg ' + (ok ? 'bg-emerald-600 text-white' : 'bg-foreground text-background');
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

// ==================== 布局 ====================

function DesktopApp() {
  const { t } = useI18n();
  const { resolved, setMode } = useThemeCtl();
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const nav = [
    { page: 'dashboard' as const, icon: '📊', label: t('dashboard') },
    { page: 'courses' as const, icon: '📚', label: t('courses') },
    { page: 'import' as const, icon: '📥', label: t('importCenter') },
    { page: 'vocabulary' as const, icon: '🔤', label: t('vocabulary') },
    { page: 'favorites' as const, icon: '⭐', label: t('favorites') }
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
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center justify-between px-3 pb-4 text-[10px] text-muted-foreground">
          <span>Electron · macOS</span>
          <button className="rounded px-1 hover:bg-accent" onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {route.page === 'dashboard' && <Dash onOpenCourse={(id) => setRoute({ page: 'course', id })} onOpenImport={() => setRoute({ page: 'import' })} />}
        {route.page === 'courses' && <Courses onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'course' && <CourseDetailPage id={route.id} onBack={() => setRoute({ page: 'courses' })} />}
        {route.page === 'import' && <ImportPage initialJobId={'jobId' in route ? route.jobId : undefined} onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'vocabulary' && <VocabularyPage />}
        {route.page === 'favorites' && <FavoritesPage />}
      </main>
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
            <Button onClick={() => onOpenCourse(data.continueLearning!.courseId)}>▶ 继续</Button>
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
        <Button onClick={() => setShowCreate(true)}>+ {t('createCourse')}</Button>
      </div>
      <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState icon="📚" title={t('empty')} hint="去导入中心上传资料" />
      ) : (
        <div className="space-y-2">
          {data.items.map((c) => (
            <Card key={c.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpenCourse(c.id)}>
                    <div className="truncate font-medium group-hover:text-primary">{c.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.categoryName ? c.categoryName + ' · ' : ''}🎧 {c.audioCount} · L{c.difficulty}
                    </div>
                  </button>
                  <button
                    className={c.favorite ? 'text-amber-400' : 'text-muted-foreground/40 hover:text-amber-400'}
                    title={t('favorites')}
                    onClick={() => toggleFav.mutate(c)}
                  >
                    {c.favorite ? '★' : '☆'}
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

function CourseDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const { data: course } = useQuery({ queryKey: ['course', id], queryFn: () => api.getCourse(id) });
  const engine = useAudioEngine();
  const state = usePlayerState(engine);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('both');
  const loopParagraphRef = useRef<{ id: string | null }>({ id: null });

  const audio = course?.audios?.[0];

  useEffect(() => {
    if (!course || !audio) return;
    const url = audio.url?.startsWith('http') ? audio.url : 'http://localhost:3001' + audio.url;
    void engine.load(url, { startMs: course.lastPositionMs ?? 0 });
    engine.onProgressTick = (pos) => void api.heartbeat({ courseId: id, audioAssetId: audio.id, positionMs: Math.round(pos), deltaMs: 5000 }).catch(() => undefined);
    return () => {
      engine.onProgressTick = null;
    };
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

  if (!course) return <Spinner />;
  const paragraphs = course.transcript?.paragraphs ?? [];

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← {t('courses')}
        </Button>
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
      </div>
      <h1 className="mb-2 text-xl font-semibold">{course.title}</h1>
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <button
          className={course.favorite ? 'text-amber-400' : 'hover:text-amber-400'}
          onClick={() => void api.setCourseFavorite(id, !course.favorite).then(() => invalidate(['course', 'courses', 'favorites']))}
        >
          {course.favorite ? '★ 已收藏' : '☆ 收藏课程'}
        </button>
        {state.loopMode === 'paragraph' && <Badge tone="warning">🔂 单句循环（L 键）</Badge>}
        {audio && <span>🎧 {audio.originalName}</span>}
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
      {paragraphs.length === 0 ? (
        <EmptyState icon="📄" title={t('noTranscript')} />
      ) : (
        <BilingualReader
          paragraphs={paragraphs}
          activeParagraphId={activeId}
          mode={mode}
          onParagraphClick={clickParagraph}
          renderParagraphActions={(p) => (
            <>
              <button className="rounded px-1 text-xs hover:bg-accent" title={t('favoriteSentence')} onClick={(e) => { e.stopPropagation(); void favParagraph(p); }}>
                ☆
              </button>
              <button className="rounded px-1 text-xs hover:bg-accent" title={t('addToVocab')} onClick={(e) => { e.stopPropagation(); void addToVocab(p); }}>
                🔤
              </button>
              <button className="rounded px-1 text-xs hover:bg-accent" title={t('copyText')} onClick={(e) => { e.stopPropagation(); void copyParagraph(p); }}>
                ⧉
              </button>
            </>
          )}
        />
      )}
      {course.notes && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t('notes')}</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{course.notes}</p>
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
      setMsg('已创建导入任务（' + paths.length + ' 个文件），解析中…');
      invalidate(['dashboard']);
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
          <div className="mb-2 text-3xl">📥</div>
          <div className="text-sm">{t('importHint')}</div>
          <div className="mt-1 text-xs text-muted-foreground">同名的 PDF/MP3/双 SRT 自动匹配并合成双语课程（SRT 提供真实时间戳）</div>
          <Button className="mt-4" onClick={() => void pickAndImport()} disabled={busy}>
            {busy ? <Spinner className="mr-2" /> : null}
            选择本地文件（PDF / MP3 / SRT / TXT）
          </Button>
          {msg && <div className="mt-3 text-xs text-primary">{msg}</div>}
        </CardContent>
      </Card>

      <div className="mb-4 flex justify-end">
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
          🔍 重新匹配
        </Button>
      </div>

      {jobId && job && <JobPanel job={job} onOpenCourse={onOpenCourse} />}
    </div>
  );
}

function JobPanel({ job, onOpenCourse }: { job: ImportJobDto; onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const invalidate = useInvalidate();
  const [fileId, setFileId] = useState<string | null>(null);
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

  const op = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      if (fileId) await loadDraft(fileId);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const publish = useMutation({
    mutationFn: (input?: { title?: string }) => api.publishJob(job.id, input),
    onSuccess: (r) => {
      const cid = (r as unknown as { courseId?: string }).courseId;
      invalidate(['courses', 'dashboard', 'importJobs']);
      toast('已发布课程', true);
      if (cid) onOpenCourse(cid);
    },
    onError: (e) => alert(e instanceof Error ? e.message : '发布失败')
  });

  const retry = useMutation({
    mutationFn: (fid: string) => api.retryImportFile(job.id, fid),
    onSuccess: () => invalidate(['importJobs'])
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{job.name ?? job.id}</span>
          <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}>{job.status}</Badge>
        </div>
        <div className="space-y-1.5">
          {job.files.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <button
                className={'min-w-0 truncate text-left ' + (fileId === f.id ? 'font-medium text-primary' : 'hover:underline')}
                onClick={() => {
                  setFileId(f.id);
                  void loadDraft(f.id);
                }}
              >
                {f.originalName} {f.paragraphCount != null && <span className="text-xs text-muted-foreground">· {f.paragraphCount} 段</span>}
              </button>
              <div className="flex shrink-0 items-center gap-2">
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

        {fileId && paragraphs.length > 0 && (
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
                            {typeof p.startTimeMs === 'number' && <span>⏱ {Math.floor(p.startTimeMs / 1000)}s</span>}
                            {lowConf && <span className="text-amber-600">置信度 {Math.round(p.confidence * 100)}%</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-xs">
                          <button className="rounded px-1 hover:bg-accent" title={t('edit')} onClick={() => { setEditing(i); setEditEn(p.textEn ?? ''); setEditZh(p.textZh ?? ''); }}>✎</button>
                          <button className="rounded px-1 hover:bg-accent" title={t('moveUp')} onClick={() => op(() => api.reorderFileParagraph(fileId, i, 'up'))}>↑</button>
                          <button className="rounded px-1 hover:bg-accent" title={t('moveDown')} onClick={() => op(() => api.reorderFileParagraph(fileId, i, 'down'))}>↓</button>
                          <button className="rounded px-1 text-red-500 hover:bg-accent" title={t('delete')} onClick={() => op(() => api.deleteFileParagraph(fileId, i))}>🗑</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-end gap-2">
              <div className="flex-1">
                <Input placeholder="课程标题（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <Button disabled={publish.isPending} onClick={() => publish.mutate(title ? { title } : undefined)}>
                ✓ {t('confirm')} & {t('publish')}
              </Button>
            </div>
            {job.files.every((f) => ['mp3', 'm4a', 'wav', 'mp4'].includes(f.kind)) && (
              <div className="mt-3 text-xs text-muted-foreground">将发布为仅音频课程（无文本），文本可稍后在课程页补传</div>
            )}
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
  const { data, isLoading } = useQuery({ queryKey: ['vocabulary', search], queryFn: () => api.listVocabulary({ search: search || undefined }) });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('vocabulary')}</h1>
      <Input placeholder="搜索单词…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="🔤" title={t('empty')} hint="在课程详情页点击段落旁的 🔤 加入生词" />
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
                    onClick={async () => {
                      const next = v.status === 'NEW' ? 'LEARNING' : v.status === 'LEARNING' ? 'MASTERED' : 'NEW';
                      await api.updateVocabulary(v.id, { status: next });
                      invalidate(['vocabulary', 'dashboard']);
                    }}
                  >
                    状态→
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500"
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
        <EmptyState icon="⭐" title={t('empty')} />
      ) : (
        <div className="space-y-2">
          {data.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  {f.type === 'COURSE' ? (
                    <div className="text-sm font-medium">⭐ {f.courseTitle ?? '课程'}</div>
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
                  className="shrink-0 text-red-500"
                  onClick={async () => {
                    await api.removeFavorite(f.id);
                    invalidate(['favorites', 'courses']);
                  }}
                >
                  ✕
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
