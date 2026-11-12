import type {
  AudioAssetDto,
  CategoryDto,
  CourseDetailDto,
  CourseListItem,
  DashboardStatsDto,
  DocumentAssetDto,
  DocumentRole,
  FavoriteDto,
  FavoriteType,
  HeartbeatPayload,
  ID,
  ImportJobDto,
  LearningSessionDto,
  Paginated,
  ProgressDto,
  TranscriptDto,
  UserDto,
  VocabularyDto,
  VocabularyStatus
} from '@elp/types';

export interface ApiClientOptions {
  baseUrl: string;
  /** 额外请求头（如未来的鉴权 token） */
  getHeaders?: () => Record<string, string> | undefined;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string
  ) {
    super(message ?? `API error ${status}`);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * 统一 API 客户端 —— Web 与 Electron 共用。
 * 所有方法基于 fetch，无框架依赖。
 */
export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  get baseUrl(): string {
    return this.opts.baseUrl;
  }

  private async request<T>(method: string, path: string, init?: RequestInit): Promise<T> {
    // /storage/* 直链不带 /api 前缀，其余业务路径统一挂 /api
    const prefixed = path.startsWith('/storage/') ? path : `/api${path}`;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
      ...(this.opts.getHeaders?.() ?? {})
    };
    const res = await fetch(`${this.opts.baseUrl}${prefixed}`, { method, ...init, headers });
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        try {
          body = await res.text();
        } catch {
          body = null;
        }
      }
      const msg = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : undefined;
      throw new ApiError(res.status, body, msg ?? `API error ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json') ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
  }

  private get<T>(path: string, query?: Query) {
    return this.request<T>('GET', path + buildQuery(query));
  }
  private post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, {
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  private patch<T>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  private del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  // ---------- 用户 ----------
  getMe() {
    return this.get<UserDto>('/users/me');
  }
  updateLocale(locale: string) {
    return this.patch<UserDto>('/users/me', { locale });
  }

  // ---------- 分类 ----------
  listCategories() {
    return this.get<CategoryDto[]>('/categories');
  }
  createCategory(name: string, color?: string) {
    return this.post<CategoryDto>('/categories', { name, color });
  }
  deleteCategory(id: ID) {
    return this.del<void>(`/categories/${id}`);
  }

  // ---------- 课程 ----------
  listCourses(query: {
    search?: string;
    categoryId?: ID;
    favorite?: boolean;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<CourseListItem>>('/courses', query);
  }
  getCourse(id: ID) {
    return this.get<CourseDetailDto>(`/courses/${id}`);
  }
  createCourse(body: {
    title: string;
    description?: string;
    notes?: string;
    difficulty?: number;
    tags?: string[];
    categoryId?: ID;
  }) {
    return this.post<CourseDetailDto>('/courses', body);
  }
  updateCourse(id: ID, body: Partial<Parameters<ApiClient['createCourse']>[0]>) {
    return this.patch<CourseDetailDto>(`/courses/${id}`, body);
  }
  deleteCourse(id: ID) {
    return this.del<void>(`/courses/${id}`);
  }
  /** 设置课程封面（锁屏/灵动岛卡片与移动端展示） */
  uploadCourseCover(id: ID, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request<{ coverKey: string; coverUrl: string }>('POST', `/courses/${id}/cover`, { body: form });
  }
  setCourseFavorite(id: ID, favorite: boolean) {
    return this.request<{ favorite: boolean }>(favorite ? 'POST' : 'DELETE', `/courses/${id}/favorite`);
  }

  // ---------- 资源 URL ----------
  /** 本地存储时返回直链；R2 时返回签名 URL */
  async getAssetUrl(url?: string): Promise<string | undefined> {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    return `${this.opts.baseUrl}${url}`;
  }

  // ---------- 上传 ----------
  uploadAudio(courseId: ID, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request<AudioAssetDto>('POST', `/uploads/audio?courseId=${courseId}`, { body: form });
  }
  /** 上传文档；role = 'notes' 时作为学习笔记 PDF 原样保存（不解析），默认 source */
  uploadDocument(courseId: ID, file: File, opts?: { role?: DocumentRole }) {
    const form = new FormData();
    form.append('file', file);
    if (opts?.role) form.append('role', opts.role);
    return this.request<DocumentAssetDto>('POST', `/uploads/document?courseId=${courseId}`, { body: form });
  }
  /** 删除学习笔记文档（仅允许 role = notes） */
  deleteDocument(id: ID) {
    return this.del<{ deleted: boolean; fileRemoved: boolean }>(`/documents/${id}`);
  }
  /** 直传到导入任务（自动判定类型并启动解析） */
  uploadToImport(files: File[]) {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return this.request<ImportJobDto>('POST', '/import', { body: form });
  }

  // ---------- 字幕 ----------
  getTranscript(courseId: ID) {
    return this.get<TranscriptDto>(`/courses/${courseId}/transcript`);
  }
  /** 保存段落时间戳（手动校准） */
  updateParagraphTimestamps(paragraphId: ID, startTimeMs: number | null, endTimeMs: number | null) {
    return this.updatePublishedParagraph(paragraphId, { startTimeMs, endTimeMs });
  }

  // ---------- 导入任务 ----------
  listImportJobs(query?: { page?: number; limit?: number; status?: string }) {
    return this.get<Paginated<ImportJobDto>>('/import/jobs', query);
  }
  getImportJob(id: ID) {
    return this.get<ImportJobDto>(`/import/jobs/${id}`);
  }
  retryImportFile(jobId: ID, fileId: ID) {
    return this.post<ImportJobDto>(`/import/jobs/${jobId}/files/${fileId}/retry`);
  }
  deleteImportJob(id: ID) {
    return this.del<void>(`/import/jobs/${id}`);
  }
  /** 跨任务聚合：分次上传的资料按集数自动凑组 */
  rescan() {
    return this.post<{ grouped: number; jobs: string[] }>('/import/rescan');
  }
  /** 手动纠正导入文件类型（对照文本 ↔ 学习笔记）；改为 source 时后台自动重新解析 */
  setImportFileRole(fileId: ID, role: DocumentRole) {
    return this.patch<ImportJobDto>(`/import/files/${fileId}/role`, { docRole: role });
  }

  // ---------- 校对（基于 ImportFile 草稿，index 定位） ----------
  getImportFileDraft(fileId: ID) {
    return this.get<{ file: unknown; paragraphs: unknown[]; meta: Record<string, unknown> }>(`/import/files/${fileId}/draft`);
  }
  updateFileParagraph(
    fileId: ID,
    index: number,
    body: {
      textEn?: string | null;
      textZh?: string | null;
      startTimeMs?: number | null;
      endTimeMs?: number | null;
      type?: string;
      reviewStatus?: string;
    }
  ) {
    return this.patch(`/import/files/${fileId}/paragraphs/${index}`, body);
  }
  splitFileParagraph(fileId: ID, index: number, splitAfterIndex: number) {
    return this.post(`/import/files/${fileId}/paragraphs/${index}/split`, { splitAfterIndex });
  }
  mergeFileParagraphs(fileId: ID, indices: number[]) {
    return this.post(`/import/files/${fileId}/paragraphs/merge`, { ids: indices.map(String) });
  }
  reorderFileParagraph(fileId: ID, index: number, direction: 'up' | 'down') {
    return this.post(`/import/files/${fileId}/paragraphs/reorder`, { id: String(index), direction });
  }
  deleteFileParagraph(fileId: ID, index: number) {
    return this.del(`/import/files/${fileId}/paragraphs/${index}`);
  }
  /** 直接编辑正式课程的段落（如时间戳校准） */
  updatePublishedParagraph(paragraphId: ID, body: { startTimeMs?: number | null; endTimeMs?: number | null }) {
    return this.patch(`/import/paragraphs/${paragraphId}`, body);
  }
  publishJob(jobId: ID, body?: { title?: string; categoryId?: ID }) {
    return this.post(`/import/jobs/${jobId}/publish`, body);
  }

  // ---------- 进度 ----------
  heartbeat(payload: HeartbeatPayload) {
    return this.post<ProgressDto>('/progress/heartbeat', payload);
  }
  getProgress(courseId: ID) {
    return this.get<ProgressDto>('/progress', { courseId });
  }
  markCompleted(courseId: ID) {
    return this.post<ProgressDto>('/progress/complete', { courseId });
  }

  // ---------- 统计 ----------
  getDashboardStats() {
    return this.get<DashboardStatsDto>('/stats/dashboard');
  }
  listSessions(query?: { limit?: number }) {
    return this.get<LearningSessionDto[]>('/stats/sessions', query);
  }

  // ---------- 收藏 ----------
  listFavorites(query?: { type?: FavoriteType; limit?: number }) {
    return this.get<FavoriteDto[]>('/favorites', query);
  }
  addCourseFavorite(courseId: ID, note?: string) {
    return this.post<FavoriteDto>('/favorites', { type: 'COURSE', courseId, note });
  }
  addParagraphFavorite(paragraphId: ID, note?: string) {
    return this.post<FavoriteDto>('/favorites', { type: 'PARAGRAPH', paragraphId, note });
  }
  removeFavorite(id: ID) {
    return this.del<void>(`/favorites/${id}`);
  }

  // ---------- 词汇 ----------
  listVocabulary(query?: { status?: VocabularyStatus; search?: string; limit?: number }) {
    return this.get<VocabularyDto[]>('/vocabulary', query);
  }
  addVocabulary(body: {
    word: string;
    phonetic?: string;
    definitionZh?: string;
    definitionEn?: string;
    exampleSentence?: string;
    sourceParagraphId?: ID;
    sourceCourseId?: ID;
  }) {
    return this.post<VocabularyDto>('/vocabulary', body);
  }
  updateVocabulary(id: ID, body: { status?: VocabularyStatus; definitionZh?: string; exampleSentence?: string }) {
    return this.patch<VocabularyDto>(`/vocabulary/${id}`, body);
  }
  removeVocabulary(id: ID) {
    return this.del<void>(`/vocabulary/${id}`);
  }
}
