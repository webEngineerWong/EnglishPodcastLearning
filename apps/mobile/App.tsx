/**
 * English Learning Platform — iOS 客户端（Expo Development Build）
 * 与 Web/Electron 共用同一 NestJS API：课程列表 / 音频播放 / 双语文本 / 学习笔记打开。
 * API 地址可在「设置」中修改，默认指向本机局域网地址。
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
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API_BASE = 'http://MAC_LAN_IP:3001';
const API_BASE_KEY = 'elp-api-base';

type CourseListItem = {
  id: string;
  title: string;
  description?: string | null;
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
  endTimeMs?: number | null;
};

type NotesDocument = { id: string; originalName: string; url: string; sizeBytes: number };

type CourseDetail = CourseListItem & {
  notes?: string | null;
  notesDocuments?: NotesDocument[];
  audios: { id: string; originalName: string; url?: string }[];
  transcript?: { paragraphs: Paragraph[] } | null;
  materials?: { id: string; title?: string | null; paragraphs: Paragraph[] }[];
};

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function App() {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [current, setCurrent] = useState<CourseListItem | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(API_BASE_KEY).then((v) => setApiBase(v || DEFAULT_API_BASE));
  }, []);

  const saveApiBase = useCallback((next: string) => {
    const trimmed = next.trim().replace(/\/+$/, '');
    void AsyncStorage.setItem(API_BASE_KEY, trimmed);
    setApiBase(trimmed);
    setShowSettings(false);
  }, []);

  if (!apiBase) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="default" />
      {current ? (
        <CourseScreen apiBase={apiBase} courseId={current.id} initial={current} onBack={() => setCurrent(null)} onOpenSettings={() => setShowSettings(true)} />
      ) : (
        <CourseListScreen apiBase={apiBase} onOpen={setCurrent} onOpenSettings={() => setShowSettings(true)} />
      )}
      {showSettings && <SettingsModal apiBase={apiBase} onSave={saveApiBase} onClose={() => setShowSettings(false)} />}
    </View>
  );
}

// ==================== 课程列表 ====================

function CourseListScreen({ apiBase, onOpen, onOpenSettings }: { apiBase: string; onOpen: (c: CourseListItem) => void; onOpenSettings: () => void }) {
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>英语学习</Text>
        <Pressable onPress={onOpenSettings} hitSlop={8}>
          <Text style={styles.settingsBtn}>⚙️ 设置</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>无法连接 API</Text>
          <Text style={styles.hintText}>{error}</Text>
          <Text style={styles.hintText}>{apiBase}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : courses.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hintText}>暂无课程，先在电脑端导入</Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
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
      )}
    </View>
  );
}

// ==================== 课程详情 ====================

function CourseScreen({
  apiBase,
  courseId,
  onBack,
  onOpenSettings
}: {
  apiBase: string;
  courseId: string;
  initial: CourseListItem;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loadedAudioRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (audioUrl && loadedAudioRef.current !== audioUrl) {
      loadedAudioRef.current = audioUrl;
      player.replace({ uri: audioUrl });
    }
  }, [audioUrl, player]);

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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
          <Text style={styles.detailTitle}>{detail.title}</Text>

          {/* 音频播放器 */}
          {audioUrl ? (
            <View style={styles.playerCard}>
              <Text numberOfLines={1} style={styles.playerTitle}>
                🎧 {detail.audios[0].originalName}
              </Text>
              <View style={styles.playerRow}>
                <Pressable style={styles.playBtn} onPress={() => (status.playing ? player.pause() : void player.play())}>
                  <Text style={styles.playBtnText}>{status.playing ? '⏸ 暂停' : '▶ 播放'}</Text>
                </Pressable>
                <Text style={styles.timeText}>
                  {formatTime((status.currentTime ?? 0) * 1000)} / {formatTime((status.duration ?? 0) * 1000)}
                </Text>
                <Pressable onPress={() => void player.seekTo(Math.max(0, (status.currentTime ?? 0) - 15))}>
                  <Text style={styles.timeText}>«15s</Text>
                </Pressable>
              </View>
              <Text style={styles.hintText}>点击段落跳转播放（锁屏后可继续播放）</Text>
            </View>
          ) : (
            <Text style={styles.hintText}>本课程暂无音频</Text>
          )}

          {/* 学习笔记 PDF（系统浏览器渲染，App 本体仍为独立原生应用） */}
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

          {/* 课程备注 */}
          {detail.notes ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>备注</Text>
              <Text style={styles.notesText}>{detail.notes}</Text>
            </View>
          ) : null}

          {/* 双语文本 */}
          <Text style={styles.sectionTitle}>双语文本（{paragraphs.length} 段）</Text>
          {paragraphs.map((p) => (
            <Pressable key={p.id} style={styles.paragraph} onPress={() => seekTo(p.startTimeMs)}>
              {p.textEn ? <Text style={styles.textEn}>{p.textEn}</Text> : null}
              {p.textZh ? <Text style={styles.textZh}>{p.textZh}</Text> : null}
              <Text style={styles.timestamp}>
                {typeof p.startTimeMs === 'number' ? `⏱ ${formatTime(p.startTimeMs)}` : '无时间戳'}
              </Text>
            </Pressable>
          ))}
          {paragraphs.length === 0 && <Text style={styles.hintText}>本课程暂无文本</Text>}
        </ScrollView>
      )}
    </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  backBtn: { color: '#4f46e5', fontSize: 15, fontWeight: '600' },
  settingsBtn: { fontSize: 18 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardMeta: { fontSize: 12, color: '#64748b' },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 6 },
  playerCard: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 14, gap: 8 },
  playerTitle: { fontSize: 13, fontWeight: '600', color: '#312e81' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  timeText: { fontSize: 12, color: '#4338ca', fontVariant: ['tabular-nums'] },
  paragraph: { backgroundColor: '#fff', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', padding: 12, gap: 4 },
  textEn: { fontSize: 14, color: '#0f172a' },
  textZh: { fontSize: 13, color: '#64748b' },
  timestamp: { fontSize: 11, color: '#94a3b8' },
  notesText: { fontSize: 13, color: '#475569', lineHeight: 19 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  docName: { flex: 1, fontSize: 13, color: '#0f172a', marginRight: 8 },
  openLink: { color: '#4f46e5', fontSize: 13, fontWeight: '600' },
  hintText: { fontSize: 12, color: '#94a3b8' },
  errorText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  retryBtn: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  retryText: { color: '#4f46e5', fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginTop: 8, backgroundColor: '#fff' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 18 }
});
