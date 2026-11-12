'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Icon, Spinner, useI18n } from '@elp/ui';
import { api } from '@/lib/api';
import { useFavorites, useInvalidate } from '@/lib/hooks';
import { PageHeader } from '@/components/shell';

export default function FavoritesPage() {
  const { t } = useI18n();
  const [type, setType] = useState<'COURSE' | 'PARAGRAPH' | undefined>(undefined);
  const { data, isLoading } = useFavorites(type);
  const invalidate = useInvalidate();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('favorites')} />

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
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div className="space-y-2">
          {data.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  {f.type === 'COURSE' ? (
                    <Link href={f.courseId ? `/courses/${f.courseId}` : '#'} className="text-sm font-medium hover:text-primary">
                      <Icon name="favorites" size={13} className="mr-1 inline text-primary" />{f.courseTitle ?? '课程'}
                    </Link>
                  ) : (
                    <div className="text-sm">
                      <div className="line-clamp-2">{f.excerptEn}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.excerptZh}</div>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="muted">{f.type === 'COURSE' ? t('courses') : t('favoriteSentence')}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await api.removeFavorite(f.id);
                      invalidate(['favorites', 'courses']);
                    }}
                  >
                    <Icon name="close" size="sm" />
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
