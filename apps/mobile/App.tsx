/**
 * English Learning Platform — iOS 客户端（Expo Development Build）
 * 与 Web/Electron 共用同一 NestJS API：学习台 / 课程 / 音频播放 / 双语文本 / 生词本 / 收藏 / 学习笔记打开。
 * 音频会话设为 playsInSilentMode（静音键不影响播放）+ 后台播放。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type ScrollViewInstance
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import Slider from '@react-native-community/slider';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadCourse, formatBytes, getOfflineEntry, loadCachedDetail, removeOfflineEntry, type OfflineEntry } from './offline';
import { useLiveActivity } from './useLiveActivity';
import { Icon, type IconName } from './icons';
import { TrendChartRN, type TrendPoint } from './trend-chart';

// 部署者自填地址（不入库）：scripts/.env.device 里配置 ELP_TUNNEL_URL / ELP_LAN_URL，
// scripts/reinstall.sh 打包时自动把下方占位符替换为真实地址、构建完成后再还原。
// 手动开发时可临时改这里，提交前记得改回占位符。
const DEFAULT_API_BASE = 'https://your-tunnel-domain.example';
// 旧版本的局域网默认地址：存储值等于它时视为未配置（见启动迁移逻辑）
const LEGACY_LAN_API_BASE = 'http://192.168.1.100:3001';
const API_BASE_KEY = 'elp-api-base';
const FONT_SIZE_KEY = 'elp-font-size';

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 按标题编号找相邻课程（Episode N → N±1）；direction=1 下一课 / -1 上一课，找不到返回 null */
async function fetchSiblingCourseId(apiBase: string, courseId: string, direction: 1 | -1): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${apiBase}/api/courses`, undefined, 5000);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { id: string; title: string }[] };
    const items = data.items ?? [];
    const numOf = (t: string) => {
      const m = /(\d+)/.exec(t ?? '');
      return m ? parseInt(m[1], 10) : NaN;
    };
    const curNum = numOf(items.find((c) => c.id === courseId)?.title ?? '');
    if (!Number.isFinite(curNum)) return null;
    const target = items
      .filter((c) => c.id !== courseId)
      .map((c) => ({ id: c.id, n: numOf(c.title) }))
      .filter(({ n }) => Number.isFinite(n) && (direction === 1 ? n > curNum : n < curNum))
      .sort((a, b) => (direction === 1 ? a.n - b.n : b.n - a.n))[0];
    return target?.id ?? null;
  } catch {
    return null;
  }
}

// ==================== 类型（与 @elp/types DTO 对齐） ====================

type CourseListItem = {
  id: string;
  title: string;
  difficulty: number;
  audioCount: number;
  playCount?: number;
  lastPositionMs?: number | null;
};

type Paragraph = {
  id: string;
  order: number;
  textEn?: string | null;
  textZh?: string | null;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
};

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

type NotesDocument = { id: string; originalName: string; url: string; sizeBytes: number };

export type CourseDetail = CourseListItem & {
  notes?: string | null;
  notesDocuments?: NotesDocument[];
  coverUrl?: string | null;
  audios: { id: string; originalName: string; url?: string }[];
  transcript?: { paragraphs: Paragraph[] } | null;
};

type SessionRow = { id: string; courseTitle?: string | null; startedAt: string; durationMs: number };

type TimeDist = { listening: number; reading: number; vocab: number; notes: number };
type Insight = { icon: string; title: string; desc: string };

/** 今日时间分配四维度（与 AI 洞察/热力图配色同一套品牌色板） */
const DIST_ROWS: { key: keyof TimeDist; label: string; color: string }[] = [
  { key: 'listening', label: '听力跟读', color: '#7F77DD' },
  { key: 'reading', label: '字幕精读', color: '#1D9E75' },
  { key: 'vocab', label: '生词复习', color: '#EF9F27' },
  { key: 'notes', label: '学习笔记', color: '#D4537E' }
];
const INSIGHT_BGS = ['#EEF1FF', '#FFF4E0', '#E6F6EE'];
const RING_C = 2 * Math.PI * 29; // 进度环周长（r=29，线宽 6，直径 64）

type DashboardStats = {
  todayMs: number;
  totalMs: number;
  streakDays: number;
  courseCount: number;
  completedCount: number;
  vocabularyCount: number;
  recentSessions?: SessionRow[];
  remainingMs?: number;
  continueLearning?: {
    courseId: string;
    title: string;
    audioName?: string | null;
    positionMs: number;
    lastLearnedAt: string;
  } | null;
};

type VocabStatus = 'NEW' | 'LEARNING' | 'MASTERED';

type VocabularyItem = {
  id: string;
  word: string;
  phonetic?: string | null;
  definitionZh?: string | null;
  definitionEn?: string | null;
  exampleSentence?: string | null;
  status: VocabStatus;
  reviewCount: number;
};

type FavoriteItem = {
  id: string;
  type: 'COURSE' | 'PARAGRAPH';
  courseTitle?: string | null;
  excerptEn?: string | null;
  excerptZh?: string | null;
  createdAt: string;
};

// ==================== 主题色板（与 Web globals.css tokens 对齐，跟随系统深色模式） ====================

const PALETTES = {
  light: {
    bg: '#f8fafc',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    sub: '#64748b',
    faint: '#94a3b8',
    primary: '#4f46e5',
    primaryBg: '#eef2ff',
    primaryBorder: '#c7d2fe',
    primaryText: '#312e81',
    onPrimary: '#ffffff',
    danger: '#dc2626',
    mutedBg: '#f1f5f9',
    success: '#059669',
    successBg: '#ecfdf5',
    overlay: 'rgba(15,23,42,0.45)',
    barStyle: 'dark-content' as const
  },
  dark: {
    bg: '#0f1420',
    card: '#171d2b',
    border: '#2a3245',
    text: '#e2e8f0',
    sub: '#94a3b8',
    faint: '#64748b',
    primary: '#818cf8',
    primaryBg: '#232a44',
    primaryBorder: '#3b4470',
    primaryText: '#c7d2fe',
    onPrimary: '#0f1420',
    danger: '#f87171',
    mutedBg: '#1e2537',
    success: '#34d399',
    successBg: '#0d2b22',
    overlay: 'rgba(0,0,0,0.55)',
    barStyle: 'light-content' as const
  }
};

type Palette = Omit<(typeof PALETTES)['light'], 'barStyle'> & { barStyle: 'dark-content' | 'light-content' };

function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? PALETTES.dark : PALETTES.light;
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 展示用音频名：去掉扩展名（Episode 1.mp3 → Episode 1；负一屏/锁屏/播放器标题统一） */
function stripExt(name?: string | null): string | null {
  const s = (name ?? '').trim();
  return s === '' ? null : s.replace(/\.[^.]+$/, '');
}

/** 可见文本：先剥零宽字符（U+200B-200D/BOM）再 trim——SRT 残影 cue 含零宽空格，
 *  trim() 去不掉会通过空段落过滤、渲染成只有时间戳的空卡片 */
function visibleText(s?: string | null): string {
  return (s ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

/** 本地时区日期键 YYYY-MM-DD（学习行为/热力图按本地日归档） */
function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 每日目标文案：30→30 分钟 / 60→1 小时 / 90→1.5 小时 / 120→2 小时 */
function goalLabel(min: number): string {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h === 0) return `${min} 分钟`;
  if (r === 0) return `${h} 小时`;
  if (r === 30) return `${h}.5 小时`;
  return `${h} 小时 ${r} 分`;
}

type DwellActivity = 'listening' | 'reading' | 'vocab' | 'notes';

/** 学习行为停留埋点：每 30s 增量上报当前界面的停留秒数（切界/卸载时冲正当次余量） */
function useActivityDwell(activity: DwellActivity | null, apiBase: string) {
  const accRef = useRef(0);
  const activityRef = useRef<DwellActivity | null>(activity);
  activityRef.current = activity;
  useEffect(() => {
    if (!apiBase) return;
    const post = (act: DwellActivity, sec: number) => {
      void fetch(`${apiBase}/api/learning/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity: act, seconds: sec, date: localDayKey() })
      }).catch(() => undefined);
    };
    const iv = setInterval(() => {
      const act = activityRef.current;
      if (!act) {
        accRef.current = 0;
        return;
      }
      accRef.current += 30;
      const s = accRef.current;
      accRef.current = 0;
      if (s > 0) post(act, s);
    }, 30000);
    return () => {
      clearInterval(iv);
      const act = activityRef.current;
      const s = accRef.current;
      accRef.current = 0;
      if (act && s > 0) post(act, s);
    };
  }, [apiBase]);
}

/** 段落循环的结束兜底：下一段的开始时间（毫秒）；没有则返回 NaN 表示不循环 */
function findNextStart(paragraphs: Paragraph[], order: number): number {
  for (const p of paragraphs) {
    if (p.order > order && typeof p.startTimeMs === 'number') return p.startTimeMs;
  }
  return NaN;
}

/** 当前播放段落：取最后一个 startTimeMs <= t 的段（与 Web 端 findActiveParagraph 语义一致） */
function findActiveParagraph(paragraphs: Paragraph[], tSec: number): string | null {
  let active: string | null = null;
  for (const p of paragraphs) {
    if (typeof p.startTimeMs === 'number' && p.startTimeMs / 1000 <= tSec + 0.25) active = p.id;
    else break;
  }
  return active;
}

function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
}

