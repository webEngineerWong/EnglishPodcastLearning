'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select, Spinner, Textarea, useI18n } from '@elp/ui';
import { useCategories, useCourses, useCreateCourse, useDeleteCourse, useToggleCourseFavorite } from '@/lib/hooks';
import { Icon, Tooltip } from '@elp/ui';
import { DifficultyBadge, CourseCover, PageHeader } from '@/components/shell';

export default function CoursesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', difficulty: 3, categoryId: '' });

  const { data, isLoading } = useCourses({ search, categoryId: categoryId || undefined, favorite, page, limit: 20 });
  const { data: categories } = useCategories();
  const createCourse = useCreateCourse();
  const deleteCourse = useDeleteCourse();

  const submit = async () => {
    if (!form.title.trim()) return;
    const created = await createCourse.mutateAsync({
      title: form.title,
      description: form.description || undefined,
      difficulty: form.difficulty,
      categoryId: form.categoryId || undefined
    });
    setShowCreate(false);
    setForm({ title: '', description: '', difficulty: 3, categoryId: '' });
    window.location.href = `/courses/${created.id}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t('courses')}
        subtitle={`${t('total')} ${data?.total ?? 0} ${t('items')}`}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Icon name="plus" size="sm" />
            {t('createCourse')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative max-w-xs flex-1">
          <Icon name="search" size="sm" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-[180px]">
          <option value="">{t('allCategories')}</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.courseCount})
            </option>
          ))}
        </Select>
        <Button variant={favorite ? 'active' : 'outline'} onClick={() => setFavorite(!favorite)}>
          <Icon name="favorites" size="sm" className={favorite ? 'fill-current' : ''} />
          {t('favorites')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={t('empty')} hint="去导入中心上传你的 PDF 对照文本和 MP3" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onDelete={() => {
                if (confirm(t('deleteConfirm'))) void deleteCourse.mutateAsync(c.id);
              }}
            />
          ))}
        </div>
      )}

      {data && data.total > 20 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <Icon name="chevronLeft" size="sm" />
            {t('prevPage')}
          </Button>
          <span className="text-muted-foreground">
            {page} / {Math.ceil(data.total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(page + 1)}>
            {t('nextPage')}
            <Icon name="chevronRight" size="sm" />
          </Button>
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('createCourse')}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={createCourse.isPending}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="课程标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea placeholder={t('description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-3">
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
        </div>
      </Modal>
    </div>
  );
}

function CourseCard({
  course,
  onDelete
}: {
  course: { id: string; title: string; description?: string | null; difficulty: number; tags: string[]; categoryName?: string | null; favorite?: boolean; audioCount: number; lastLearnedAt?: string | null; coverUrl?: string | null };
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const toggle = useToggleCourseFavorite(course.id, Boolean(course.favorite));
  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/courses/${course.id}`} className="block">
        <CourseCover url={course.coverUrl} title={course.title} className="h-32 w-full text-2xl" />
      </Link>
      <CardContent className="p-4 pt-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/courses/${course.id}`} className="min-w-0 flex-1">
            <h3 className="truncate font-medium group-hover:text-primary">{course.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{course.description ?? '—'}</p>
          </Link>
          <Tooltip label={t('favorites')}>
            <button
              className={course.favorite ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary'}
              onClick={() => toggle.mutate()}
              aria-label={t('favorites')}
            >
              <Icon name="favorites" size="md" className={course.favorite ? 'fill-current' : ''} />
            </button>
          </Tooltip>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DifficultyBadge level={course.difficulty} />
          {course.categoryName && <Badge tone="muted">{course.categoryName}</Badge>}
          <Badge tone="muted">
            <Icon name="audio" size={11} className="mr-1" />
            {course.audioCount}
          </Badge>
          {course.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="muted">
              #{tag}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{course.lastLearnedAt ? `上次学习: ${new Date(course.lastLearnedAt).toLocaleDateString()}` : ''}</span>
          <button className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" onClick={onDelete}>
            {t('delete')}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
