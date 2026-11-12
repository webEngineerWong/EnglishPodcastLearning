/**
 * English Learning Platform — iOS 客户端（Expo Development Build）
 * 与 Web/Electron 共用同一 NestJS API：学习台 / 课程 / 音频播放 / 双语文本 / 生词本 / 收藏 / 学习笔记打开。
 * 音频会话设为 playsInSilentMode（静音键不影响播放）+ 后台播放。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API_BASE = 'http://MAC_LAN_IP:3001';
const API_BASE_KEY = 'elp-api-base';
const FONT_SIZE_KEY = 'elp-font-size';

// ==================== 类型（与 @elp/types DTO 对齐） ====================

type CourseListItem = {
  id: string;
  title: string;
  difficulty: number;
  audioCount: number;
  lastPositionMs?: number | null;
};

type Paragraph = {
  id: string;
  order: number;
  textEn?: string | null;
  textZh?: string | null;
  startTimeMs?: number | null;
};

type NotesDocument = { id: string; originalName: string; url: string; sizeBytes: number };

type CourseDetail = CourseListItem & {
  notes?: string | null;
  notesDocuments?: NotesDocument[];
  audios: { id: string; originalName: string; url?: string }[];
  transcript?: { paragraphs: Paragraph[] } | null;
};

type DashboardStats = {
  todayMs: number;
  totalMs: number;
  streakDays: number;
  courseCount: number;
  completedCount: number;
  vocabularyCount: number;
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

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: '学习台', icon: '📊' },
  { key: 'courses', label: '课程', icon: '📚' },
  { key: 'vocabulary', label: '生词本', icon: '🔤' },
  { key: 'favorites', label: '收藏', icon: '⭐' }
];

export default function App() {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<TabKey>('courses');
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [resumeMs, setResumeMs] = useState<number | undefined>(undefined);

  useEffect(() => {
    // 静音键下仍可播放（学习类 App 标准行为）+ 锁屏/后台继续播放
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => undefined);
    AsyncStorage.getItem(API_BASE_KEY).then((v) => setApiBase(v || DEFAULT_API_BASE));
  }, []);

  // 灵动岛/冷启动恢复：有近期学习记录（<6 小时且播放位置有效）时直接回到该课程并续播位置
  useEffect(() => {
    if (!apiBase || openCourseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/stats/dashboard`);
        if (!res.ok) return;
        const s = (await res.json()) as DashboardStats;
        const c = s.continueLearning;
        if (!cancelled && c && c.positionMs > 3000 && Date.now() - new Date(c.lastLearnedAt).getTime() < 6 * 3_600_000) {
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
  }, [apiBase]);

  const saveApiBase = useCallback((next: string) => {
    const trimmed = next.trim().replace(/\/+$/, '');
    void AsyncStorage.setItem(API_BASE_KEY, trimmed);
    setApiBase(trimmed);
    setShowSettings(false);
    setOpenCourseId(null);
  }, []);

  if (!apiBase) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const onOpenCourse = (id: string) => {
    setTab('courses');
    setResumeMs(undefined);
    setOpenCourseId(id);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="default" />
      {openCourseId ? (
        <CourseScreen
          key={openCourseId}
          apiBase={apiBase}
          courseId={openCourseId}
          resumeMs={resumeMs}
          onBack={() => setOpenCourseId(null)}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : (
        <View style={styles.screen}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{TABS.find((t) => t.key === tab)?.label ?? '英语学习'}</Text>
            <Pressable onPress={() => setShowSettings(true)} hitSlop={8}>
              <Text style={styles.settingsBtn}>⚙️ 设置</Text>
            </Pressable>
          </View>
          <View style={styles.tabContent}>
            {tab === 'dashboard' && <DashboardScreen apiBase={apiBase} onOpenCourse={onOpenCourse} />}
            {tab === 'courses' && <CourseListScreen apiBase={apiBase} onOpen={(c) => setOpenCourseId(c.id)} />}
            {tab === 'vocabulary' && <VocabularyScreen apiBase={apiBase} />}
            {tab === 'favorites' && <FavoritesScreen apiBase={apiBase} />}
          </View>
          {/* 底部导航（对齐 Web/Electron 菜单） */}
          <View style={styles.tabBar}>
            {TABS.map((t) => (
              <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabIcon, tab === t.key && styles.tabIconActive]}>{t.icon}</Text>
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {showSettings && <SettingsModal apiBase={apiBase} onSave={saveApiBase} onClose={() => setShowSettings(false)} />}
    </View>
  );
}

