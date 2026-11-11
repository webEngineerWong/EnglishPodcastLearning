'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Spinner, useI18n } from '@elp/ui';
import { api } from '@/lib/api';
import { useImportJobs, useInvalidate } from '@/lib/hooks';
import { PageHeader } from '@/components/shell';
import { kindFromFilename } from '@elp/types';

const ACCEPT = '.pdf,.txt,.srt,.mp3,.m4a,.wav,.mp4';

export default function ImportPage() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useImportJobs(page);
  const invalidate = useInvalidate();

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const job = await api.uploadToImport(list);
      setMessage(`已创建导入任务（${list.length} 个文件），正在解析…`);
      invalidate(['importJobs', 'dashboard']);
      window.location.href = `/import/${job.id}`;
    } catch (e) {
      setMessage(e instanceof Error ? `上传失败: ${e.message}` : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('importCenter')} subtitle={t('importHint')} />

      {/* 上传区 */}
      <div
        className={`mb-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <div className="mb-2 text-3xl">📥</div>
        <div className="text-sm font-medium">{t('uploadFiles')}</div>
        <div className="mt-1 text-xs text-muted-foreground">{t('importHint')}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          支持: PDF 对照文本 + MP3 音频 + SRT 字幕（同名文件自动匹配；SRT 提供真实时间戳）
        </div>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
        <Button className="mt-4" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner className="mr-2" /> : null}
          {uploading ? '上传中…' : '选择文件（可多选）'}
        </Button>
        {message && <div className="mt-3 text-xs text-primary">{message}</div>}
      </div>

      {/* 任务列表 */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('importJobs')}</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const r = (await api.rescan()) as { grouped?: number };
                  alert(`跨任务聚合完成：${r.grouped ?? 0} 个文件已配对`);
                  invalidate(['importJobs', 'dashboard']);
                } catch (e) {
                  alert(e instanceof Error ? e.message : '聚合失败');
                }
              }}
              title="分次上传的 MP3/字幕/文本会按集数自动凑组"
            >
              🔍 重新匹配
            </Button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon="📥" title={t('empty')} />
          ) : (
            <div className="space-y-2">
              {data.items.map((j) => (
                <Link
                  key={j.id}
                  href={`/import/${j.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.name ?? j.id}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(j.createdAt).toLocaleString()} · {j.files.length} 个文件
                      {j.failedFiles > 0 && <span className="text-red-500"> · {j.failedFiles} 失败</span>}
                    </div>
                  </div>
                  <Badge tone={j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'danger' : j.status === 'REVIEWING' ? 'warning' : 'default'}>
                    {j.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          {data && data.total > 20 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ←
              </Button>
              <span className="text-muted-foreground">
                {page} / {Math.ceil(data.total / 20)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(page + 1)}>
                →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
