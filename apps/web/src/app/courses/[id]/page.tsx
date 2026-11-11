'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Select, Spinner, useI18n } from '@elp/ui';
import {
  AudioPlayer,
  formatTime,
  useAudioEngine,
  useKeyboardShortcuts,
  usePlayerState,
  type AudioEngine
} from '@elp/player';
import { BilingualReader, findActiveParagraph, type DisplayMode } from '@elp/ui';
import type { TranscriptParagraphDto } from '@elp/types';
import { api, assetUrl } from '@/lib/api';
import { DifficultyBadge, PageHeader } from '@/components/shell';

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

  // 时间同步：高亮当前段落
  useEffect(() => {
    if (!course?.transcript) return;
    const active = findActiveParagraph(course.transcript.paragraphs, state.currentTimeMs);
    if (active && active.id !== activeParagraphId) setActiveParagraphId(active.id);
    // 依赖刻意收窄
  }, [state.currentTimeMs]);

  const clickParagraph = (p: TranscriptParagraphDto) => {
    if (typeof p.startTimeMs === 'number') {
      engine.seek(p.startTimeMs);
      setActiveParagraphId(p.id);
      if (!state.playing) void engine.play();
    } else {
      setToast(t('noTimestamp'));
      setTimeout(() => setToast(null), 2500);
    }
  };

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

      {/* 工具栏 */}
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

      {/* 双语正文 */}
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
              renderParagraphActions={(p) => <ParagraphActions paragraph={p} courseId={courseId} />}
            />
          )}
        </CardContent>
      </Card>

      {/* 学习笔记 */}
      {course.notes && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t('notes')}</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{course.notes}</p>
          </CardContent>
        </Card>
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