type TabKey = 'dashboard' | 'courses' | 'vocabulary' | 'favorites';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: '学习台', icon: 'dashboard' },
  { key: 'courses', label: '课程', icon: 'library' },
  { key: 'vocabulary', label: '生词本', icon: 'vocabulary' },
  { key: 'favorites', label: '收藏', icon: 'favorites' }
];

function MainApp() {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<TabKey>('courses');
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  // openCourseId 的实时镜像：供异步回调读取最新值（修复 widget 深链与自动恢复的竞态）
  const openCourseIdRef = useRef<string | null>(null);
  openCourseIdRef.current = openCourseId;
  // 冷启动自动恢复只尝试一次：退出课程回到列表后不再被拽回（无论首次是否成功）
  const autoResumeTriedRef = useRef(false);
  const [resumeMs, setResumeMs] = useState<number | undefined>(undefined);
  // 自动连播进入的课程自动起播；手动打开（列表/继续学习）一律置 false
  const [autoStart, setAutoStart] = useState(false);
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  useEffect(() => {
    // 静音键下仍可播放（学习类 App 标准行为）+ 锁屏/后台继续播放
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => undefined);
    // 迁移：历史版本保存过的局域网默认地址视为未配置，改用公网默认（用户手动改回局域网不受影响——
    // 仅当存储值恰好等于旧默认局域网地址时清除）
    AsyncStorage.getItem(API_BASE_KEY).then((v) => {
      if (v === LEGACY_LAN_API_BASE) {
        void AsyncStorage.removeItem(API_BASE_KEY);
        setApiBase(DEFAULT_API_BASE);
      } else {
        setApiBase(v || DEFAULT_API_BASE);
      }
    });
  }, []);

  // 灵动岛/冷启动恢复：有近期学习记录（<6 小时且播放位置有效）时直接回到该课程并续播位置。
  // 竞态防护：widget 深链与冷启动恢复同时抢 openCourseId——
  // 1) openCourseId 进依赖：深链先到即取消本次 effect；
  // 2) fetch 返回后重查 openCourseIdRef：深链在 fetch 期间到达时不覆盖；
  // 3) autoResumeTriedRef：每启动只恢复一次，用户退出课程回列表后不再被拽回。
  useEffect(() => {
    if (!apiBase || openCourseId || autoResumeTriedRef.current) return;
    autoResumeTriedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWithTimeout(`${apiBase}/api/stats/dashboard`, undefined, 3000);
        if (!res.ok) return;
        const s = (await res.json()) as DashboardStats;
        const c = s.continueLearning;
        if (!cancelled && !openCourseIdRef.current && c && c.positionMs > 3000 && Date.now() - new Date(c.lastLearnedAt).getTime() < 6 * 3_600_000) {
          setAutoStart(false);
          setResumeMs(c.positionMs);
          setOpenCourseId(c.courseId);
        }
      } catch {
        /* 离线时留在列表 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, openCourseId]);

  const saveApiBase = useCallback((next: string) => {
    const trimmed = next.trim().replace(/\/+$/, '');
    if (trimmed === DEFAULT_API_BASE) {
      // 输入与默认一致时按「未配置」处理，后续改默认地址无需再动手机
      void AsyncStorage.removeItem(API_BASE_KEY);
    } else {
      void AsyncStorage.setItem(API_BASE_KEY, trimmed);
    }
    setApiBase(trimmed || DEFAULT_API_BASE);
    setShowSettings(false);
    setOpenCourseId(null);
  }, []);

  // 播完自动连播：直接进入下一课并自动起播（resumeMs=0 → 下一课从 0 开始）
  const onAutoAdvance = useCallback((nextId: string) => {
    setAutoStart(true);
    setResumeMs(0);
    setOpenCourseId(nextId);
  }, []);

  // 小组件深链：elp://resume?courseId=xx&resumeMs=yy —— 直达课程续播位置并自动起播
  const handleDeepLink = useCallback((raw: string | null | undefined) => {
    if (!raw || !raw.startsWith('elp://')) return;
    const q = raw.split('?')[1] ?? '';
    const pick = (k: string) => new RegExp(`(?:^|&)${k}=([^&]*)`).exec(q)?.[1];
    const courseId = pick('courseId');
    const resumeMs = Number(pick('resumeMs'));
    if (!courseId) return;
    setAutoStart(true);
    setResumeMs(Number.isFinite(resumeMs) && resumeMs > 3000 ? resumeMs : undefined);
    setOpenCourseId(decodeURIComponent(courseId));
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    return () => sub.remove();
  }, [handleDeepLink]);

  if (!apiBase) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={pal.primary} />
      </View>
    );
  }

  const onOpenCourse = (id: string) => {
    setTab('courses');
    setAutoStart(false);
    setResumeMs(undefined);
    setOpenCourseId(id);
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle={pal.barStyle} />
      {openCourseId ? (
        <CourseScreen
          key={openCourseId}
          apiBase={apiBase}
          courseId={openCourseId}
          resumeMs={resumeMs}
          autoStart={autoStart}
          onBack={() => {
            setAutoStart(false);
            // 一次性恢复参数随退出清空：防止深链/上一课残留的 resumeMs 被下次打开的课程当作自己的进度
            setResumeMs(undefined);
            setOpenCourseId(null);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onAutoAdvance={onAutoAdvance}
        />
      ) : (
        <View style={s.screen}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{TABS.find((t) => t.key === tab)?.label ?? '英语学习'}</Text>
            <Pressable onPress={() => setShowSettings(true)} hitSlop={8} style={s.iconRow}>
              <Icon name="settings" size={16} color={pal.primary} />
              <Text style={s.settingsBtn}>设置</Text>
            </Pressable>
          </View>
          <View style={s.tabContent}>
            {tab === 'dashboard' && <DashboardScreen apiBase={apiBase} onOpenCourse={onOpenCourse} />}
            {tab === 'courses' && <CourseListScreen apiBase={apiBase} onOpen={(c) => { setAutoStart(false); setResumeMs(undefined); setOpenCourseId(c.id); }} />}
            {tab === 'vocabulary' && <VocabularyScreen apiBase={apiBase} />}
            {tab === 'favorites' && <FavoritesScreen apiBase={apiBase} />}
          </View>
          {/* 底部导航（对齐 Web/Electron 菜单） */}
          <View style={s.tabBar}>
            {TABS.map((t) => (
              <Pressable key={t.key} style={s.tabItem} onPress={() => setTab(t.key)}>
                <Icon name={t.icon} size="nav" color={tab === t.key ? pal.primary : pal.faint} />
                <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {showSettings && <SettingsModal apiBase={apiBase} onSave={saveApiBase} onClose={() => setShowSettings(false)} />}
    </View>
  );
}

export default function App() {
  return (
    <RootErrorBoundary>
      <MainApp />
    </RootErrorBoundary>
  );
}

// ==================== 学习台 ====================

function DashboardScreen({ apiBase, onOpenCourse }: { apiBase: string; onOpenCourse: (id: string) => void }) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 学习趋势：近 7/14/30 天切换（与 Web/Desktop 学习台一致）
  const [days, setDays] = useState(14);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  // 每日目标（分钟，本地持久化；点进度环可改）
  const [goalMin, setGoalMin] = useState(120);
  const [goalToast, setGoalToast] = useState<string | null>(null);
  const prevPctRef = useRef<number | null>(null);
  const [heatSel, setHeatSel] = useState<number | null>(null);
  const [timeDist, setTimeDist] = useState<TimeDist | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    AsyncStorage.getItem('elp-daily-goal')
      .then((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 10) setGoalMin(Math.min(720, Math.round(n)));
      })
      .catch(() => undefined);
  }, []);

  const setGoal = useCallback((min: number) => {
    const clamped = Math.min(720, Math.max(10, Math.round(min)));
    setGoalMin(clamped);
    AsyncStorage.setItem('elp-daily-goal', String(clamped)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/stats/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats((await res.json()) as DashboardStats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setRefreshing(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  // 趋势数据：切范围即重拉
  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout(`${apiBase}/api/stats/trend?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (!cancelled && t) setTrend(t as TrendPoint[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBase, days]);

  // 今日时间分配（行为停留聚合）
  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout(`${apiBase}/api/learning/time-distribution?date=${localDayKey()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setTimeDist(d as TimeDist);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // 本周（周一 ~ 周日）七格数据
  const weekPoints = useMemo(() => {
    const byDate = new Map((trend ?? []).map((p) => [p.date, p] as const));
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const out: TrendPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = localDayKey(d);
      out.push({ date: key, ms: byDate.get(key)?.ms ?? 0 });
    }
    return out;
  }, [trend]);

  const todayMin = useMemo(() => Math.round((stats?.todayMs ?? 0) / 60000), [stats]);
  const pct = useMemo(() => (goalMin > 0 ? Math.min(100, Math.round((todayMin / goalMin) * 100)) : 0), [todayMin, goalMin]);

  // 达标瞬间：环变绿 + 顶部 Toast 2s（prev 跨次加载比较；首次挂载不触发）
  useEffect(() => {
    const prev = prevPctRef.current;
    prevPctRef.current = pct;
    if (prev !== null && prev < 100 && pct >= 100) {
      setGoalToast('今日目标完成 🎉');
      const t = setTimeout(() => setGoalToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [pct]);

  // AI 学习洞察（失败/超时 → null，模块整体隐藏）
  const sessionsAvgMin = useMemo(() => {
    const rows = stats?.recentSessions ?? [];
    if (rows.length === 0) return null;
    return Math.max(1, Math.round((rows.reduce((s0, r) => s0 + (r.durationMs ?? 0), 0) / rows.length) / 60000));
  }, [stats]);

  useEffect(() => {
    if (!stats) return;
    let cancelled = false;
    setInsightsLoading(true);
    fetchWithTimeout(
      `${apiBase}/api/learning/insights`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          today_minutes: Math.round((stats.todayMs ?? 0) / 60000),
          avg_minutes: sessionsAvgMin ?? 0,
          vocab_count: stats.vocabularyCount ?? 0,
          streak_days: stats.streakDays ?? 0,
          replay_rate: 0,
          completion_rate: stats.courseCount ? Math.round(((stats.completedCount ?? 0) / stats.courseCount) * 100) : 0
        })
      },
      20000
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setInsights((d as { insights?: Insight[] } | null)?.insights ?? null);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stats, apiBase, sessionsAvgMin]);

  // Skeleton 呼吸动画
  useEffect(() => {
    if (!insightsLoading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(skeletonOpacity, { toValue: 0.4, duration: 650, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [insightsLoading, skeletonOpacity]);

  // Hooks 规则：所有 hook 必须在下方提前 return（error/loading 分支）之前调用
  const scheme = useColorScheme();

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>无法连接 API（{error}）</Text>
        <Text style={s.hintText}>{apiBase}</Text>
      </View>
    );
  }
  if (!stats) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={pal.primary} />
      </View>
    );
  }

  const cells: [string, string][] = [
    ['今日学习', formatMinutes(stats.todayMs)],
    ['累计学习', formatMinutes(stats.totalMs)],
    ['连续天数', `${stats.streakDays} 天`],
    ['课程数', String(stats.courseCount)],
    ['已完成', String(stats.completedCount)],
    ['生词数', String(stats.vocabularyCount)]
  ];

  // 本周达标统计：周一算起已过天数（含今天）中达标的天数
  const weekElapsed = ((new Date().getDay() + 6) % 7) + 1;
  const weekMet = weekPoints.slice(0, weekElapsed).filter((p) => Math.round(p.ms / 60000) >= goalMin).length;
  const yesterdayMin = Math.round(((trend ?? []).find((p) => p.date === localDayKey(new Date(Date.now() - 86400000)))?.ms ?? 0) / 60000);
  const yesterdayMet = trend != null && yesterdayMin >= goalMin;

  // 每日目标：ActionSheet 选档 / Alert.prompt 自定义（iOS 专属，正合本 App 平台）
  const showGoalSheet = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['30 分钟', '1 小时', '1.5 小时', '2 小时', '自定义输入', '取消'],
        cancelButtonIndex: 5,
        userInterfaceStyle: scheme === 'dark' ? 'dark' : 'light'
      },
      (idx) => {
        if (idx === 0) setGoal(30);
        else if (idx === 1) setGoal(60);
        else if (idx === 2) setGoal(90);
        else if (idx === 3) setGoal(120);
        else if (idx === 4) {
          Alert.prompt(
            '自定义每日目标',
            '输入分钟数（10 - 720）',
            [
              { text: '取消', style: 'cancel' },
              {
                text: '保存',
                onPress: (text?: string) => {
                  const n = Number(text);
                  if (Number.isFinite(n) && n >= 10) setGoal(n);
                  else setGoalToast('请输入 10-720 之间的分钟数');
                }
              }
            ],
            'plain-text',
            String(goalMin)
          );
        }
      }
    );
  };

  // 效率指标四格（重听率需段落级播放统计，v1 先占位）
  const completionRate = stats.courseCount > 0 ? Math.round(((stats.completedCount ?? 0) / stats.courseCount) * 100) : 0;
  const avgFocusMin = sessionsAvgMin;
  const etaDays = stats.remainingMs != null && stats.remainingMs > 0 ? Math.ceil(stats.remainingMs / (goalMin * 60000)) : null;
  const metricCells = [
    { label: '平均专注时长', value: avgFocusMin != null ? `${avgFocusMin} 分钟` : '—', sub: '单次不间断', red: false },
    { label: '课程完成率', value: `${completionRate} %`, sub: `共 ${Math.max(0, stats.courseCount - (stats.completedCount ?? 0))} 课未完成`, red: completionRate === 0 },
    { label: '重听率', value: '—', sub: '段落重听统计即将上线', red: false },
    { label: '预估完课时间', value: etaDays != null ? `${etaDays} 天` : '—', sub: `按每日 ${goalLabel(goalMin)} 目标`, red: false }
  ];


  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
      {stats.continueLearning && (
        <Pressable style={[s.card, s.continueCard]} onPress={() => onOpenCourse(stats.continueLearning!.courseId)}>
          <View style={s.iconRow}>
            <Icon name="play" size={13} color={pal.primary} />
            <Text style={s.continueLabel}>继续上次学习</Text>
          </View>
          <Text style={s.cardTitle} numberOfLines={1}>
            {stats.continueLearning.title}
          </Text>
          <Text style={s.cardMeta}>
            {stripExt(stats.continueLearning.audioName) ?? ''} · 上次 {formatTime(stats.continueLearning.positionMs)}
          </Text>
        </Pressable>
      )}
      <View style={s.grid}>
        {cells.map(([label, value]) => (
          <View key={label} style={s.gridCell}>
            <Text style={s.gridLabel}>{label}</Text>
            <Text style={s.gridValue}>{value}</Text>
          </View>
        ))}
      </View>
      {/* 学习趋势（与 Web/Desktop 学习台一致）：近 7/14/30 天逐日时长 */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={s.iconRow}>
            <Icon name="trendingUp" size={14} color={pal.primary} />
            <Text style={s.cardTitle}>学习趋势</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([7, 14, 30] as const).map((d) => (
              <Pressable key={d} style={[s.smallBtn, days === d && s.smallBtnActive]} onPress={() => setDays(d)}>
                <Text style={[s.smallBtnText, days === d && s.smallBtnTextActive]}>近{d}天</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {trend ? (
          <TrendChartRN points={trend} primary={pal.primary} label={pal.faint} grid={pal.border} />
        ) : (
          <Text style={s.hintText}>加载中…</Text>
        )}
      </View>

      {/* ── 今日目标（进度环；点环改目标） ── */}
      <Text style={{ fontSize: 12, color: pal.faint }}>今日目标</Text>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={showGoalSheet} hitSlop={6} style={{ width: 64, height: 64 }}>
            <View style={{ width: 64, height: 64 }}>
              <Svg width={64} height={64}>
                <Circle cx={32} cy={32} r={29} stroke="#2C2C2A" strokeWidth={6} fill="none" />
                <Circle
                  cx={32}
                  cy={32}
                  r={29}
                  stroke={pct >= 100 ? '#1D9E75' : '#7F77DD'}
                  strokeWidth={6}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C} ${RING_C}`}
                  strokeDashoffset={RING_C * (1 - pct / 100)}
                  rotation={-90}
                  originX={32}
                  originY={32}
                />
              </Svg>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: pal.text }}>{pct}%</Text>
              </View>
            </View>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.iconRow}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: pal.text }}>今日目标 {goalLabel(goalMin)}</Text>
              <View style={{ borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(29,158,117,0.18)' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#1D9E75' }}>{pct >= 100 ? '已完成' : '进行中'}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: pal.sub }}>
              {pct >= 100
                ? '已达成本日目标，明天继续保持'
                : `已完成 ${formatMinutes(stats.todayMs)}，还差 ${Math.max(0, goalMin - todayMin)} 分钟达标`}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: pal.faint }}>
              {yesterdayMet ? '🎯 昨日达标 · ' : ''}🔥 连续 {stats.streakDays ?? 0} 天 · 📅 本周 {weekMet}/{weekElapsed} 天达标
            </Text>
          </View>
        </View>
      </View>

      {/* ── 本周每日学习时长热力图（点方块展开当日学习记录） ── */}
      <Text style={{ fontSize: 12, color: pal.faint }}>本周每日学习时长</Text>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {weekPoints.map((p, i) => {
            const min = Math.round(p.ms / 60000);
            const isToday = p.date === localDayKey();
            return (
              <Pressable key={p.date} style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={() => setHeatSel(heatSel === i ? null : i)}>
                <Text style={{ fontSize: 10, color: pal.faint }}>{['一', '二', '三', '四', '五', '六', '日'][i]}</Text>
                <View
                  style={{
                    height: 32,
                    borderRadius: 5,
                    backgroundColor: min <= 0 ? '#2C2C2A' : min <= 30 ? '#3C3489' : min <= 60 ? '#534AB7' : '#7F77DD',
                    width: '100%',
                    borderWidth: isToday ? 1.5 : 0,
                    borderColor: '#AFA9EC'
                  }}
                />
                <Text style={{ fontSize: 10, color: isToday ? pal.primary : pal.faint }}>{min}m</Text>
              </Pressable>
            );
          })}
        </View>
        {heatSel !== null && weekPoints[heatSel] && (
          <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.border, gap: 6 }}>
            {(stats.recentSessions ?? []).filter((r) => localDayKey(new Date(r.startedAt)) === weekPoints[heatSel!].date).length === 0 ? (
              <Text style={s.hintText}>当天暂无学习记录</Text>
            ) : (
              (stats.recentSessions ?? [])
                .filter((r) => localDayKey(new Date(r.startedAt)) === weekPoints[heatSel!].date)
                .map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: pal.text }}>
                      {r.courseTitle ?? '课程'}
                    </Text>
                    <Text style={{ fontSize: 12, color: pal.sub }}>{formatMinutes(r.durationMs)}</Text>
                  </View>
                ))
            )}
          </View>
        )}
      </View>

      {/* ── 今日时间分配（四维度条形图；生词占比偏低时提示） ── */}
      <Text style={{ fontSize: 12, color: pal.faint }}>学习行为分析</Text>
      <View style={s.card}>
        <View style={s.iconRow}>
          <Icon name="timer" size={13} color={pal.text} />
          <Text style={s.cardTitle}>今日时间分配</Text>
        </View>
        <View style={{ gap: 10, marginTop: 10 }}>
          {DIST_ROWS.map((row) => {
            const total = timeDist ? timeDist.listening + timeDist.reading + timeDist.vocab + timeDist.notes : 0;
            const sec = timeDist ? timeDist[row.key] : 0;
            const p = total > 0 ? Math.round((sec / total) * 100) : 0;
            return (
              <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 70, fontSize: 12, color: pal.sub }}>{row.label}</Text>
                <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: pal.mutedBg }}>
                  <View style={{ width: `${p}%`, height: 7, borderRadius: 4, backgroundColor: row.color }} />
                </View>
                <Text style={{ width: 32, fontSize: 11, color: pal.faint, textAlign: 'right' }}>{p}%</Text>
              </View>
            );
          })}
        </View>
        {timeDist &&
          (() => {
            const total = timeDist.listening + timeDist.reading + timeDist.vocab + timeDist.notes;
            const vocabPct = total > 0 ? (timeDist.vocab / total) * 100 : 100;
            if (vocabPct >= 10 || total === 0) return null;
            return (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.border }}>
                <Text style={{ fontSize: 12, color: pal.sub }}>建议每次学习后安排 10 分钟复习生词</Text>
              </View>
            );
          })()}
      </View>

      {/* ── 效率指标 2×2 ── */}
      <Text style={{ fontSize: 12, color: pal.faint }}>效率指标</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {metricCells.map((m) => (
          <View key={m.label} style={[s.card, { flexGrow: 1, flexBasis: '47%', padding: 12 }]}>
            <Text style={{ fontSize: 11, color: pal.faint }}>{m.label}</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: m.red ? '#E24B4A' : pal.text, marginTop: 2 }}>{m.value}</Text>
            <Text style={{ fontSize: 11, color: pal.faint, marginTop: 2 }}>{m.sub}</Text>
          </View>
        ))}
      </View>

      {/* ── AI 学习洞察（加载中 Skeleton；接口失败/超时整体隐藏） ── */}
      {insightsLoading ? (
        <>
          <Text style={{ fontSize: 12, color: pal.faint }}>学习洞察</Text>
          <View style={s.card}>
            {[0, 1, 2].map((i) => (
              <Animated.View key={i} style={{ height: 42, borderRadius: 8, backgroundColor: pal.mutedBg, marginBottom: 8, opacity: skeletonOpacity }} />
            ))}
          </View>
        </>
      ) : insights && insights.length > 0 ? (
        <>
          <Text style={{ fontSize: 12, color: pal.faint }}>学习洞察</Text>
          <View style={s.card}>
            {insights.map((it, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 8,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: pal.border
                }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: INSIGHT_BGS[i % 3], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15 }}>{it.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: pal.text }}>
                    {it.title}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 12, color: pal.sub, marginTop: 1 }}>
                    {it.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {goalToast && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            alignSelf: 'center',
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor: pal.text,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4
          }}
        >
          <Text style={{ color: pal.bg, fontSize: 13, fontWeight: '600' }}>{goalToast}</Text>
        </View>
      )}
      </ScrollView>
    </View>
  );
}

// ==================== 课程列表 ====================

function CourseListScreen({ apiBase, onOpen }: { apiBase: string; onOpen: (c: CourseListItem) => void }) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/courses?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: CourseListItem[] };
      setCourses(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={pal.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>无法连接 API</Text>
        <Text style={s.hintText}>{error}</Text>
        <Pressable style={s.retryBtn} onPress={() => void load()}>
          <Text style={s.retryText}>重试</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <FlatList
      data={courses}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.hintText}>暂无课程，先在电脑端导入</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={s.card} onPress={() => onOpen(item)}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={s.iconRow}>
            <Icon name="audio" size={12} color={pal.sub} />
            <Text style={s.cardMeta}>
              {item.playCount != null ? `${item.playCount} 次` : `${item.audioCount} 音频`} · L{item.difficulty}
              {item.lastPositionMs ? ` · 上次 ${formatTime(item.lastPositionMs)}` : ''}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

// ==================== 课程详情 ====================

const FONT_SIZES = [
  { label: '小', en: 13, zh: 12 },
  { label: '中', en: 15, zh: 14 },
  { label: '大', en: 18, zh: 16 }
];

function CourseScreen({
  apiBase,
  courseId,
  resumeMs,
  autoStart,
  onBack,
  onOpenSettings,
  onAutoAdvance
}: {
  apiBase: string;
  courseId: string;
  resumeMs?: number;
  /** 播完自动连播进入本课时是否自动起播（自动连播置 true；手动打开保持 false） */
  autoStart?: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  /** 当前音频播完时回调（连播下一课） */
  onAutoAdvance?: (nextCourseId: string) => void;
}) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const liveActivity = useLiveActivity();
  const seekedOnceRef = useRef(false);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = status.currentTime ?? 0;
  const listRef = useRef<ScrollViewInstance | null>(null);
  /** 每段实测 y（onLayout 收集，字体/语言切换会 relayout 自动更新）——跟随滚动的精确坐标 */
  const paragraphYRef = useRef(new Map<string, number>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [followAudio, setFollowAudio] = useState(true);
  const [fontIdx, setFontIdx] = useState(1); // 0小 1中 2大
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [rateIdx, setRateIdx] = useState(1); // PLAYBACK_RATES 下标，默认 1x
  // seek 计数：每次拖动/跳转后 +1，触发心跳 effect 立即广播新位置（负一屏与锁屏同步）
  const [seekTick, setSeekTick] = useState(0);
  const [loopParagraph, setLoopParagraph] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // 详情页内容 Tab：实时字幕 / 学习笔记（对齐 Web 端三标签交互）
  const [subTab, setSubTab] = useState<'captions' | 'notes'>('captions');
  // 字幕语言显示模式：双语 / 仅英文 / 仅中文（对齐 Web 端）
  const [langMode, setLangMode] = useState<'both' | 'en' | 'zh'>('both');
  // 多份学习笔记时的当前选中（null = 取第一份）
  const [notesDocId, setNotesDocId] = useState<string | null>(null);
  // 固定区实测内容高度：ScrollView 会被 Yoga 撑到 maxHeight 上限（55%），导致内容下方出现死区空白，
  // 显式设为内容实际高度（仍受 maxHeight 封顶，超出时内部滚动）让字幕区用满剩余空间
  const [fixedZoneH, setFixedZoneH] = useState<number | null>(null);
  // 离线下载：offlineReady 后才决定音频来源（本地 file:// 或远程 URL），避免先载远程再切换
  const [offline, setOffline] = useState<OfflineEntry | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false); // 断网时用缓存详情阅读
  const [dlProgress, setDlProgress] = useState<number | null>(null); // 进度 0~1；null=未在下载
  const toast = useCallback((msg: string, ok = false) => {
    setToastMsg((ok ? '✅ ' : '') + msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY).then((v) => {
      const idx = Number(v);
      if (Number.isInteger(idx) && idx >= 0 && idx < FONT_SIZES.length) setFontIdx(idx);
    });
  }, []);

  // 查询本课程是否已离线（清单 + 音频文件校验）
  useEffect(() => {
    let cancelled = false;
    getOfflineEntry(courseId)
      .then((e) => {
        if (!cancelled) {
          setOffline(e);
          setOfflineReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setOfflineReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const changeFont = useCallback((delta: number) => {
    setFontIdx((prev) => {
      const next = Math.min(FONT_SIZES.length - 1, Math.max(0, prev + delta));
      void AsyncStorage.setItem(FONT_SIZE_KEY, String(next));
      return next;
    });
  }, []);

  // 音频来源：已离线优先本地沙盒文件（断网可播），否则远程签名 URL
  const remoteAudioUrl = detail?.audios?.[0]?.url
    ? detail.audios[0].url!.startsWith('http')
      ? detail.audios[0].url!
      : apiBase + detail.audios[0].url!
    : null;
  const audioUrl = offline?.audioUri ?? remoteAudioUrl;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOfflineMode(false);
    fetchWithTimeout(`${apiBase}/api/courses/${courseId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CourseDetail>;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(async (e) => {
        // 断网回退：已下载课程读沙盒缓存的详情（双语文本离线可读）
        const cached = await loadCachedDetail(courseId);
        if (!cancelled && cached) {
          setDetail(cached);
          setOfflineMode(true);
        } else if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, courseId]);

  // 载入音频并恢复位置（灵动岛/冷启动/小组件深链：resumeMs 优先；连播传 0 即从头播放）
  useEffect(() => {
    if (offlineReady && audioUrl && detail && !seekedOnceRef.current) {
      seekedOnceRef.current = true;
      player.replace({ uri: audioUrl });
      const resume = resumeMs ?? detail.lastPositionMs ?? 0;
      if (resume > 5000) void player.seekTo(resume / 1000);
      void player.setPlaybackRate(PLAYBACK_RATES[rateIdx]);
      // 锁屏 / 灵动岛 / 控制中心：标题、所属课程、封面与进度控制
      const bundledIcon = Image.resolveAssetSource(require('./assets/default-cover.png'));
      // coverUrl 可能为相对路径（如 /storage/file/covers/...），需拼接 API 地址；无封面时回退默认方图封面
      const cover = detail.coverUrl;
      const coverAbs = cover ? (cover.startsWith('http') ? cover : apiBase + cover) : undefined;
      const artworkUrl: string | undefined = coverAbs ?? bundledIcon?.uri ?? undefined;
      player.setActiveForLockScreen(
        true,
        {
          title: stripExt(detail.audios[0]?.originalName) ?? detail.title,
          artist: detail.title,
          albumTitle: '英语学习',
          artworkUrl
        },
        // 原生锁屏三键：⏮ 上一课 / ⏸ / ⏭ 下一课（expo-audio patch 转发命令；与 15s 快进互斥）
        { showNextTrack: true, showPreviousTrack: true }
      );
      // 自动连播：进入即起播（手动打开仍保持「点播放才响」）
      if (autoStart) void player.play();
    }
  }, [offlineReady, audioUrl, detail, player, resumeMs, autoStart]);

  // ===== 锁屏（原生 NowPlaying 卡片，与 Spotify 同一机制）+ 负一屏小组件状态同步 =====
  // 不启用 ActivityKit Live Activity：锁屏只保留系统原生播放卡片（MPNowPlayingInfoCenter），
  // 字幕显示在该卡片的 artist/album 两行（下方 effect 每段更新）；expo-audio patched 后
  // 原生卡片的 ⏮⏭ 按钮转发 "elp.playback.command" → LiveActivityModule → 本页切课。
  // 负一屏小组件：播放/暂停状态变化时 reloadWidget 让 WidgetKit 立即重拉。
  // 播放/暂停状态变化：负一屏小组件 reload（显示实时 ▶/⏸ + 当前播放）
  useEffect(() => {
    if (!seekedOnceRef.current) return;
    liveActivity.reloadWidget();
  }, [status.playing, liveActivity]); // 仅依赖 playing 翻转

  // 小组件/锁屏卡片的播放按钮命令（AppIntent 主 App 进程转发）→ 控制播放器
  useEffect(
    () =>
      liveActivity.onPlaybackCommand((cmd) => {
        if (cmd === 'toggle') {
          if (status.playing) player.pause();
          else void player.play();
          return;
        }
        // 上一课 / 下一课：按标题编号切换（切课后 onAutoAdvance 自动起播）
        const dir = cmd === 'next' ? 1 : cmd === 'prev' ? -1 : null;
        if (dir === null || !onAutoAdvance) return;
        void (async () => {
          const target = await fetchSiblingCourseId(apiBase, courseId, dir);
          if (target) onAutoAdvance(target);
        })();
      }),
    [liveActivity, player, status.playing, apiBase, courseId, onAutoAdvance]
  );

  // 切课/退出播放页：结束 Live Activity 后也让负一屏小组件立即回到暂停态
  useEffect(() => {
    return () => liveActivity.reloadWidget();
  }, [liveActivity]);

  // 当前字幕 ref（负一屏小组件心跳上报用）与封面绝对地址（心跳/封面染色用）
  const coverAbsUrl = detail?.coverUrl ? (detail.coverUrl.startsWith('http') ? detail.coverUrl : apiBase + detail.coverUrl) : null;
  const activeSubtitleRef = useRef<string | null>(null);

  // 锁屏原生「正在播放」卡片跟随显示当前字幕：段落切换时更新 artist（英文）与 album（中文）两行
  // （expo-audio 原生实现合并元数据并保留播放进度，可安全重复调用）
  useEffect(() => {
    if (!detail || !activeId || !seekedOnceRef.current) return;
    const p = (detail.transcript?.paragraphs ?? []).find((x) => x.id === activeId);
    if (!p) return;
    const en = p.textEn?.replace(/\s+/g, ' ').trim();
    const zh = p.textZh?.replace(/\s+/g, ' ').trim();
    // 双语：artist=英文、album=中文；仅英文/仅中文时另一行回落为课程名（单行展示，系统自动省略号截断）
    let artistLine: string;
    let albumLine: string;
    if (langMode === 'zh') {
      artistLine = zh || en || detail.title;
      albumLine = detail.title;
    } else if (langMode === 'en') {
      artistLine = en || zh || detail.title;
      albumLine = detail.title;
    } else {
      artistLine = en || detail.title;
      albumLine = zh || detail.title;
    }
    activeSubtitleRef.current = [en, zh].filter(Boolean).join(' / ').slice(0, 90) || null;
    const bundledIcon = Image.resolveAssetSource(require('./assets/default-cover.png'));
    const cover = detail.coverUrl;
    const coverAbs = cover ? (cover.startsWith('http') ? cover : apiBase + cover) : undefined;
    player.setActiveForLockScreen(
      true,
      {
        title: stripExt(detail.audios[0]?.originalName) ?? detail.title,
        artist: artistLine,
        albumTitle: albumLine,
        artworkUrl: coverAbs ?? bundledIcon?.uri
      },
      // showNext/PreviousTrack：锁屏显示 ⏮⏭（expo-audio patch 转发切课命令），
      // 与 15s 快进快退互斥（Spotify 同款三键布局）
      { showNextTrack: true, showPreviousTrack: true }
    );
  }, [activeId, detail, langMode, player, apiBase]);

  // 播完自动连播：当前音频自然播完 → 打开编号的下一课（如 Episode 1 → 2）并从头起播。
  // 课程列表按标题数字排序；无可解析数字或已是最后一课时停止。单句循环开启时不触发。
  const advancedRef = useRef(false);
  useEffect(() => {
    if (!status.didJustFinish || advancedRef.current || !onAutoAdvance || loopParagraph) return;
    advancedRef.current = true;
    void (async () => {
      const next = await fetchSiblingCourseId(apiBase, courseId, 1);
      if (next) onAutoAdvance(next);
    })();
  }, [status.didJustFinish, apiBase, courseId, onAutoAdvance, loopParagraph]);

  // ===== 自动缓存预加载（锁屏/连播不断流）：=====
  // 1) 进课即静默缓存当前课（不显示下载 UI；手动下载按钮期间跳过）
  // 2) 剩余 <90s 时后台静默预载下一课音频，连播时已是本地文件
  const silentDlRef = useRef(false);
  useEffect(() => {
    if (!offlineReady || offline || !detail?.audios?.[0]?.url || !remoteAudioUrl) return;
    if (silentDlRef.current || dlProgress !== null) return;
    silentDlRef.current = true;
    downloadCourse(apiBase, detail)
      .then((entry) => {
        setOffline(entry);
        setOfflineReady(true);
      })
      .catch(() => undefined) // 静默缓存失败不打扰用户，可稍后手动下载
      .finally(() => {
        silentDlRef.current = false;
      });
  }, [offlineReady, offline, detail, remoteAudioUrl, apiBase, dlProgress]);

  const prefetchRef = useRef(false);
  useEffect(() => {
    const dur = status.duration ?? 0;
    const cur = status.currentTime ?? 0;
    if (!status.playing || dur <= 0 || dur - cur > 90 || prefetchRef.current) return;
    prefetchRef.current = true;
    void (async () => {
      try {
        const nextId = await fetchSiblingCourseId(apiBase, courseId, 1);
        if (!nextId) return;
        const cached = await getOfflineEntry(nextId);
        if (cached) return;
        const res = await fetchWithTimeout(`${apiBase}/api/courses/${nextId}`);
        if (!res.ok) return;
        const nextDetail = (await res.json()) as CourseDetail;
        if (!nextDetail.audios?.[0]?.url) return;
        await downloadCourse(apiBase, nextDetail);
      } catch {
        /* 预载失败静默忽略：连播时按原逻辑网络播放 */
      }
    })();
  }, [status.currentTime, status.duration, status.playing, apiBase, courseId]);

  // 状态/进度广播（负一屏小组件唯一状态源）：播放中每 2s 上报位置与播放状态；
  // 状态转换（开始播放/暂停/seek/倍速变化）立即上报并刷新负一屏 timeline，不等节拍；
  // 间隔上报只纠数据不刷 timeline（省 WidgetKit reload 预算，插值由 timeline 预生成 entry 完成）
  const audioAssetId = detail?.audios?.[0]?.id;
  useEffect(() => {
    if (!audioAssetId) return;
    const postHeartbeat = (playing: boolean) =>
      fetch(`${apiBase}/api/progress/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          audioAssetId,
          positionMs: Math.round(currentTimeRef.current * 1000),
          deltaMs: 2000,
          isPlaying: playing,
          rate: PLAYBACK_RATES[rateIdx],
          durationMs: Math.round((status.duration ?? 0) * 1000),
          courseTitle: detail?.title,
          audioName: stripExt(detail?.audios?.[0]?.originalName),
          coverUrl: coverAbsUrl,
          subtitle: activeSubtitleRef.current
        })
      }).catch(() => undefined);
    if (!status.playing) {
      postHeartbeat(false).finally(() => liveActivity.reloadWidget());
      return;
    }
    // 状态转换立即广播（不等首个间隔）：点播放后负一屏 ≤1s 内同步
    postHeartbeat(true).finally(() => liveActivity.reloadWidget());
    const iv = setInterval(() => void postHeartbeat(true), 2000);
    return () => clearInterval(iv);
    // seekTick：seek 后立即广播一次新位置
  }, [status.playing, audioAssetId, apiBase, courseId, detail, activeSubtitleRef, coverAbsUrl, rateIdx, status.duration, seekTick]);

  // 行为停留埋点：播放中=听力跟读；暂停阅读字幕=字幕精读；学习笔记页=笔记
  useActivityDwell(subTab === 'notes' ? 'notes' : status.playing ? 'listening' : 'reading', apiBase);

  const seekTo = useCallback(
    (ms?: number | null) => {
      if (typeof ms !== 'number') return;
      advancedRef.current = false; // 主动回跳重听后，再次播到结尾仍可触发自动连播
      void player.seekTo(ms / 1000);
      void player.play();
      setSeekTick((t) => t + 1); // seek 后立即广播新位置（心跳 + 负一屏刷新）
    },
    [player]
  );

  const changeRate = useCallback(() => {
    setRateIdx((prev) => {
      const next = (prev + 1) % PLAYBACK_RATES.length;
      void player.setPlaybackRate(PLAYBACK_RATES[next]);
      return next;
    });
  }, [player]);

  // 离线下载：音频 + 双语文本入沙盒；完成后切本地播放
  const startDownload = useCallback(() => {
    if (!detail || dlProgress !== null) return;
    if (silentDlRef.current) {
      toast('正在自动缓存中，请稍候');
      return;
    }
    setDlProgress(0);
    downloadCourse(apiBase, detail, (p) => setDlProgress(p.ratio))
      .then((entry) => {
        setOffline(entry);
        setOfflineReady(true);
        toast('已下载，可离线学习', true);
      })
      .catch((e) => toast(e instanceof Error && e.message === 'NO_AUDIO' ? '本课程无可下载音频' : '下载失败，请检查网络'))
      .finally(() => setDlProgress(null));
  }, [apiBase, detail, dlProgress, toast]);

  const confirmRemove = useCallback(() => {
    Alert.alert('删除离线内容', '将删除已下载的音频与双语文本，删除后需联网播放。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void removeOfflineEntry(courseId)
            .then(() => {
              setOffline(null);
              toast('已删除离线内容');
            })
            .catch(() => toast('删除失败'));
        }
      }
    ]);
  }, [courseId, toast]);

  const copyParagraph = useCallback((p: Paragraph) => {
    const text = [p.textEn, p.textZh].filter(Boolean).join('\n');
    if (!text) return;
    void Clipboard.setStringAsync(text);
    toast('已复制');
  }, []);

  const favParagraph = useCallback(
    (p: Paragraph) => {
      void fetch(`${apiBase}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PARAGRAPH', paragraphId: p.id })
      })
        .then((r) => toast(r.ok ? '已收藏' : '收藏失败', r.ok))
        .catch(() => toast('收藏失败'));
    },
    [apiBase]
  );

  const addVocab = useCallback(
    (p: Paragraph) => {
      const words = (p.textEn ?? '')
        .replace(/[^A-Za-z'\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const word = words[0];
      if (!word) return;
      void fetch(`${apiBase}/api/vocabulary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, exampleSentence: p.textEn ?? '', sourceCourseId: courseId, sourceParagraphId: p.id })
      })
        .then((r) => toast(r.ok ? '生词 +' + word : '加入生词失败', r.ok))
        .catch(() => toast('加入生词失败'));
    },
    [apiBase, courseId]
  );

  const openNotesDoc = useCallback(
    (doc: NotesDocument) => {
      const url = doc.url.startsWith('http') ? doc.url : apiBase + doc.url;
      void Linking.openURL(url);
    },
    [apiBase]
  );

  const paragraphs = detail?.transcript?.paragraphs ?? [];

  // 展示用段落列表：过滤 textEn/textZh 均为空白的段落（SRT 源含空 cue / 10ms 残影条目，
  // 导入后成为空段落，渲染成只有时间戳的空白卡片）。播放同步（高亮/循环）仍用完整列表，
  // 仅 FlatList data 与跟随滚动索引用过滤后的列表（索引必须与 data 一致）。
  const displayParagraphs = useMemo(
    () => paragraphs.filter((p) => visibleText(p.textEn) !== '' || visibleText(p.textZh) !== ''),
    [paragraphs]
  );

  // 当前段落高亮（id 变化才 setState，避免每 tick 重渲）
  useEffect(() => {
    if (paragraphs.length === 0 || !status.playing) return;
    const id = findActiveParagraph(paragraphs, status.currentTime ?? 0);
    if (id && id !== activeIdRef.current) {
      activeIdRef.current = id;
      setActiveId(id);
    }
  }, [status.currentTime, status.playing, paragraphs]);

  // FlatList 首次内容测量完成前禁止 scrollToIndex：续播场景下 player 一加载就触发跟随，
  // 而 58+ 个双语段落尚未完成布局，估算偏移会在列表顶部留下大片空白（截图红框根因）
  const [listMeasured, setListMeasured] = useState(false);

  // 单句循环：高亮段有完整时间戳时，越过末尾回跳段首
  useEffect(() => {
    if (!loopParagraph || !status.playing || !activeId) return;
    const p = paragraphs.find((x) => x.id === activeId);
    if (!p || typeof p.startTimeMs !== 'number') return;
    const startSec = p.startTimeMs / 1000;
    const endSec = (p.endTimeMs ?? findNextStart(paragraphs, p.order)) / 1000;
    if (!Number.isFinite(endSec) || endSec <= startSec) return;
    const t = status.currentTime ?? 0;
    if (t > endSec + 0.15) void player.seekTo(startSec);
  }, [status.currentTime, status.playing, status, loopParagraph, activeId, paragraphs, player]);

  // 自动跟随：高亮段滚动到双语滚动区上部。
  // 用 ScrollView 全量渲染 + onLayout 实测每段 y 直接 scrollTo —— 精确命中，
  // 彻底避免 FlatList scrollToIndex 的估算粗滚偏移（段高差异大 → 顶部大片空白占位）
  useEffect(() => {
    if (!followAudio || !activeId || !listMeasured) return;
    const y = paragraphYRef.current.get(activeId);
    if (y != null) {
      listRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }
  }, [activeId, followAudio, listMeasured]);

  const font = FONT_SIZES[fontIdx];

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={8} style={s.iconRow}>
          <Icon name="arrowLeft" size={16} color={pal.primary} />
          <Text style={s.backBtn}>课程</Text>
        </Pressable>
        <Pressable onPress={onOpenSettings} hitSlop={8}>
          <Icon name="settings" size="md" color={pal.primary} />
        </Pressable>
      </View>
      {error ? (
        <View style={s.center}>
          <Text style={s.errorText}>加载失败</Text>
          <Text style={s.hintText}>{error}</Text>
        </View>
      ) : !detail ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={pal.primary} />
        </View>
      ) : (
        <>
          {/* ===== 固定区：标题 / 播放器（进度条） / 笔记 / 备注（不随字幕滚动） ===== */}
          <ScrollView
            style={[s.fixedZone, fixedZoneH != null ? { height: fixedZoneH } : null]}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {/* 内容包一层实测高度回写 ScrollView：iOS 上 contentContainer 会被拉伸到 ScrollView
                frame 高，直接量 contentContainer 会在瞬态偏大值上自锁（死区空白）。内层 View
                无 flexGrow，量到的是自然内容高度，闭环稳定。padding/gap 随之移入本层。 */}
            <View
              onLayout={(e) => setFixedZoneH(e.nativeEvent.layout.height)}
              style={{ padding: 16, paddingBottom: 6, gap: 10 }}
            >
            <Text style={s.detailTitle}>{detail.title}</Text>

            {audioUrl ? (
              <View style={s.playerCard}>
                <View style={s.iconRow}>
                  <Icon name="audio" size={14} color={pal.primaryText} />
                  <Text numberOfLines={1} style={s.playerTitle}>
                    {stripExt(detail.audios[0].originalName) ?? detail.title}
                  </Text>
                </View>
                {/* 音轨进度条（可拖动） */}
                <Slider
                  style={{ width: '100%', height: 24 }}
                  minimumValue={0}
                  maximumValue={Math.max(1, status.duration ?? 0)}
                  value={scrubSec ?? status.currentTime ?? 0}
                  onValueChange={(v) => setScrubSec(v)}
                  onSlidingComplete={(v) => {
                    advancedRef.current = false; // 手动拖动后，再次播到结尾仍可触发自动连播
                    void player.seekTo(v);
                    setScrubSec(null);
                    setSeekTick((t) => t + 1); // 拖动完成立即广播新位置
                  }}
                  minimumTrackTintColor="#4f46e5"
                  maximumTrackTintColor="#c7d2fe"
                  thumbTintColor="#4f46e5"
                />
                <View style={s.playerRow}>
                  <Pressable style={[s.playBtn, s.iconRow]} onPress={() => (status.playing ? player.pause() : void player.play())}>
                    <Icon name={status.playing ? 'pause' : 'play'} size={15} color={pal.onPrimary} />
                    <Text style={s.playBtnText}>{status.playing ? '暂停' : '播放'}</Text>
                  </Pressable>
                  <Text style={s.timeText}>
                    {formatTime((scrubSec ?? status.currentTime ?? 0) * 1000)} / {formatTime((status.duration ?? 0) * 1000)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => void player.seekTo(Math.max(0, (status.currentTime ?? 0) - 15))} style={s.iconRow}>
                    <Icon name="rewind" size={14} color={pal.primary} />
                    <Text style={s.timeText}>15s</Text>
                  </Pressable>
                </View>
                <View style={s.playerRow}>
                  <Pressable style={s.smallBtn} onPress={() => changeFont(-1)}>
                    <Text style={s.smallBtnText}>A−</Text>
                  </Pressable>
                  <Text style={s.timeText}>{font.label}</Text>
                  <Pressable style={s.smallBtn} onPress={() => changeFont(1)}>
                    <Text style={s.smallBtnText}>A+</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable style={[s.smallBtn, s.iconRow, followAudio && s.smallBtnActive]} onPress={() => setFollowAudio(!followAudio)}>
                    <Icon name="arrowDown" size={12} color={followAudio ? pal.onPrimary : pal.primary} />
                    <Text style={[s.smallBtnText, followAudio && s.smallBtnTextActive]}>跟随</Text>
                  </Pressable>
                </View>
                {/* 离线下载：未下载 → 下载中（带进度）→ 已离线（点按删除） */}
                <View style={s.playerRow}>
                  <Pressable
                    style={[s.smallBtn, s.iconRow, offline && s.smallBtnActive]}
                    onPress={offline ? confirmRemove : startDownload}
                    disabled={dlProgress !== null}
                  >
                    <Icon
                      name={dlProgress !== null ? 'loading' : offline ? 'checkCircle' : 'arrowDown'}
                      size={12}
                      color={offline ? pal.onPrimary : pal.primary}
                    />
                    <Text style={[s.smallBtnText, offline && s.smallBtnTextActive]} numberOfLines={1}>
                      {dlProgress !== null
                        ? `下载中 ${Math.round(dlProgress * 100)}%`
                        : offline
                          ? `已离线 ${formatBytes(offline.sizeBytes)} · 点按删除`
                          : '下载离线'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={s.hintText}>本课程暂无音频</Text>
            )}

            {detail.notes ? (
              <View style={s.card}>
                <Text style={s.sectionTitle}>备注</Text>
                <Text style={s.notesText}>{detail.notes}</Text>
              </View>
            ) : null}

            {/* ===== 内容 Tab：实时字幕 / 学习笔记（对齐 Web 端三标签） ===== */}
            <View style={s.subTabBar}>
              <Pressable style={[s.subTab, subTab === 'captions' && s.subTabActive]} onPress={() => setSubTab('captions')}>
                <Text style={[s.subTabText, subTab === 'captions' && s.subTabTextActive]}>实时字幕</Text>
              </Pressable>
              <Pressable style={[s.subTab, subTab === 'notes' && s.subTabActive]} onPress={() => setSubTab('notes')}>
                <Text style={[s.subTabText, subTab === 'notes' && s.subTabTextActive]}>学习笔记</Text>
              </Pressable>
            </View>
            {subTab === 'captions' && (
              <View style={s.langRow}>
                <Text style={s.hintText}>点击段落播放对应音频</Text>
                <View style={s.langBtns}>
                  {([['both', '双语'], ['en', '仅英文'], ['zh', '仅中文']] as const).map(([m, label]) => (
                    <Pressable key={m} style={[s.smallBtn, langMode === m && s.smallBtnActive]} onPress={() => setLangMode(m)}>
                      <Text style={[s.smallBtnText, langMode === m && s.smallBtnTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            </View>
          </ScrollView>

          {/* ===== 内容区：实时字幕（独立滚动） / 学习笔记（PDF 内嵌预览） ===== */}
          {subTab === 'captions' ? (
          <ScrollView
            ref={listRef}
            style={s.subtitleZone}
            onContentSizeChange={() => setListMeasured(true)}
            // 用户手动滑动 = 主动浏览，暂停自动跟随（点「跟随」按钮恢复）
            onScrollBeginDrag={() => setFollowAudio(false)}
            contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 24, gap: 10 }}
          >
            {displayParagraphs.length === 0 ? (
              <Text style={s.hintText}>本课程暂无文本</Text>
            ) : (
              displayParagraphs.map((p) => (
                <View key={p.id} onLayout={(e) => paragraphYRef.current.set(p.id, e.nativeEvent.layout.y)}>
                  <ParagraphRow
                    paragraph={p}
                    active={p.id === activeId}
                    fontEn={font.en}
                    fontZh={font.zh}
                    lang={langMode}
                    onPress={() => seekTo(p.startTimeMs)}
                    onCopy={() => copyParagraph(p)}
                    onFav={() => favParagraph(p)}
                    onVocab={() => addVocab(p)}
                  />
                </View>
              ))
            )}
          </ScrollView>
          ) : (
            <NotesPane
              docs={detail.notesDocuments ?? []}
              activeDocId={notesDocId}
              onSelect={setNotesDocId}
              onOpenExternal={openNotesDoc}
              apiBase={apiBase}
            />
          )}
        </>
      )}
    </View>
  );
}

/** 双语段落行（memo：避免每次进度 tick 全列表重渲） */
const ParagraphRow = React.memo(function ParagraphRow({
  paragraph: p,
  active,
  fontEn,
  fontZh,
  lang,
  onPress,
  onCopy,
  onFav,
  onVocab
}: {
  paragraph: Paragraph;
  active: boolean;
  fontEn: number;
  fontZh: number;
  lang: 'both' | 'en' | 'zh';
  onPress: () => void;
  onCopy: () => void;
  onFav: () => void;
  onVocab: () => void;
}) {
    const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  return (
    <Pressable style={[s.paragraph, active && s.paragraphActive]} onPress={onPress}>
      <View style={stylesPara.row}>
        <View style={stylesPara.body}>
          {p.textEn && lang !== 'zh' ? <Text style={[s.textEn, { fontSize: fontEn }, active && s.textEnActive]}>{p.textEn}</Text> : null}
          {p.textZh && lang !== 'en' ? <Text style={[s.textZh, { fontSize: fontZh }]}>{p.textZh}</Text> : null}
          <View style={[s.iconRow, { gap: 3 }]}>
            <Icon name="timer" size={11} color={pal.faint} />
            <Text style={s.timestamp}>{typeof p.startTimeMs === 'number' ? formatTime(p.startTimeMs) : '无时间戳'}</Text>
          </View>
        </View>
        <View style={stylesPara.actions}>
          <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation(); onCopy(); }}>
            <Icon name="copy" size={14} color={pal.faint} />
          </Pressable>
          <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation(); onFav(); }}>
            <Icon name="star" size={14} color={pal.faint} />
          </Pressable>
          <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation(); onVocab(); }}>
            <Icon name="bookPlus" size={14} color={pal.faint} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

const stylesPara = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  body: { flex: 1, gap: 4 },
  actions: { alignItems: 'flex-end', gap: 12, paddingTop: 2 }
});

/** 学习笔记面板：PDF 内嵌预览（WKWebView 原生渲染，多文档可切换，Safari 打开兜底） */
function NotesPane({
  docs,
  activeDocId,
  onSelect,
  onOpenExternal,
  apiBase
}: {
  docs: NotesDocument[];
  activeDocId: string | null;
  onSelect: (id: string) => void;
  onOpenExternal: (doc: NotesDocument) => void;
  apiBase: string;
}): React.ReactElement {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  if (docs.length === 0) {
    return (
      <View style={[s.subtitleZone, s.center]}>
        <Text style={s.hintText}>本课程暂无学习笔记 PDF</Text>
      </View>
    );
  }

  const doc = docs.find((d) => d.id === activeDocId) ?? docs[0];
  const pdfUrl = doc.url.startsWith('http') ? doc.url : apiBase + doc.url;

  return (
    <View style={s.subtitleZone}>
      {/* 顶部：多文档切换 + Safari 打开 */}
      <View style={s.notesBar}>
        {docs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {docs.map((d) => (
              <Pressable
                key={d.id}
                style={[s.smallBtn, s.iconRow, d.id === doc.id && s.smallBtnActive]}
                onPress={() => onSelect(d.id)}
              >
                <Icon name="pdf" size={12} color={d.id === doc.id ? pal.onPrimary : pal.primary} />
                <Text style={[s.smallBtnText, d.id === doc.id && s.smallBtnTextActive]} numberOfLines={1}>
                  {d.originalName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={s.iconRow}>
            <Icon name="pdf" size={12} color={pal.text} />
            <Text style={s.docName} numberOfLines={1}>{doc.originalName}</Text>
          </View>
        )}
        <Pressable hitSlop={6} onPress={() => onOpenExternal(doc)} style={s.iconRow}>
          <Text style={s.openLink}>Safari 打开</Text>
          <Icon name="arrowRight" size={12} color={pal.primary} />
        </Pressable>
      </View>
      {/* PDF 预览：customUserAgent 规避 ngrok 免费版浏览器拦截页 */}
      <WebView
        source={{ uri: pdfUrl }}
        style={{ flex: 1, backgroundColor: pal.card }}
        customUserAgent="EnglishPodcastMobile/1.0"
        originWhitelist={['*']}
        startInLoadingState
        allowsInlineMediaPlayback
      />
    </View>
  );
}

// ==================== 生词本 ====================

const STATUS_LABEL: Record<VocabStatus, string> = { NEW: '生词', LEARNING: '学习中', MASTERED: '已掌握' };
const NEXT_STATUS: Record<VocabStatus, VocabStatus> = { NEW: 'LEARNING', LEARNING: 'MASTERED', MASTERED: 'NEW' };

function VocabularyScreen({ apiBase }: { apiBase: string }) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);
  useActivityDwell('vocab', apiBase);

  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/vocabulary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((await res.json()) as VocabularyItem[]);
    } catch {
      /* 列表静默失败保留旧数据 */
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const cycleStatus = useCallback(
    async (v: VocabularyItem) => {
      const next = NEXT_STATUS[v.status];
      setItems((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: next } : x)));
      await fetch(`${apiBase}/api/vocabulary/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).catch(() => undefined);
    },
    [apiBase]
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={pal.primary} />
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(v) => v.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.hintText}>暂无生词；在电脑端课程页用段落旁的「加入生词」按钮添加</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.vocabHead}>
            <Text style={s.vocabWord}>{item.word}</Text>
            <Pressable onPress={() => void cycleStatus(item)}>
              <Text style={[s.vocabBadge, item.status === 'MASTERED' && s.vocabMastered]}>{STATUS_LABEL[item.status]}</Text>
            </Pressable>
          </View>
          {item.phonetic ? <Text style={s.vocabPhonetic}>{item.phonetic}</Text> : null}
          {item.definitionZh ? <Text style={s.vocabDef}>{item.definitionZh}</Text> : null}
          {item.exampleSentence ? <Text style={s.vocabExample} numberOfLines={2}>“{item.exampleSentence}”</Text> : null}
        </View>
      )}
    />
  );
}

// ==================== 收藏 ====================

function FavoritesScreen({ apiBase }: { apiBase: string }) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/favorites`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((await res.json()) as FavoriteItem[]);
    } catch {
      /* 静默 */
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={pal.primary} />
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(f) => f.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.hintText}>暂无收藏</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          {item.type === 'COURSE' ? (
            <View style={s.iconRow}>
              <Icon name="star" size={14} color={pal.primary} />
              <Text style={s.cardTitle}>{item.courseTitle ?? '课程'}</Text>
            </View>
          ) : (
            <>
              <Text style={s.textEn} numberOfLines={2}>
                {item.excerptEn}
              </Text>
              <Text style={s.textZh} numberOfLines={2}>
                {item.excerptZh}
              </Text>
            </>
          )}
          <Text style={s.cardMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
      )}
    />
  );
}

// ==================== 设置 ====================

/** API 地址预设（下拉可选；换网络环境/IP 后也可手动填任意地址）。
 *  value 为占位符——部署者在 scripts/.env.device 配置真实地址，打包脚本自动注入。 */
const API_PRESETS: { label: string; value: string }[] = [
  { label: 'Cloudflare 隧道 · 外网可用', value: 'https://your-tunnel-domain.example' },
  { label: '局域网直连 · 同 Wi-Fi 提速', value: 'http://192.168.1.100:3001' }
];

function SettingsModal({ apiBase, onSave, onClose }: { apiBase: string; onSave: (v: string) => void; onClose: () => void }) {
  const pal = usePalette();
  const s = useMemo(() => makeStyles(pal), [pal]);

  const [value, setValue] = useState(apiBase);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activePreset = API_PRESETS.find((p) => p.value === value);

  return (
    <View style={s.modalOverlay}>
      <View style={s.modalCard}>
        <Text style={s.sectionTitle}>API 地址</Text>

        {/* 下拉选择预设；选中自动填入下方输入框 */}
        <Pressable style={s.selectBox} onPress={() => setPickerOpen(!pickerOpen)}>
          <Text style={s.selectText} numberOfLines={1}>
            {activePreset ? activePreset.label : '自定义地址'}
          </Text>
          <Text style={s.selectChevron}>{pickerOpen ? '▾' : '▸'}</Text>
        </Pressable>
        {pickerOpen && (
          <View style={s.selectList}>
            {API_PRESETS.map((p) => (
              <Pressable
                key={p.value}
                style={s.selectItem}
                onPress={() => {
                  setValue(p.value);
                  setPickerOpen(false);
                }}
              >
                <Text style={[s.selectItemText, p.value === value && { color: pal.primary, fontWeight: '700' }]} numberOfLines={1}>
                  {p.value === value ? '✓ ' : ''}
                  {p.label}
                </Text>
                <Text style={s.selectItemUrl} numberOfLines={1}>{p.value}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 地址输入框：预设选中自动填充；换 IP/域名时直接手动改这里 */}
        <TextInput style={s.input} value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-tunnel-domain.example 或 http://192.168.x.x:3001" />
        <Text style={s.hintText}>下拉选择预设，或手动填写任意地址（换了 IP/域名后填新地址保存即可）；保存后立即生效</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
          <Pressable style={s.retryBtn} onPress={onClose}>
            <Text style={s.retryText}>取消</Text>
          </Pressable>
          <Pressable style={[s.retryBtn, { backgroundColor: pal.primary }]} onPress={() => onSave(value)}>
            <Text style={[s.retryText, { color: '#fff' }]}>保存</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ==================== 样式 ====================

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  screen: { flex: 1 },
  fixedZone: { flexShrink: 0, maxHeight: '35%' },
  subtitleZone: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  backBtn: { color: c.primary, fontSize: 15, fontWeight: '600' },
  settingsBtn: { fontSize: 14, color: c.primary, fontWeight: '600' },
  tabContent: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: c.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingBottom: 18, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', gap: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabLabel: { fontSize: 10, color: c.faint },
  tabLabelActive: { color: c.primary, fontWeight: '600' },
  card: { backgroundColor: c.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  cardMeta: { fontSize: 12, color: c.sub },
  continueCard: { backgroundColor: c.primaryBg, borderColor: c.primaryBorder },
  continueLabel: { fontSize: 11, fontWeight: '700', color: c.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { width: '31%', backgroundColor: c.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 12, gap: 4 },
  gridLabel: { fontSize: 11, color: c.sub },
  gridValue: { fontSize: 16, fontWeight: '700', color: c.text },
  detailTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginTop: 6 },
  playerCard: { backgroundColor: c.primaryBg, borderRadius: 12, padding: 12, gap: 6 },
  playerTitle: { fontSize: 13, fontWeight: '600', color: c.primaryText },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  playBtnText: { color: c.card, fontWeight: '700', fontSize: 14 },
  smallBtn: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#a5b4fc', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.card },
  smallBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  smallBtnText: { color: c.primary, fontSize: 12, fontWeight: '700' },
  smallBtnTextActive: { color: c.card },
  timeText: { fontSize: 12, color: c.primary, fontVariant: ['tabular-nums'] },
  paragraph: { backgroundColor: c.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 12, gap: 4 },
  paragraphActive: { backgroundColor: c.primaryBg, borderColor: '#6366f1', borderWidth: 1.5 },
  textEn: { color: c.text },
  textEnActive: { color: c.primaryText, fontWeight: '700' },
  textZh: { color: c.sub },
  timestamp: { fontSize: 11, color: c.faint },
  notesText: { fontSize: 13, color: c.sub, lineHeight: 19 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  docName: { flex: 1, fontSize: 13, color: c.text, marginRight: 8 },
  openLink: { color: c.primary, fontSize: 13, fontWeight: '600' },
  subTabBar: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  subTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.card },
  subTabActive: { backgroundColor: c.primary, borderColor: c.primary },
  subTabText: { color: c.text, fontSize: 14, fontWeight: '700' },
  subTabTextActive: { color: c.card },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  langBtns: { flexDirection: 'row', gap: 6 },
  notesBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8, flexShrink: 0 },
  vocabHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vocabWord: { fontSize: 16, fontWeight: '700', color: c.text },
  vocabBadge: { fontSize: 11, color: c.primary, backgroundColor: c.primaryBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', fontWeight: '600' },
  vocabMastered: { color: c.success, backgroundColor: c.successBg },
  vocabPhonetic: { fontSize: 12, color: c.faint },
  vocabDef: { fontSize: 13, color: c.sub },
  vocabExample: { fontSize: 12, fontStyle: 'italic', color: c.faint },
  hintText: { fontSize: 12, color: c.faint, textAlign: 'center' },
  errorText: { fontSize: 15, fontWeight: '600', color: c.danger },
  retryBtn: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.card },
  retryText: { color: c.primary, fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginTop: 8, backgroundColor: c.card },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.card },
  selectText: { fontSize: 14, color: c.text, flexShrink: 1 },
  selectChevron: { fontSize: 13, color: c.sub, marginLeft: 8 },
  selectList: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, marginTop: 6, backgroundColor: c.card, overflow: 'hidden' },
  selectItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  selectItemText: { fontSize: 14, color: c.text },
  selectItemUrl: { fontSize: 11, color: c.faint, marginTop: 2 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: c.card, borderRadius: 14, padding: 18 },
  toastBar: { position: 'absolute', bottom: 28, alignSelf: 'center', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.text, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: c.bg, fontSize: 13, fontWeight: '600' }
  });

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RootErrorBoundary] uncaught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' }}>
          <StatusBar barStyle="light-content" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="alert" size={18} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700' }}>
            应用发生异常 (Crash Prevented)
          </Text>
        </View>
          <Text style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 16 }}>
            {this.state.error?.message ?? '未知错误'}
          </Text>
          <ScrollView style={{ maxHeight: 280, backgroundColor: '#1e293b', borderRadius: 8, padding: 12 }}>
            <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'Courier' }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
          <Pressable
            style={{ marginTop: 20, backgroundColor: '#4f46e5', padding: 12, borderRadius: 8, alignItems: 'center' }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#ffffff', fontWeight: '600' }}>重试渲染</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
