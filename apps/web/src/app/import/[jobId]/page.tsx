'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Select, Spinner, useI18n } from '@elp/ui';
import type { ImportJobDto, ImportFileDto } from '@elp/types';
import { api } from '@/lib/api';
import { useCategories } from '@/lib/hooks';
import { PageHeader } from '@/components/shell';

interface DraftParagraph {
  order: number;
  type: 'PARAGRAPH' | 'HEADING';
  textEn?: string | null;
  textZh?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence: number;
  warnings?: string[];
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  timestampConfidence?: number | null;
  reviewStatus: string;
}

export default function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [job, setJob] = useState<ImportJobDto | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<DraftParagraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [editEn, setEditEn] = useState('');
  const [editZh, setEditZh] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: categories } = useCategories();

  const loadJob = async () => {
    const j = await api.getImportJob(jobId);
    setJob(j);
    return j;
  };

  const loadDraft = async (fileId: string) => {
    const d = await api.getImportFileDraft(fileId);
    setParagraphs(d.paragraphs as unknown as DraftParagraph[]);
    setSelected(new Set());
    setEditing(null);
  };

  useMemo(() => {
    void (async () => {
      const j = await loadJob();
      const textFile = j.files.find((f) => ['pdf', 'txt'].includes(f.kind));
      if (textFile) {
        setSelectedFileId(textFile.id);
        await loadDraft(textFile.id);
      }
      setLoading(false);
    })();
    // 依赖刻意收窄
  }, [jobId]);

  const refresh = async () => {
    if (selectedFileId) await loadDraft(selectedFileId);
  };

  const op = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!job) return <EmptyState title="任务不存在" />;

  const textFiles = job.files.filter((f) => ['pdf', 'txt'].includes(f.kind));
  const audioFiles = job.files.filter(
    (f) => ['mp3', 'm4a', 'wav', 'mp4'].includes(f.kind) && ['MATCHED', 'SKIPPED'].includes(f.status)
  );

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <PageHeader
        title={`校对: ${job.name ?? job.id}`}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}>{job.status}</Badge>
            {textFiles.length} 个文本文件 · {audioFiles.length} 个音频文件
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => router.push('/import')}>
            ← {t('importJobs')}
          </Button>
        }
      />

      {/* 文件列表 */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="space-y-1.5">
            {job.files.map((f: ImportFileDto) => (
              <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-lg">{fileIcon(f.kind)}</span>
                  <button
                    className={`truncate text-left ${selectedFileId === f.id ? 'font-medium text-primary' : 'hover:underline'}`}
                    onClick={() => {
                      setSelectedFileId(f.id);
                      void loadDraft(f.id);
                    }}
                  >
                    {f.originalName}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {f.paragraphCount != null && <span className="text-xs text-muted-foreground">{f.paragraphCount} 段</span>}
                  <Badge
                    tone={f.status === 'FAILED' ? 'danger' : f.status === 'DUPLICATE' ? 'warning' : f.status === 'MATCHED' ? 'success' : 'muted'}
                    title={f.status === 'SKIPPED' ? '已存储，未找到同集数的文本/字幕' : undefined}
                  >
                    {f.status === 'SKIPPED' ? '待文本' : f.status}
                  </Badge>
                  {f.status === 'FAILED' && (
                    <Button size="sm" variant="outline" onClick={() => op(async () => {
                      const j2 = await api.retryImportFile(jobId, f.id);
                      setJob(j2 as unknown as ImportJobDto);
                    })}>
                      {t('retry')}
                    </Button>
                  )}
                  {f.error && <span className="max-w-[200px] truncate text-xs text-red-500">{f.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 段落校对 */}
      {selectedFileId && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t('review')}</span>
              <span className="text-xs text-muted-foreground">{paragraphs.length} 段</span>
              <div className="flex-1" />
              {selected.size >= 2 && (
                <Button size="sm" onClick={() => op(() => api.mergeFileParagraphs(selectedFileId!, Array.from(selected).sort((a, b) => a - b)))}>
                  合并选中 {selected.size} 段
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={busy}>
                ⟳ 刷新
              </Button>
            </div>

            {paragraphs.length === 0 ? (
              <EmptyState title={t('empty')} />
            ) : (
              <div className="space-y-1">
                {paragraphs.map((p, i) => {
                  const lowConf = p.confidence < 0.5;
                  const isSelected = selected.has(i);
                  return (
                    <div
                      key={i}
                      className={`rounded-md border px-3 py-2 ${lowConf ? 'border-l-4 border-l-amber-400' : ''} ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1.5"
                          checked={isSelected}
                          onChange={(e) => {
                            const s = new Set(selected);
                            if (e.target.checked) s.add(i);
                            else s.delete(i);
                            setSelected(s);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          {editing === i ? (
                            <div className="space-y-2">
                              <textarea
                                className="w-full rounded border border-input bg-transparent p-2 text-sm"
                                value={editEn}
                                onChange={(e) => setEditEn(e.target.value)}
                                placeholder="English"
                              />
                              <textarea
                                className="w-full rounded border border-input bg-transparent p-2 text-sm"
                                value={editZh}
                                onChange={(e) => setEditZh(e.target.value)}
                                placeholder="中文"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    op(async () => {
                                      await api.updateFileParagraph(selectedFileId!, i, { textEn: editEn, textZh: editZh });
                                      setEditing(null);
                                    })
                                  }
                                >
                                  {t('save')}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                                  {t('cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-baseline gap-x-3">
                                <p className="text-sm">{p.textEn ?? <span className="italic text-muted-foreground">（无英文）</span>}</p>
                                <p className="text-sm text-muted-foreground">{p.textZh}</p>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                {p.type === 'HEADING' && <Badge tone="default">标题</Badge>}
                                {typeof p.startTimeMs === 'number' && (
                                  <Badge tone={p.timestampConfidence && p.timestampConfidence < 0.3 ? 'warning' : 'success'}>
                                    ⏱ {Math.floor(p.startTimeMs / 1000)}s
                                  </Badge>
                                )}
                                {lowConf && <Badge tone="warning">置信度 {Math.round(p.confidence * 100)}%</Badge>}
                                {p.warnings?.map((w) => (
                                  <Badge key={w} tone="muted">
                                    {w}
                                  </Badge>
                                ))}
                                {p.pageStart != null && <span>PDF p{p.pageStart}</span>}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          {editing !== i && (
                            <>
                              <IconBtn title={t('edit')} onClick={() => { setEditing(i); setEditEn(p.textEn ?? ''); setEditZh(p.textZh ?? ''); }}>
                                ✎
                              </IconBtn>
                              <IconBtn title={t('split') + '（在第1句后拆分）'} onClick={() => op(() => api.splitFileParagraph(selectedFileId!, i, 0))}>
                                ✂
                              </IconBtn>
                              <IconBtn title={t('moveUp')} onClick={() => op(() => api.reorderFileParagraph(selectedFileId!, i, 'up'))}>
                                ↑
                              </IconBtn>
                              <IconBtn title={t('moveDown')} onClick={() => op(() => api.reorderFileParagraph(selectedFileId!, i, 'down'))}>
                                ↓
                              </IconBtn>
                              <IconBtn title={t('delete')} danger onClick={() => op(() => api.deleteFileParagraph(selectedFileId!, i))}>
                                🗑
                              </IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 发布 */}
      {job.status !== 'COMPLETED' && (textFiles.length > 0 || audioFiles.length > 0) && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {t('publish')}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {textFiles.length > 0
                  ? `（${t('publishHint')}，每个文本文件生成一个课程）`
                  : '（将发布为仅音频课程，文本可稍后在课程页补传）'}
              </span>
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-64">
                <Input placeholder="课程标题（仅单文件时生效）" value={publishTitle} onChange={(e) => setPublishTitle(e.target.value)} />
              </div>
              <div className="w-44">
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('category')}…</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = (await api.publishJob(jobId, {
                      title: publishTitle || undefined,
                      categoryId: categoryId || undefined
                    })) as { courseId?: string; courseIds?: string[] };
                    alert(`已发布 ${r.courseIds?.length ?? 1} 个课程`);
                    router.push(r.courseId ? `/courses/${r.courseId}` : '/courses');
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '发布失败');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ✓ {t('confirm')} & {t('publish')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`rounded px-1.5 py-0.5 text-xs hover:bg-accent ${danger ? 'text-red-500' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function fileIcon(kind: string): string {
  return { pdf: '📕', txt: '📄', srt: '🕒', mp3: '🎧', m4a: '🎧', wav: '🎧', mp4: '🎬' }[kind] ?? '📦';
}
