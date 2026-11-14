'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Icon, Input, Select, Spinner, useI18n, useToast } from '@elp/ui';
import { api } from '@/lib/api';
import { useInvalidate, useVocabulary } from '@/lib/hooks';
import { PageHeader } from '@/components/shell';

export default function VocabularyPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useVocabulary({ status: status || undefined, search: search || undefined });
  const invalidate = useInvalidate();
  const { show: showToast } = useToast();
  // 正在查词典的单词（防止重复点击）
  const [lookingUp, setLookingUp] = useState<string | null>(null);

  const lookup = async (word: string) => {
    setLookingUp(word);
    try {
      const r = await api.lookupWord(word);
      if (r.source === 'none') showToast(`词典未收录「${word}」`);
      else showToast(r.source === 'cache' ? `${word}：已有词典释义` : `已获取「${word}」释义`, 'success');
      invalidate(['vocabulary']);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLookingUp(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('vocabulary')}
        actions={
          <Button variant="outline" aria-label="刷新" onClick={() => invalidate(['vocabulary'])}>
            <Icon name="refresh" size="sm" />
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <Input placeholder="搜索单词…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[160px]">
          <option value="">{t('reviewStatus')}：全部</option>
          <option value="NEW">{t('newWord')}</option>
          <option value="LEARNING">{t('learning')}</option>
          <option value="MASTERED">{t('mastered')}</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('empty')} hint="在课程详情页点段落的加入生词按钮" />
      ) : (
        <div className="space-y-2">
          {data.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{v.word}</span>
                    {v.phonetic && <span className="text-sm text-muted-foreground">{v.phonetic}</span>}
                    <Badge tone={v.status === 'MASTERED' ? 'success' : v.status === 'LEARNING' ? 'warning' : 'muted'}>
                      {v.status === 'NEW' ? t('newWord') : v.status === 'LEARNING' ? t('learning') : t('mastered')}
                    </Badge>
                  </div>
                  {v.definitionZh && <div className="mt-1 text-sm text-muted-foreground">{v.definitionZh}</div>}
                  {v.exampleSentence && <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{v.exampleSentence}”</div>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {v.sourceCourseTitle && (
                      <>
                        {t('source')}: {v.sourceCourseTitle} ·{' '}
                      </>
                    )}
                    复习 {v.reviewCount} 次
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