// ==================== 学习台 ====================

function DashboardScreen({ apiBase, onOpenCourse }: { apiBase: string; onOpenCourse: (id: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiBase}/api/stats/dashboard`);
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>无法连接 API（{error}）</Text>
        <Text style={styles.hintText}>{apiBase}</Text>
      </View>
    );
  }
  if (!stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
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

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
      {stats.continueLearning && (
        <Pressable style={[styles.card, styles.continueCard]} onPress={() => onOpenCourse(stats.continueLearning!.courseId)}>
          <Text style={styles.continueLabel}>▶ 继续上次学习</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {stats.continueLearning.title}
          </Text>
          <Text style={styles.cardMeta}>
            {stats.continueLearning.audioName ?? ''} · 上次 {formatTime(stats.continueLearning.positionMs)}
          </Text>
        </Pressable>
      )}
      <View style={styles.grid}>
        {cells.map(([label, value]) => (
          <View key={label} style={styles.gridCell}>
            <Text style={styles.gridLabel}>{label}</Text>
            <Text style={styles.gridValue}>{value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ==================== 课程列表 ====================

function CourseListScreen({ apiBase, onOpen }: { apiBase: string; onOpen: (c: CourseListItem) => void }) {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/courses?limit=50`);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>无法连接 API</Text>
        <Text style={styles.hintText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryText}>重试</Text>
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
        <View style={styles.center}>
          <Text style={styles.hintText}>暂无课程，先在电脑端导入</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardMeta}>
            🎧 {item.audioCount} · L{item.difficulty}
            {item.lastPositionMs ? ` · 上次 ${formatTime(item.lastPositionMs)}` : ''}
          </Text>
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
  onBack,
  onOpenSettings
}: {
  apiBase: string;
  courseId: string;
  resumeMs?: number;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const seekedOnceRef = useRef(false);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = status.currentTime ?? 0;
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const paragraphYs = useRef<Map<string, number>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [followAudio, setFollowAudio] = useState(true);
  const [fontIdx, setFontIdx] = useState(1); // 0小 1中 2大
  const [scrubSec, setScrubSec] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY).then((v) => {
      const idx = Number(v);
      if (Number.isInteger(idx) && idx >= 0 && idx < FONT_SIZES.length) setFontIdx(idx);
    });
  }, []);

  const changeFont = useCallback((delta: number) => {
    setFontIdx((prev) => {
      const next = Math.min(FONT_SIZES.length - 1, Math.max(0, prev + delta));
      void AsyncStorage.setItem(FONT_SIZE_KEY, String(next));
      return next;
    });
  }, []);

  const audioUrl = detail?.audios?.[0]?.url
    ? detail.audios[0].url!.startsWith('http')
      ? detail.audios[0].url!
      : apiBase + detail.audios[0].url!
    : null;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`${apiBase}/api/courses/${courseId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CourseDetail>;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, courseId]);

  // 载入音频并恢复位置（灵动岛/冷启动续播：resumeMs 优先，其次课程记录的上次位置）
  useEffect(() => {
    if (audioUrl && detail && !seekedOnceRef.current) {
      seekedOnceRef.current = true;
      player.replace({ uri: audioUrl });
      const resume = resumeMs ?? detail.lastPositionMs ?? 0;
      if (resume > 5000) void player.seekTo(resume / 1000);
      // 锁屏 / 灵动岛 / 控制中心：标题、所属课程与进度控制
      player.setActiveForLockScreen(
        true,
        { title: detail.audios[0]?.originalName ?? detail.title, artist: detail.title, albumTitle: '英语学习' },
        { showSeekBackward: true, showSeekForward: true }
      );
    }
  }, [audioUrl, detail, player, resumeMs]);

  // 学习心跳：播放中每 5s 上报位置（学习台「继续学习」与跨设备续播数据来源）
  const audioAssetId = detail?.audios?.[0]?.id;
  useEffect(() => {
    if (!status.playing || !audioAssetId) return;
    const iv = setInterval(() => {
      void fetch(`${apiBase}/api/progress/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, audioAssetId, positionMs: Math.round(currentTimeRef.current * 1000), deltaMs: 5000 })
      }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(iv);
  }, [status.playing, audioAssetId, apiBase, courseId]);

  const seekTo = useCallback(
    (ms?: number | null) => {
      if (typeof ms !== 'number') return;
      void player.seekTo(ms / 1000);
      void player.play();
    },
    [player]
  );

  const openNotesDoc = useCallback(
    (doc: NotesDocument) => {
      const url = doc.url.startsWith('http') ? doc.url : apiBase + doc.url;
      void Linking.openURL(url);
    },
    [apiBase]
  );

  const paragraphs = detail?.transcript?.paragraphs ?? [];

  // 当前段落高亮（id 变化才 setState，避免每 tick 重渲）
  useEffect(() => {
    if (paragraphs.length === 0 || !status.playing) return;
    const id = findActiveParagraph(paragraphs, status.currentTime ?? 0);
    if (id && id !== activeIdRef.current) {
      activeIdRef.current = id;
      setActiveId(id);
    }
  }, [status.currentTime, status.playing, paragraphs]);

  // 自动跟随：高亮段滚动到双语滚动区上部
  useEffect(() => {
    if (!followAudio || !activeId) return;
    const y = paragraphYs.current.get(activeId);
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 48), animated: true });
    }
  }, [activeId, followAudio]);

  const font = FONT_SIZES[fontIdx];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backBtn}>← 课程</Text>
        </Pressable>
        <Pressable onPress={onOpenSettings} hitSlop={8}>
          <Text style={styles.settingsBtn}>⚙️</Text>
        </Pressable>
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>加载失败</Text>
          <Text style={styles.hintText}>{error}</Text>
        </View>
      ) : !detail ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <>
          {/* ===== 固定区：标题 / 播放器（进度条） / 笔记 / 备注（不随字幕滚动） ===== */}
          <ScrollView style={styles.fixedZone} bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 6, gap: 10 }}>
            <Text style={styles.detailTitle}>{detail.title}</Text>

            {audioUrl ? (
              <View style={styles.playerCard}>
                <Text numberOfLines={1} style={styles.playerTitle}>
                  🎧 {detail.audios[0].originalName}
                </Text>
                {/* 音轨进度条（可拖动） */}
                <Slider
                  style={{ width: '100%', height: 30 }}
                  minimumValue={0}
                  maximumValue={Math.max(1, status.duration ?? 0)}
                  value={scrubSec ?? status.currentTime ?? 0}
                  onValueChange={(v) => setScrubSec(v)}
                  onSlidingComplete={(v) => {
                    void player.seekTo(v);
                    setScrubSec(null);
                  }}
                  minimumTrackTintColor="#4f46e5"
                  maximumTrackTintColor="#c7d2fe"
                  thumbTintColor="#4f46e5"
                />
                <View style={styles.playerRow}>
                  <Pressable style={styles.playBtn} onPress={() => (status.playing ? player.pause() : void player.play())}>
                    <Text style={styles.playBtnText}>{status.playing ? '⏸ 暂停' : '▶ 播放'}</Text>
                  </Pressable>
                  <Text style={styles.timeText}>
                    {formatTime((scrubSec ?? status.currentTime ?? 0) * 1000)} / {formatTime((status.duration ?? 0) * 1000)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => void player.seekTo(Math.max(0, (status.currentTime ?? 0) - 15))}>
                    <Text style={styles.timeText}>«15s</Text>
                  </Pressable>
                </View>
                <View style={styles.playerRow}>
                  <Pressable style={styles.smallBtn} onPress={() => changeFont(-1)}>
                    <Text style={styles.smallBtnText}>A−</Text>
                  </Pressable>
                  <Text style={styles.timeText}>{font.label}</Text>
                  <Pressable style={styles.smallBtn} onPress={() => changeFont(1)}>
                    <Text style={styles.smallBtnText}>A+</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable style={[styles.smallBtn, followAudio && styles.smallBtnActive]} onPress={() => setFollowAudio(!followAudio)}>
                    <Text style={[styles.smallBtnText, followAudio && styles.smallBtnTextActive]}>↕ 跟随</Text>
                  </Pressable>
                </View>
                <Text style={styles.hintText}>点击段落跳转播放；静音键不影响；锁屏/灵动岛可继续</Text>
              </View>
            ) : (
              <Text style={styles.hintText}>本课程暂无音频</Text>
            )}

            {(detail.notesDocuments?.length ?? 0) > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>📝 学习笔记</Text>
                {detail.notesDocuments!.map((doc) => (
                  <Pressable key={doc.id} style={styles.docRow} onPress={() => openNotesDoc(doc)}>
                    <Text numberOfLines={1} style={styles.docName}>
                      📄 {doc.originalName}
                    </Text>
                    <Text style={styles.openLink}>打开 ↗</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {detail.notes ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>备注</Text>
                <Text style={styles.notesText}>{detail.notes}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>双语文本（{paragraphs.length} 段）</Text>
          </ScrollView>

          {/* ===== 双语字幕独立滚动区：高度 = 屏幕减去上方固定播放区 ===== */}
          <ScrollView
            ref={scrollRef}
            style={styles.subtitleZone}
            contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 24, gap: 10 }}
          >
            {paragraphs.map((p) => {
              const isActive = p.id === activeId;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.paragraph, isActive && styles.paragraphActive]}
                  onLayout={(e) => paragraphYs.current.set(p.id, e.nativeEvent.layout.y)}
                  onPress={() => seekTo(p.startTimeMs)}
                >
                  {p.textEn ? (
                    <Text style={[styles.textEn, { fontSize: font.en }, isActive && styles.textEnActive]}>{p.textEn}</Text>
                  ) : null}
                  {p.textZh ? <Text style={[styles.textZh, { fontSize: font.zh }]}>{p.textZh}</Text> : null}
                  <Text style={styles.timestamp}>
                    {typeof p.startTimeMs === 'number' ? `⏱ ${formatTime(p.startTimeMs)}` : '无时间戳'}
                  </Text>
                </Pressable>
              );
            })}
            {paragraphs.length === 0 && <Text style={styles.hintText}>本课程暂无文本</Text>}
          </ScrollView>
        </>
      )}
    </View>
  );
}

