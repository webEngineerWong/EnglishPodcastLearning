/**
 * 共享领域类型 —— Web / Electron / API 三端共用。
 * 仅类型与常量，无任何运行时依赖。
 */

export type ID = string;
export type Locale = 'zh' | 'en';
export type ThemeMode = 'light' | 'dark' | 'system';

// ---------- 播放器 ----------
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];
export type LoopMode = 'off' | 'track' | 'paragraph' | 'ab';

export interface LoopRange {
  /** 循环起点，毫秒 */
  startMs: number;
  /** 循环终点，毫秒； Infinity 表示到音频结尾 */
  endMs: number;
}

// ---------- 枚举 ----------
export type ImportFileKind = 'pdf' | 'txt' | 'srt' | 'mp3' | 'mp4' | 'wav' | 'm4a';
export type ImportJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'REVIEWING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED';
export type ImportFileStatus =
  | 'PENDING'
  | 'PARSING'
  | 'PARSED'
  | 'MATCHED'
  | 'SKIPPED'
  | 'DUPLICATE'
  | 'FAILED';
export type ParagraphType = 'PARAGRAPH' | 'HEADING';
export type ReviewStatus = 'PENDING' | 'EDITED' | 'CONFIRMED';
export type TranscriptStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED';
export type CourseStatus = 'DRAFT' | 'PUBLISHED';
export type VocabularyStatus = 'NEW' | 'LEARNING' | 'MASTERED';
export type FavoriteType = 'COURSE' | 'PARAGRAPH';
export type Difficulty = 1 | 2 | 3 | 4 | 5;

// ---------- 实体 DTO ----------
export interface UserDto {
  id: ID;
  email?: string | null;
  name?: string | null;
  locale: Locale;
  createdAt: string;
}

export interface CategoryDto {
  id: ID;
  name: string;
  color?: string | null;
  sortOrder: number;
  courseCount?: number;
}

export interface AudioAssetDto {
  id: ID;
  courseId: ID;
  originalName: string;
  url?: string;
  durationSec?: number | null;
  sizeBytes: number;
  order: number;
  createdAt: string;
}

export interface DocumentAssetDto {
  id: ID;
  courseId?: ID | null;
  kind: 'pdf' | 'txt' | 'srt';
  originalName: string;
  url?: string;
  sizeBytes: number;
  sha256?: string | null;
  createdAt: string;
}

export interface TranscriptParagraphDto {
  id: ID;
  order: number;
  type: ParagraphType;
  textEn?: string | null;
  textZh?: string | null;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence: number;
  reviewStatus: ReviewStatus;
  favorite?: boolean;
}

export interface TranscriptDto {
  id: ID;
  courseId: ID;
  status: TranscriptStatus;
  paragraphs: TranscriptParagraphDto[];
}

export interface CourseListItem {
  id: ID;
  title: string;
  description?: string | null;
  difficulty: number;
  status: CourseStatus;
  tags: string[];
  categoryId?: ID | null;
  categoryName?: string | null;
  audioCount: number;
  favorite?: boolean;
  lastLearnedAt?: string | null;
  lastPositionMs?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseDetailDto extends CourseListItem {
  notes?: string | null;
  audios: AudioAssetDto[];
  documents: DocumentAssetDto[];
  transcript?: TranscriptDto | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ---------- 学习记录 ----------
export interface ProgressDto {
  id: ID;
  courseId: ID;
  audioAssetId?: ID | null;
  positionMs: number;
  durationMs?: number | null;
  lastLearnedAt: string;
}

export interface HeartbeatPayload {
  courseId: ID;
  audioAssetId?: ID | null;
  /** 当前播放位置，毫秒 */
  positionMs: number;
  /** 距上次心跳经过的学习时长，毫秒 */
  deltaMs: number;
}

export interface LearningSessionDto {
  id: ID;
  courseId: ID;
  courseTitle?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationMs: number;
}

export interface DashboardStatsDto {
  todayMs: number;
  totalMs: number;
  streakDays: number;
  courseCount: number;
  completedCount: number;
  vocabularyCount: number;
  favoriteCourseCount: number;
  continueLearning?: {
    courseId: ID;
    title: string;
    audioAssetId?: ID | null;
    audioName?: string | null;
    positionMs: number;
    lastLearnedAt: string;
  } | null;
  recentCourses: CourseListItem[];
  recentSessions: LearningSessionDto[];
  recentImports: ImportJobDto[];
}

// ---------- 导入 ----------
export interface ImportFileDto {
  id: ID;
  jobId: ID;
  kind: ImportFileKind;
  originalName: string;
  status: ImportFileStatus;
  error?: string | null;
  paragraphCount?: number | null;
  sizeBytes: number;
  createdAt: string;
}

export interface ImportJobDto {
  id: ID;
  name?: string | null;
  status: ImportJobStatus;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  error?: string | null;
  files: ImportFileDto[];
  createdAt: string;
  updatedAt: string;
}

// ---------- 词汇 ----------
export interface VocabularyDto {
  id: ID;
  word: string;
  phonetic?: string | null;
  definitionZh?: string | null;
  definitionEn?: string | null;
  exampleSentence?: string | null;
  status: VocabularyStatus;
  reviewCount: number;
  sourceCourseId?: ID | null;
  sourceCourseTitle?: string | null;
  sourceParagraphId?: ID | null;
  createdAt: string;
}

// ---------- 收藏 ----------
export interface FavoriteDto {
  id: ID;
  type: FavoriteType;
  courseId?: ID | null;
  courseTitle?: string | null;
  paragraphId?: ID | null;
  excerptEn?: string | null;
  excerptZh?: string | null;
  note?: string | null;
  createdAt: string;
}

// ---------- Electron 桥接 ----------
export interface DesktopBridge {
  /** 系统文件选择对话框，返回本地绝对路径列表 */
  selectFiles: (opts?: { extensions?: string[]; multiple?: boolean }) => Promise<string[]>;
  /** 将本地文件导入（复制）到平台存储，返回导入任务 id */
  importLocalFiles: (paths: string[]) => Promise<{ jobId: ID }>;
  /** 读取本地文件（仅限用户显式选择的路径） */
  readLocalFile: (path: string, maxBytes?: number) => Promise<{ name: string; data: ArrayBuffer }>;
  /** API 基地址（桌面端可配置） */
  getApiBaseUrl: () => Promise<string>;
  onTrayCommand: (handler: (cmd: string) => void) => () => void;
  getPlatform: () => Promise<string>;
}

// ---------- 常量 ----------
export const PLAYBACK_RATES_LIST: readonly number[] = PLAYBACK_RATES;
export const DIFFICULTY_LEVELS: readonly Difficulty[] = [1, 2, 3, 4, 5];
export const IMPORT_ACCEPT_EXTENSIONS: Record<ImportFileKind, string[]> = {
  pdf: ['.pdf'],
  txt: ['.txt'],
  srt: ['.srt'],
  mp3: ['.mp3'],
  mp4: ['.mp4'],
  wav: ['.wav'],
  m4a: ['.m4a']
};

/** 由扩展名推断文件类型；无法识别时返回 null */
export function kindFromFilename(name: string): ImportFileKind | null {
  const lower = name.toLowerCase();
  for (const [kind, exts] of Object.entries(IMPORT_ACCEPT_EXTENSIONS)) {
    if (exts.some((e) => lower.endsWith(e))) return kind as ImportFileKind;
  }
  return null;
}
