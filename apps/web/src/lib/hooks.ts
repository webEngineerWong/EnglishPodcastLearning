'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ApiClient } from '@elp/api-client';

export function useCourses(query: { search?: string; categoryId?: string; favorite?: boolean; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['courses', query],
    queryFn: () => api.listCourses(query)
  });
}

export function useCourse(id: string) {
  return useQuery({ queryKey: ['course', id], queryFn: () => api.getCourse(id), enabled: !!id });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboardStats(), refetchInterval: 60_000 });
}

export function useImportJobs(page = 1) {
  return useQuery({ queryKey: ['importJobs', page], queryFn: () => api.listImportJobs({ page, limit: 20 }) });
}

export function useImportJob(id: string) {
  return useQuery({ queryKey: ['importJob', id], queryFn: () => api.getImportJob(id), enabled: !!id });
}

export function useFavorites(type?: 'COURSE' | 'PARAGRAPH') {
  return useQuery({ queryKey: ['favorites', type ?? 'all'], queryFn: () => api.listFavorites(type ? { type } : undefined) });
}

export function useVocabulary(query?: { status?: string; search?: string }) {
  return useQuery({ queryKey: ['vocabulary', query], queryFn: () => api.listVocabulary(query as Parameters<ApiClient['listVocabulary']>[0]) });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
  };
}

/** 课程收藏切换 */
export function useToggleCourseFavorite(courseId: string, current: boolean) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.setCourseFavorite(courseId, !current),
    onSuccess: () => invalidate(['courses', 'course', 'dashboard', 'favorites'])
  });
}

/** 删除课程 */
export function useDeleteCourse() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteCourse(id),
    onSuccess: () => invalidate(['courses', 'dashboard'])
  });
}

/** 新建课程 */
export function useCreateCourse() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { title: string; description?: string; notes?: string; difficulty?: number; categoryId?: string; tags?: string[] }) =>
      api.createCourse(body),
    onSuccess: () => invalidate(['courses', 'dashboard'])
  });
}

export function useCreateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: () => invalidate(['categories'])
  });
}