// ==================== 生词本 ====================

const STATUS_LABEL: Record<VocabStatus, string> = { NEW: '生词', LEARNING: '学习中', MASTERED: '已掌握' };
const NEXT_STATUS: Record<VocabStatus, VocabStatus> = { NEW: 'LEARNING', LEARNING: 'MASTERED', MASTERED: 'NEW' };

function VocabularyScreen({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiBase}/api/vocabulary`);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
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
        <View style={styles.center}>
          <Text style={styles.hintText}>暂无生词；在电脑端课程页点段落旁 🔤 加入</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.vocabHead}>
            <Text style={styles.vocabWord}>{item.word}</Text>
            <Pressable onPress={() => void cycleStatus(item)}>
              <Text style={[styles.vocabBadge, item.status === 'MASTERED' && styles.vocabMastered]}>{STATUS_LABEL[item.status]}</Text>
            </Pressable>
          </View>
          {item.phonetic ? <Text style={styles.vocabPhonetic}>{item.phonetic}</Text> : null}
          {item.definitionZh ? <Text style={styles.vocabDef}>{item.definitionZh}</Text> : null}
          {item.exampleSentence ? <Text style={styles.vocabExample} numberOfLines={2}>“{item.exampleSentence}”</Text> : null}
        </View>
      )}
    />
  );
}

// ==================== 收藏 ====================

function FavoritesScreen({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiBase}/api/favorites`);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
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
        <View style={styles.center}>
          <Text style={styles.hintText}>暂无收藏</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.type === 'COURSE' ? (
            <Text style={styles.cardTitle}>⭐ {item.courseTitle ?? '课程'}</Text>
          ) : (
            <>
              <Text style={styles.textEn} numberOfLines={2}>
                {item.excerptEn}
              </Text>
              <Text style={styles.textZh} numberOfLines={2}>
                {item.excerptZh}
              </Text>
            </>
          )}
          <Text style={styles.cardMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
      )}
    />
  );
}

