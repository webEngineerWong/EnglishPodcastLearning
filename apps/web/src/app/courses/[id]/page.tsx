'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Select, Spinner, Tabs, useI18n } from '@elp/ui';
import {
  AudioPlayer,
  formatTime,
  useAudioEngine,
  useKeyboardShortcuts,
  usePlayerState,
  type AudioEngine
} from '@elp/player';
import { BilingualReader, MaterialReader, findActiveParagraph, type DisplayMode } from '@elp/ui';
import type { NotesDocumentDto, TranscriptParagraphDto } from '@elp/types';
import { api, assetUrl } from '@/lib/api';
import { DifficultyBadge, PageHeader } from '@/components/shell';

type CourseTab = 'subtitles' | 'materials' | 'notes';

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const courseId = params.id;
  const { t } = useI18n();

  const [course, setCourse] = useState<Awaited<ReturnType<typeof api.getCourse>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('both');
  const [autoScroll, setAutoScroll] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(null);
  const [showTiming, setShowTiming] = useState(false);
  const appendRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<CourseTab>('subtitles');
  const resumeMs = useMemo(() => Number(searchParams.get('resume') ?? 0), [searchParams]);
  const loopParagraphRef = useRef<{ id: string | null }>({ id: null });

  const engine = useAudioEngine();
  const state = usePlayerState(engine);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getCourse(courseId)
      .then((c) => {
        if (cancelled) return;
        setCourse(c);
        // URL 参数直达标签（?tab=notes / ?tab=materials），不影响 ?resume=
        const want = searchParams.get('tab');
        if (want === 'notes' && ((c.notesDocuments?.length ?? 0) > 0 || c.notes)) setTab('notes');
        else if (want === 'materials' && (c.materials?.length ?? 0) > 0) setTab('materials');
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // 引擎初始化：恢复播放位置 + 学习心跳
  const audioList = course?.audios ?? [];
  const audioIndex = audioList.length > 0 ? 0 : -1;

  useEffect(() => {
    if (!course || audioIndex < 0) return;
    const audio = audioList[audioIndex];
    const url = assetUrl(audio.url);
    if (!url) return;
    engine.onProgressTick = (positionMs) => {
      void api.heartbeat({ courseId, audioAssetId: audio.id, positionMs: Math.round(positionMs), deltaMs: 5000 }).catch(() => undefined);
    };
    // 首次加载：恢复进度（URL 带 resume 参数优先）
    void (async () => {
      const resume = resumeMs > 0 ? resumeMs : course.lastPositionMs ?? 0;
      await engine.load(url, { startMs: resume, rate: 1 });
    })();
    return () => {
      engine.onProgressTick = null;
    };
    // 依赖刻意收窄
  }, [courseId, course && course.audios[0]?.id]);

  // 时间同步：高亮当前段落（id 相同不触发渲染）
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!course?.transcript) return;
    const active = findActiveParagraph(course.transcript.paragraphs, state.currentTimeMs);
    if (active && active.id !== activeIdRef.current) {
      activeIdRef.current = active.id;
      setActiveParagraphId(active.id);
    }
    // 依赖刻意收窄
  }, [state.currentTimeMs]);

  const clickParagraph = useCallback(
    (p: TranscriptParagraphDto) => {
      if (typeof p.startTimeMs === 'number') {
        engine.seek(p.startTimeMs);
        activeIdRef.current = p.id;
        setActiveParagraphId(p.id);
        if (!engine.getState().playing) void engine.play();
      } else {
        setToast(t('noTimestamp'));
        setTimeout(() => setToast(null), 2500);
      }
    },
    [engine, t]
  );

  const renderActions = useCallback(
    (p: TranscriptParagraphDto) => <ParagraphActions paragraph={p} courseId={courseId} />,
    [courseId]
  );

  // 单句循环开关（作用于当前高亮段落）
  const toggleParagraphLoop = () => {
    const current = loopParagraphRef.current.id === activeParagraphId ? null : activeParagraphId;
    loopParagraphRef.current.id = current;
    const p = course?.transcript?.paragraphs.find((x) => x.id === current);
    if (current && p && typeof p.startTimeMs === 'number') {
      engine.setLoopMode('paragraph', {
        startMs: p.startTimeMs,
        endMs: p.endTimeMs ?? p.startTimeMs + 5000
      });
      engine.seek(p.startTimeMs);
    } else {
      engine.setLoopMode('off');
    }
  };

  useKeyboardShortcuts(engine, { onLoopParagraph: toggleParagraphLoop });

  // 学习资料面板（对照 PDF 解析内容）—— 按自身时间戳跟随音频滚动
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

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error || !course) return <EmptyState icon="⚠️" title={error ?? t('empty')} />;
  if (!course) return null;

  const paragraphs = course.transcript?.paragraphs ?? [];
  const audio = audioList[audioIndex];

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <PageHeader
        title={course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DifficultyBadge level={course.difficulty} />
            {course.categoryName && <Badge tone="muted">{course.categoryName}</Badge>}
            {course.tags.map((tag) => (
              <Badge key={tag} tone="muted">
                #{tag}
              </Badge>
            ))}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/courses')}>
              ← {t('courses')}
            </Button>
            <input
              ref={appendRef}
              type="file"
              accept=".mp3,.m4a,.wav,.pdf,.txt,.srt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ext = file.name.toLowerCase().split('.').pop() ?? '';
                const isAudio = ['mp3', 'm4a', 'wav'].includes(ext);
                const upload = isAudio ? Promise.resolve(api.uploadAudio(courseId, file)) : Promise.resolve(api.uploadDocument(courseId, file));
                void upload
                  .then(() => {
                    setToast('已追加：' + file.name);
                    setTimeout(() => setToast(null), 2500);
                    return api.getCourse(courseId).then(setCourse);
                  })
                  .catch((err) => {
                    setToast(err instanceof Error ? err.message : '上传失败');
                    setTimeout(() => setToast(null), 2500);
                  });
                e.target.value = '';
              }}
            />
            <Button variant="outline" onClick={() => appendRef.current?.click()}>
              📎 追加音频/文本
            </Button>
            <Button variant={showTiming ? 'active' : 'outline'} onClick={() => setShowTiming(!showTiming)}>
              ⏱ {t('paragraphTime')}
            </Button>
          </>
        }
      />

      {/* 播放器 */}
      {audio ? (
        <div className="sticky top-14 z-30 mb-4 md:top-2">
          <AudioPlayer
            engine={engine as AudioEngine}
            state={state}
            title={audio.originalName}
            onToggleParagraphLoop={toggleParagraphLoop}
          />
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">{t('noAudio')}</CardContent>
        </Card>
      )}

      {/* 标签栏：实时字幕 | 学习资料 | 学习笔记（播放器保持 sticky，切标签不打断音频） */}
      <div className="mb-3">
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

      {/* 工具栏（仅实时字幕标签下显示） */}
      {tab === 'subtitles' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">{t('clickToPlay')}</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            {(
              [
                ['both', t('bilingual')],
                ['en', t('onlyEn')],
                ['zh', t('onlyZh')]
              ] as [DisplayMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                className={`px-3 py-1.5 text-xs ${mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant={autoScroll ? 'active' : 'outline'} size="sm" onClick={() => setAutoScroll(!autoScroll)}>
            ↕ {t('autoScroll')}
          </Button>
          {state.loopMode === 'paragraph' && <Badge tone="warning">🔂 {t('loopParagraph')}</Badge>}
          {state.loopMode === 'ab' && <Badge tone="warning">A-B</Badge>}
        </div>
      )}

      {/* 实时字幕 */}
      {tab === 'subtitles' && (
        <Card>
          <CardContent className="p-3 md:p-4">
            {paragraphs.length === 0 ? (
              <EmptyState icon="📄" title={t('noTranscript')} />
            ) : (
              <BilingualReader
                paragraphs={paragraphs}
                activeParagraphId={activeParagraphId}
                onParagraphClick={clickParagraph}
                onNoTimestamp={() => undefined}
                mode={mode}
                autoScroll={autoScroll}
                renderParagraphActions={renderActions}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 学习资料（原折叠区内容，MaterialReader 跟随音频滚动） */}
      {tab === 'materials' && (
        <Card>
          <CardContent className="space-y-5 p-3 md:p-4">
            {materials.map((m) => (
              <div key={m.id}>
                {m.title && <div className="mb-2 text-xs font-semibold text-muted-foreground">📄 {m.title}</div>}
                <MaterialReader
                  paragraphs={m.paragraphs}
                  activeParagraphId={materialActiveIds[m.id] ?? null}
                  followAudio={autoScroll}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 学习笔记（内嵌 PDF 预览） */}
      {tab === 'notes' && (
        <NotesPanel
          courseId={courseId}
          notes={course.notes}
          docs={notesDocs}
          onChanged={() => api.getCourse(courseId).then(setCourse)}
        />
      )}

      {/* 段落时间编辑 */}
      {showTiming && audio && (
        <TimingEditor paragraphs={paragraphs} audioId={audio.id} engine={engine} onChanged={() => api.getCourse(courseId).then(setCourse)} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/** 段落操作：收藏 / 加生词 */
function ParagraphActions({ paragraph, courseId }: { paragraph: TranscriptParagraphDto; courseId: string }) {
  const { t } = useI18n();
  const [fav, setFav] = useState(false);
  return (
    <>
      <button
        className="rounded px-1 text-xs hover:bg-accent"
        title={t('favoriteSentence')}
        onClick={async (e) => {
          e.stopPropagation();
          await api.addParagraphFavorite(paragraph.id);
          setFav(true);
        }}
      >
        {fav ? '⭐' : '☆'}
      </button>
      <button
        className="rounded px-1 text-xs hover:bg-accent"
        title={t('addToVocab')}
        onClick={async (e) => {
          e.stopPropagation();
          const words = (paragraph.textEn ?? '')
            .replace(/[^A-Za-z'\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3);
          const word = words[0];
          if (word) {
            await api.addVocabulary({ word, exampleSentence: paragraph.textEn ?? '', sourceCourseId: courseId, sourceParagraphId: paragraph.id });
            setToastGlobal(t('addToVocab') + ': ' + word);
          }
        }}
      >
        🔤
      </button>
      <button
        className="rounded px-1 text-xs hover:bg-accent"
        title={t('copyText')}
        onClick={async (e) => {
          e.stopPropagation();
          await navigator.clipboard.writeText([paragraph.textEn, paragraph.textZh].filter(Boolean).join('\n'));
        }}
      >
        ⧉
      </button>
    </>
  );
}

function setToastGlobal(msg: string) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.className = 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/** 段落时间戳编辑器：手动校准 + 试听（严禁伪造时间：仅显式设置） */
function TimingEditor({
  paragraphs,
  audioId,
  engine,
  onChanged
}: {
  paragraphs: TranscriptParagraphDto[];
  audioId: string;
  engine: AudioEngine;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('paragraphTime')}</h3>
          <span className="text-xs text-muted-foreground">当前 {formatTime(engine.getState().currentTimeMs)}</span>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {paragraphs.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
              <span className="w-6 shrink-0 text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{p.textEn?.slice(0, 50) ?? p.textZh?.slice(0, 24) ?? '—'}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {typeof p.startTimeMs === 'number' ? `${formatTime(p.startTimeMs)}–${formatTime(p.endTimeMs ?? 0)}` : '无时间'}
              </span>
              <Button size="sm" variant="outline" onClick={() => engine.seek(p.startTimeMs ?? 0)}>
                ▶
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await api.updateParagraphTimestamps(p.id, Math.round(engine.getState().currentTimeMs), p.endTimeMs ?? null);
                  onChanged();
                }}
                title={t('setStartTime')}
              >
                起点→
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await api.updateParagraphTimestamps(p.id, p.startTimeMs ?? null, Math.round(engine.getState().currentTimeMs));
                  onChanged();
                }}
                title={t('setEndTime')}
              >
                终点→
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api.updateParagraphTimestamps(p.id, null, null);
                  onChanged();
                }}
                title={t('clearTime')}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** 学习笔记标签：iframe 内嵌 PDF 预览 + 上传/删除。
 *  iOS Safari 的 iframe 只能显示 PDF 第一页，故窄屏（<768px）将「新标签页打开」做成主按钮。 */
function NotesPanel({
  courseId,
  notes,
  docs,
  onChanged
}: {
  courseId: string;
  notes?: string | null;
  docs: NotesDocumentDto[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const doc = docs.find((d) => d.id === selectedId) ?? docs[0];
  const src = assetUrl(doc?.url);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void api
      .uploadDocument(courseId, file, { role: 'notes' })
      .then(() => {
        showToast(`✅ ${file.name}`);
        onChanged();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : t('uploadFailed')));
  };

  const remove = (d: NotesDocumentDto) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    void api
      .deleteDocument(d.id)
      .then(() => {
        setSelectedId(null);
        onChanged();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : t('uploadFailed')));
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
          <CardContent className="p-3 md:p-4">
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
              {/* 窄屏主按钮（iOS Safari iframe 限制）；桌面端为描边按钮 */}
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 md:hidden"
              >
                ↗ {t('openInNewTab')}
              </a>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="hidden h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent md:inline-flex"
              >
                ↗ {t('openInNewTab')}
              </a>
              <a
                href={src ? `${src}?download=1` : undefined}
                download={doc?.originalName}
                className="hidden h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent sm:inline-flex"
              >
                ⬇ {t('download')}
              </a>
              <Button size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                📤 {t('uploadNotes')}
              </Button>
              {doc && (
                <Button size="sm" variant="destructive" onClick={() => remove(doc)}>
                  🗑 {t('delete')}
                </Button>
              )}
              <input
                ref={uploadRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  upload(e.target.files?.[0]);
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
                style={{ height: 'max(600px, calc(100vh - 14rem))' }}
              />
            )}
          </CardContent>
        </Card>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
