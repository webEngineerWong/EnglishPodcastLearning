import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Locale, ThemeMode } from '@elp/types';

// ================= Theme =================
interface ThemeCtx {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
}
const ThemeContext = createContext<ThemeCtx>({ mode: 'system', resolved: 'light', setMode: () => undefined });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('elp-theme') as ThemeMode) || 'system';
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const apply = () => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const dark = mode === 'dark' || (mode === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      setResolved(dark ? 'dark' : 'light');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem('elp-theme', m);
    setModeState(m);
  }, []);

  return <ThemeContext.Provider value={useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// ================= i18n =================
const zh = {
  appName: '英语学习平台',
  dashboard: '学习台',
  courses: '课程',
  importCenter: '导入',
  vocabulary: '生词本',
  favorites: '收藏',
  settings: '设置',
  todayMs: '今日学习',
  totalMs: '累计学习',
  streakDays: '连续天数',
  completedCount: '已完成课程',
  vocabularyCount: '生词数',
  continueLearning: '继续上次学习',
  recentCourses: '最近学习',
  recentImports: '最近导入',
  favoriteCourses: '收藏课程',
  minutes: '分钟',
  hours: '小时',
  days: '天',
  searchPlaceholder: '搜索课程…',
  allCategories: '全部分类',
  createCourse: '新建课程',
  editCourse: '编辑课程',
  deleteCourse: '删除课程',
  play: '播放',
  pause: '暂停',
  prev: '上一篇',
  next: '下一篇',
  loopOff: '关闭循环',
  loopTrack: '单篇循环',
  loopParagraph: '单句循环',
  loopAb: 'A-B 循环',
  markA: '设 A 点',
  markB: '设 B 点',
  clearAb: '清除 A-B',
  onlyEn: '仅英文',
  onlyZh: '仅中文',
  bilingual: '双语',
  copyText: '复制',
  addToVocab: '加入生词本',
  favoriteSentence: '收藏句子',
  addNote: '笔记',
  noTimestamp: '本段未设置时间戳',
  uploadFiles: '上传文件',
  importHint: '支持 PDF / TXT / SRT / MP3，可多选',
  importJobs: '导入任务',
  review: '校对',
  publish: '确认发布',
  publishHint: '确认后生成正式课程',
  saveDraft: '保存草稿',
  split: '拆分',
  merge: '合并',
  moveUp: '上移',
  moveDown: '下移',
  delete: '删除',
  retry: '重试',
  status: '状态',
  confidence: '置信度',
  lowConfidence: '低置信度',
  save: '保存',
  cancel: '取消',
  confirm: '确认',
  edit: '编辑',
  word: '单词',
  meaning: '释义',
  example: '例句',
  source: '来源',
  reviewStatus: '复习状态',
  newWord: '生词',
  learning: '学习中',
  mastered: '已掌握',
  empty: '暂无数据',
  loading: '加载中…',
  darkMode: '深色模式',
  language: '语言',
  progressSaved: '进度已保存',
  noAudio: '本课程暂无音频',
  noTranscript: '本课程暂无文本',
  clickToPlay: '点击段落播放对应音频',
  playbackRate: '倍速',
  autoScroll: '自动滚动',
  updatedAt: '更新于',
  total: '共',
  items: '条',
  prevPage: '上一页',
  nextPage: '下一页',
  deleteConfirm: '确认删除？此操作不可恢复。',
  notes: '学习笔记',
  description: '简介',
  difficulty: '难度',
  tags: '标签',
  category: '分类',
  audioFiles: '音频',
  documents: '文档',
  addAudio: '上传音频',
  addDocument: '上传文档',
  paragraphTime: '段落时间',
  setStartTime: '设为起点',
  setEndTime: '设为终点',
  clearTime: '清除时间',
  listenParagraph: '试听本段'
} satisfies Record<string, string>;

type Dict = Record<keyof typeof zh, string>;
const en: Dict = {
  appName: 'English Learning Platform',
  dashboard: 'Dashboard',
  courses: 'Courses',
  importCenter: 'Import',
  vocabulary: 'Vocabulary',
  favorites: 'Favorites',
  settings: 'Settings',
  todayMs: 'Today',
  totalMs: 'Total',
  streakDays: 'Streak',
  completedCount: 'Completed',
  vocabularyCount: 'Words',
  continueLearning: 'Continue Learning',
  recentCourses: 'Recent Courses',
  recentImports: 'Recent Imports',
  favoriteCourses: 'Favorite Courses',
  minutes: 'min',
  hours: 'h',
  days: 'days',
  searchPlaceholder: 'Search courses…',
  allCategories: 'All Categories',
  createCourse: 'New Course',
  editCourse: 'Edit Course',
  deleteCourse: 'Delete Course',
  play: 'Play',
  pause: 'Pause',
  prev: 'Previous',
  next: 'Next',
  loopOff: 'Loop Off',
  loopTrack: 'Repeat Track',
  loopParagraph: 'Loop Paragraph',
  loopAb: 'A-B Loop',
  markA: 'Mark A',
  markB: 'Mark B',
  clearAb: 'Clear A-B',
  onlyEn: 'English',
  onlyZh: 'Chinese',
  bilingual: 'Bilingual',
  copyText: 'Copy',
  addToVocab: 'Add to Vocabulary',
  favoriteSentence: 'Favorite',
  addNote: 'Note',
  noTimestamp: 'No timestamp for this paragraph',
  uploadFiles: 'Upload Files',
  importHint: 'PDF / TXT / SRT / MP3 supported, multi-select allowed',
  importJobs: 'Import Jobs',
  review: 'Review',
  publish: 'Publish',
  publishHint: 'Publishing creates the formal course',
  saveDraft: 'Save Draft',
  split: 'Split',
  merge: 'Merge',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  delete: 'Delete',
  retry: 'Retry',
  status: 'Status',
  confidence: 'Confidence',
  lowConfidence: 'Low confidence',
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',
  edit: 'Edit',
  word: 'Word',
  meaning: 'Meaning',
  example: 'Example',
  source: 'Source',
  reviewStatus: 'Review Status',
  newWord: 'New',
  learning: 'Learning',
  mastered: 'Mastered',
  empty: 'No data yet',
  loading: 'Loading…',
  darkMode: 'Dark Mode',
  language: 'Language',
  progressSaved: 'Progress saved',
  noAudio: 'No audio in this course',
  noTranscript: 'No text in this course',
  clickToPlay: 'Click a paragraph to play its audio',
  playbackRate: 'Speed',
  autoScroll: 'Auto scroll',
  updatedAt: 'Updated',
  total: 'Total',
  items: 'items',
  prevPage: 'Prev',
  nextPage: 'Next',
  deleteConfirm: 'Delete? This cannot be undone.',
  notes: 'Notes',
  description: 'Description',
  difficulty: 'Difficulty',
  tags: 'Tags',
  category: 'Category',
  audioFiles: 'Audio',
  documents: 'Documents',
  addAudio: 'Upload Audio',
  addDocument: 'Upload Document',
  paragraphTime: 'Paragraph timing',
  setStartTime: 'Set start',
  setEndTime: 'Set end',
  clearTime: 'Clear',
  listenParagraph: 'Listen'
};

const dicts: Record<Locale, Dict> = { zh, en };

interface I18nCtx {
  locale: Locale;
  t: (key: keyof Dict) => string;
  setLocale: (l: Locale) => void;
}
const I18nContext = createContext<I18nCtx>({ locale: 'zh', t: (k) => zh[k], setLocale: () => undefined });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'zh';
    return (localStorage.getItem('elp-locale') as Locale) || 'zh';
  });
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem('elp-locale', l);
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
    setLocaleState(l);
  }, []);
  const t = useCallback((key: keyof Dict) => dicts[locale][key] ?? key, [locale]);
  return <I18nContext.Provider value={useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale])}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