// ==================== 设置 ====================

function SettingsModal({ apiBase, onSave, onClose }: { apiBase: string; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(apiBase);
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalCard}>
        <Text style={styles.sectionTitle}>API 地址</Text>
        <TextInput style={styles.input} value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.x.x:3001" />
        <Text style={styles.hintText}>手机与电脑需在同一 Wi-Fi；电脑端 docker compose up -d 运行 API</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
          <Pressable style={styles.retryBtn} onPress={onClose}>
            <Text style={styles.retryText}>取消</Text>
          </Pressable>
          <Pressable style={[styles.retryBtn, { backgroundColor: '#4f46e5' }]} onPress={() => onSave(value)}>
            <Text style={[styles.retryText, { color: '#fff' }]}>保存</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  screen: { flex: 1 },
  fixedZone: { flexShrink: 0, maxHeight: '55%' },
  subtitleZone: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  backBtn: { color: '#4f46e5', fontSize: 15, fontWeight: '600' },
  settingsBtn: { fontSize: 14, color: '#4f46e5', fontWeight: '600' },
  tabContent: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0', paddingBottom: 18, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', gap: 1 },
  tabIcon: { fontSize: 19, opacity: 0.45 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 10, color: '#94a3b8' },
  tabLabelActive: { color: '#4f46e5', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardMeta: { fontSize: 12, color: '#64748b' },
  continueCard: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  continueLabel: { fontSize: 11, fontWeight: '700', color: '#4f46e5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { width: '31%', backgroundColor: '#fff', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', padding: 12, gap: 4 },
  gridLabel: { fontSize: 11, color: '#64748b' },
  gridValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 6 },
  playerCard: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 14, gap: 8 },
  playerTitle: { fontSize: 13, fontWeight: '600', color: '#312e81' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#a5b4fc', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
  smallBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  smallBtnText: { color: '#4f46e5', fontSize: 12, fontWeight: '700' },
  smallBtnTextActive: { color: '#fff' },
  timeText: { fontSize: 12, color: '#4338ca', fontVariant: ['tabular-nums'] },
  paragraph: { backgroundColor: '#fff', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', padding: 12, gap: 4 },
  paragraphActive: { backgroundColor: '#eef2ff', borderColor: '#6366f1', borderWidth: 1.5 },
  textEn: { color: '#0f172a' },
  textEnActive: { color: '#312e81', fontWeight: '700' },
  textZh: { color: '#64748b' },
  timestamp: { fontSize: 11, color: '#94a3b8' },
  notesText: { fontSize: 13, color: '#475569', lineHeight: 19 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  docName: { flex: 1, fontSize: 13, color: '#0f172a', marginRight: 8 },
  openLink: { color: '#4f46e5', fontSize: 13, fontWeight: '600' },
  vocabHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vocabWord: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  vocabBadge: { fontSize: 11, color: '#4f46e5', backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', fontWeight: '600' },
  vocabMastered: { color: '#059669', backgroundColor: '#ecfdf5' },
  vocabPhonetic: { fontSize: 12, color: '#94a3b8' },
  vocabDef: { fontSize: 13, color: '#475569' },
  vocabExample: { fontSize: 12, fontStyle: 'italic', color: '#94a3b8' },
  hintText: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  errorText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  retryBtn: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  retryText: { color: '#4f46e5', fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginTop: 8, backgroundColor: '#fff' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 18 }
});
