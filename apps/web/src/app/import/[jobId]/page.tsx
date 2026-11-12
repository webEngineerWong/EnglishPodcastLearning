'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Icon, Input, Select, Spinner, Tooltip, useI18n, useToast, type IconName } from '@elp/ui';
import type { DocumentRole, ImportJobDto, ImportFileDto } from '@elp/types';
import { api, assetUrl } from '@/lib/api';
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
  const [notesPreviewId, setNotesPreviewId] = useState<string | null>(null);
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
  const { show: showToast } = useToast();

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

  /** 点击文件：学习笔记进预览说明；对照文本/字幕进段落草稿 */
  const selectFile = (f: ImportFileDto) => {
    if (f.kind === 'pdf' && f.docRole === 'notes') {
      setNotesPreviewId(f.id);
      setSelectedFileId(null);
      setParagraphs([]);
    } else {
      setNotesPreviewId(null);
      setSelectedFileId(f.id);
      void loadDraft(f.id);
    }
  };

  const changeRole = async (f: ImportFileDto, role: DocumentRole) => {
    setBusy(true);
    try {
      await api.setImportFileRole(f.id, role);
      await loadJob();
      if (role === 'notes') {
        setNotesPreviewId(f.id);
        setSelectedFileId(null);
        setParagraphs([]);
      } else {
        setNotesPreviewId(null);
        if (selectedFileId === f.id) await loadDraft(f.id);
        else setSelectedFileId(f.id), await loadDraft(f.id);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  useMemo(() => {
    void (async () => {
      const j = await loadJob();
      const textFile = j.files.find((f) => ['pdf', 'txt'].includes(f.kind) && f.docRole !== 'notes');
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
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!job) return <EmptyState title="任务不存在" />;

  const textFiles = job.files.filter((f) => ['pdf', 'txt'].includes(f.kind) && f.docRole !== 'notes');
  const notesFiles = job.files.filter((f) => f.kind === 'pdf' && f.docRole === 'notes');
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
            {textFiles.length} {t('textFilesUnit')} · {audioFiles.length} {t('audioFilesUnit')}
            {notesFiles.length > 0 && <> · {notesFiles.length} {t('notesPdfUnit')}</>}
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => router.push('/import')}>
            <Icon name="arrowLeft" size="sm" /> {t('importJobs')}
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
                  <span className="shrink-0"><Icon name={fileIcon(f.kind)} size="nav" /></span>
                  <button
                    className={`truncate text-left ${selectedFileId === f.id || notesPreviewId === f.id ? 'font-medium text-primary' : 'hover:underline'}`}
                    onClick={() => selectFile(f)}
                  >
                    {f.originalName}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {f.kind === 'pdf' && (
                    <>
                      <Badge tone={f.docRole === 'notes' ? 'warning' : 'muted'}>
                        {f.docRole === 'notes' ? (<span className="inline-flex items-center gap-1"><Icon name="pencil" size={11} />{t('notes')}</span>) : t('roleSource')}
                      </Badge>
                      <Select
                        className="h-7 w-28 text-xs"
                        value={f.docRole ?? 'source'}
                        disabled={busy}
                        onChange={(e) => void changeRole(f, e.target.value as DocumentRole)}
                      >
                        <option value="source">{t('roleSource')}</option>
                        <option value="notes">{t('notes')}</option>
                      </Select>
                    </>
                  )}
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
                      <Icon name="refresh" size={12} className="mr-1" />
                      {t('retry')}
                    </Button>
                  )}
                  {f.error && <span className="max-w-[200px] truncate text-xs text-destructive">{f.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 学习笔记预览：不做段落校对，原样保存 */}
      {notesPreviewId && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="warning"><Icon name="pencil" size={11} className="mr-1" />{t('notes')}</Badge>
              <span className="text-sm text-muted-foreground">{t('notesPdfHint')}</span>
            </div>
            <iframe
              title="notes-preview"
              src={`${assetUrl(`/api/import/files/${notesPreviewId}/raw`)}#view=FitH`}
              className="w-full rounded-lg border border-border bg-card"
              style={{ height: 'max(480px, calc(100vh - 22rem))' }}
            />
          </CardContent>
        </Card>
      )}

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
                      className={`rounded-md border px-3 py-2 ${lowConf ? 'border-l-4 border-l-warning' : ''} ${
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
                                    <Icon name="timer" size={11} className="mr-1" />
                                    {Math.floor(p.startTimeMs / 1000)}s
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
                              <Tooltip label={t('edit')}>
                                <IconBtn title={t('edit')} onClick={() => { setEditing(i); setEditEn(p.textEn ?? ''); setEditZh(p.textZh ?? ''); }}>
                                  <Icon name="pencil" size={12} />
                                </IconBtn>
                              </Tooltip>
                              <Tooltip label={t('split')}>
                                <IconBtn title={t('split')} onClick={() => op(() => api.splitFileParagraph(selectedFileId!, i, 0))}>
                                  <Icon name="scissors" size={12} />
                                </IconBtn>
                              </Tooltip>
                              <Tooltip label={t('moveUp')}>
                                <IconBtn title={t('moveUp')} onClick={() => op(() => api.reorderFileParagraph(selectedFileId!, i, 'up'))}>
                                  <Icon name="arrowUp" size={12} />
                                </IconBtn>
                              </Tooltip>
                              <Tooltip label={t('moveDown')}>
                                <IconBtn title={t('moveDown')} onClick={() => op(() => api.reorderFileParagraph(selectedFileId!, i, 'down'))}>
                                  <Icon name="arrowDown" size={12} />
                                </IconBtn>
                              </Tooltip>
                              <Tooltip label={t('delete')}>
                                <IconBtn title={t('delete')} danger onClick={() => op(() => api.deleteFileParagraph(selectedFileId!, i))}>
                                  <Icon name="trash" size={12} />
                                </IconBtn>
                              </Tooltip>
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
      {job.status !== 'COMPLETED' && (textFiles.length > 0 || audioFiles.length > 0 || notesFiles.length > 0) && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {t('publish')}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {textFiles.length > 0
                  ? `（${t('publishHint')}，每个文本文件生成一个课程${notesFiles.length > 0 ? `；${t('publishNotesHint')}` : ''}）`
                  : audioFiles.length > 0
                    ? `（将发布为仅音频课程，文本可稍后在课程页补传${notesFiles.length > 0 ? `；${t('publishNotesHint')}` : ''}）`
                    : `（${t('notesOnlyCannotPublish')}）`}
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
                    showToast(`已发布 ${r.courseIds?.length ?? 1} 个课程`);
                    router.push(r.courseId ? `/courses/${r.courseId}` : '/courses');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : '发布失败', 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="check" size={14} />
                {t('confirm')} & {t('publish')}
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
      className={`rounded px-1.5 py-0.5 text-xs hover:bg-accent ${danger ? 'text-destructive' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const FILE_ICON: Record<string, IconName> = { pdf: 'pdf', txt: 'file', srt: 'srt', mp3: 'audio', m4a: 'audio', wav: 'audio', mp4: 'video' };
function fileIcon(kind: string): IconName {
  return FILE_ICON[kind] ?? 'file';
}
