/**
 * Electron 渲染端入口：复用共享 packages（ui / player / api-client / types）。
 * 页面集合：Dashboard / Courses / CourseDetail / Import（本地文件走 IPC 导入）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { I18nProvider, ThemeProvider, useI18n, Button, Card, CardContent, Badge, EmptyState, Spinner, Input } from '@elp/ui';
import { AudioPlayer, formatTime, useAudioEngine, usePlayerState, useKeyboardShortcuts } from '@elp/player';
import { BilingualReader, findActiveParagraph, type DisplayMode } from '@elp/ui';
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

type Route = { page: 'dashboard' } | { page: 'courses' } | { page: 'course'; id: string } | { page: 'import' };

function DesktopApp() {
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const nav = [
    { page: 'dashboard' as const, icon: '📊', label: t('dashboard') },
    { page: 'courses' as const, icon: '📚', label: t('courses') },
    { page: 'import' as const, icon: '📥', label: t('importCenter') }
  ];
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-card pt-10">
        <div className="mb-4 px-4 text-sm font-semibold">{t('appName')}</div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((n) => (
            <button
              key={n.page}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${route.page === n.page ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => setRoute({ page: n.page } as Route)}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 text-[10px] text-muted-foreground">Electron · macOS</div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {route.page === 'dashboard' && <Dash onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'courses' && <Courses onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
        {route.page === 'course' && <CourseDetailPage id={route.id} onBack={() => setRoute({ page: 'courses' })} />}
        {route.page === 'import' && <ImportPage onOpenCourse={(id) => setRoute({ page: 'course', id })} />}
      </main>
    </div>
  );
}

function Dash({ onOpenCourse }: { onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const { data, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboardStats(), refetchInterval: 60_000, retry: 2 });
  if (isError) {
    return (
      <EmptyState
        icon="⚠️"
        title="无法连接 API (http://localhost:3001)"
        hint="请确认已启动后端：pnpm dev:api，然后点击重试"
      />
    );
  }
  if (!data) return <Spinner />;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('dashboard')}</h1>
      {data.continueLearning && (
        <Card className="mb-4 border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <div className="text-xs text-primary">{t('continueLearning')}</div>
              <div className="font-medium">{data.continueLearning.title}</div>
              <div className="text-xs text-muted-foreground">{formatTime(data.continueLearning.positionMs)}</div>
            </div>
            <Button onClick={() => onOpenCourse(data.continueLearning!.courseId)}>▶</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-4 gap-3">
        {[
          [t('todayMs'), `${Math.round(data.todayMs / 60000)}${t('minutes')}`],
          [t('streakDays'), `${data.streakDays}`],
          [t('courses'), `${data.courseCount}`],
          [t('vocabularyCount'), `${data.vocabularyCount}`]
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Courses({ onOpenCourse }: { onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const [search, setSearch] = useState('');
  const { data } = useQuery({ queryKey: ['courses', search], queryFn: () => api.listCourses({ search, limit: 50 }) });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('courses')}</h1>
      <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      {!data ? (
        <EmptyState icon="⚠️" title="无法连接 API" hint="请确认已启动后端：pnpm dev:api" />
      ) : data.items.length === 0 ? (
        <EmptyState icon="📚" title={t('empty')} />
      ) : (
        <div className="space-y-2">
          {data.items.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md" onClick={() => onOpenCourse(c.id)}>
              <CardContent className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">🎧 {c.audioCount}</div>
                </div>
                <Badge tone="muted">L{c.difficulty}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function useApiClient() {
  return useMemo(() => {
    const base = typeof window !== 'undefined' && (window as unknown as { ELP_API_BASE?: string }).ELP_API_BASE;
    return new ApiClient({ baseUrl: base || 'http://localhost:3001' });
  }, []);
}

function CourseDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const { data: course } = useQuery({ queryKey: ['course', id], queryFn: () => api.getCourse(id) });
  const engine = useAudioEngine();
  const state = usePlayerState(engine);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('both');

  const audio = course?.audios?.[0];
  useEffect(() => {
    if (!course || !audio) return;
    const url = audio.url?.startsWith('http') ? audio.url : `http://localhost:3001${audio.url}`;
    void engine.load(url, { startMs: course.lastPositionMs ?? 0 });
    engine.onProgressTick = (pos) => void api.heartbeat({ courseId: id, audioAssetId: audio.id, positionMs: pos, deltaMs: 5000 }).catch(() => undefined);
    return () => {
      engine.onProgressTick = null;
    };
    // 依赖刻意收窄
  }, [id, course && audio?.id]);

  useEffect(() => {
    if (!course?.transcript) return;
    const active = findActiveParagraph(course.transcript.paragraphs, state.currentTimeMs);
    if (active && active.id !== activeId) setActiveId(active.id);
    // 依赖刻意收窄
  }, [state.currentTimeMs]);

  useKeyboardShortcuts(engine);

  if (!course) return <Spinner />;
  const paragraphs = course.transcript?.paragraphs ?? [];

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← {t('courses')}
        </Button>
        <div className="flex overflow-hidden rounded-md border border-border">
          {([['both', t('bilingual')], ['en', t('onlyEn')], ['zh', t('onlyZh')]] as [DisplayMode, string][]).map(([m, l]) => (
            <button key={m} className={`px-2.5 py-1 text-xs ${mode === m ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <h1 className="mb-4 text-xl font-semibold">{course.title}</h1>
      {audio ? (
        <div className="mb-4">
          <AudioPlayer engine={engine} state={state} title={audio.originalName} />
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
          onParagraphClick={(p) => {
            if (typeof p.startTimeMs === 'number') {
              engine.seek(p.startTimeMs);
              if (!state.playing) void engine.play();
            }
          }}
        />
      )}
    </div>
  );
}

/** 桌面导入：系统文件选择 → 主进程校验读取 → 上传 API */
function ImportPage({ onOpenCourse }: { onOpenCourse: (id: string) => void }) {
  const { t } = useI18n();
  const api = useApiClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const bridge = desktop();

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
      const res = await fetch(`${api.baseUrl}/api/import`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `上传失败 (${res.status})`);
      }
      const json = (await res.json()) as { id: string };
      setJobId(json.id);
      setMsg(`已创建导入任务（${paths.length} 个文件），解析中…`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const { data: job } = useQuery({
    queryKey: ['importJob', jobId],
    queryFn: () => api.getImportJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 3000
  });

  const publish = useMutation({
    mutationFn: (jid: string) => api.publishJob(jid),
    onSuccess: (r) => {
      const cid = (r as unknown as { courseId?: string }).courseId;
      if (cid) onOpenCourse(cid);
    }
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('importCenter')}</h1>
      <Card className="mb-4">
        <CardContent className="py-8 text-center">
          <div className="mb-2 text-3xl">📥</div>
          <div className="text-sm">{t('importHint')}</div>
          <Button className="mt-4" onClick={() => void pickAndImport()} disabled={busy}>
            {busy ? <Spinner className="mr-2" /> : null}
            选择本地文件（PDF / MP3 / SRT / TXT）
          </Button>
          {msg && <div className="mt-3 text-xs text-primary">{msg}</div>}
        </CardContent>
      </Card>
      {job && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{job.name}</span>
              <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}>{job.status}</Badge>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {job.files.map((f) => (
                <div key={f.id} className="flex justify-between">
                  <span>{f.originalName}</span>
                  <span>
                    {f.status} {f.paragraphCount ? `· ${f.paragraphCount} 段` : ''}
                  </span>
                </div>
              ))}
            </div>
            {job.status === 'REVIEWING' && (
              <Button className="mt-3" onClick={() => publish.mutate(job.id)} disabled={publish.isPending}>
                ✓ {t('publish')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 桌面端托盘命令 → 全局播放控制（简单实现：找到 audio 元素）
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
  // 桌面端 API 地址来自主进程
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
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
