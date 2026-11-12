import type { LoopRange, LoopMode, PlaybackRate } from '@elp/types';

/** 格式化毫秒为 mm:ss（超过 1 小时为 h:mm:ss） */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 规范化倍速：仅允许 0.5~2 之间的已知档位 */
export function normalizeRate(rate: number, allowed: readonly PlaybackRate[] = [0.5, 0.75, 1, 1.25, 1.5, 2]): PlaybackRate {
  return (allowed.find((r) => Math.abs(r - rate) < 1e-6) ?? 1) as PlaybackRate;
}

/**
 * 循环逻辑：给定当前时间与循环模式，返回应该跳转的时间（毫秒），null 表示不跳转。
 * - paragraph / ab：超过 endMs 时跳回 startMs；在 startMs 之前播放不强制回跳（自然播放进入区间）
 */
export function loopJump(tMs: number, mode: LoopMode, range: LoopRange | null): number | null {
  if (mode !== 'paragraph' && mode !== 'ab') return null;
  if (!range || !Number.isFinite(range.startMs)) return null;
  const end = Math.min(range.endMs, Number.MAX_SAFE_INTEGER);
  if (end > range.startMs && tMs >= end) return range.startMs;
  return null;
}

/** 区间是否有效：start < end 且时长 > 100ms */
export function isValidRange(startMs?: number | null, endMs?: number | null): boolean {
  return (
    typeof startMs === 'number' &&
    typeof endMs === 'number' &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs - startMs > 100
  );
}

/**
 * 由文本推算段落是否为中文主导（CJK 占比 > 0.3）
 */
export function isChineseDominant(text: string): boolean {
  if (!text) return false;
  let cjk = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total++;
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) cjk++;
  }
  return total > 0 && cjk / total > 0.3;
}

/**
 * 把长文本切成句子（用于"拆分段落"）。
 * 中英文句末标点均识别；保留标点在句内。
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];
  const parts = text
    .replace(/([。！？；!?;])(\s*)/g, '$1\n')
    .replace(/([.!?])(\s+)(?=[A-Z"'(\u4e00-\u9fff])/g, '$1\n');
  return parts
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * SRT 解析：返回带毫秒时间戳的字幕条目。
 * 容忍常见格式问题（逗号/句点毫秒分隔、BOM、多余空行）。
 */
export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export function parseSrtTimestamp(stamp: string): number {
  const m = stamp.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) throw new Error(`Invalid SRT timestamp: ${stamp}`);
  const [, h, mm, ss, ms] = m;
  return (
    (Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss)) * 1000 + Number(ms.padEnd(3, '0'))
  );
}

export function parseSrt(content: string): SrtCue[] {
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const timeLineIdx = lines.findIndex((l) => /-->/.test(l));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    if (!startRaw || !endRaw) continue;
    const bodyLines = lines.slice(timeLineIdx + 1);
    if (bodyLines.length === 0) continue;
    cues.push({
      index: cues.length,
      startMs: parseSrtTimestamp(startRaw),
      endMs: parseSrtTimestamp(endRaw),
      text: bodyLines.join('\n').trim()
    });
  }
  return cues;
}

/**
 * 滚动（卡拉OK式）SRT 行级提取：
 * 这类字幕每条 cue 是一个 1-2 行的滚动窗口，文本大量重叠。
 * 追踪每行的"打开-关闭"生命周期：首次出现记 start，消失时记 end，
 * 输出唯一文本行的真实时间，行序即阅读顺序。
 */
export interface SrtLine {
  text: string;
  startMs: number;
  endMs: number;
}

export function rollingSrtToLines(cues: SrtCue[]): SrtLine[] {
  const closed: SrtLine[] = [];
  const open = new Map<string, SrtLine>();
  for (const cue of cues) {
    const lines = cue.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^\[.*\]$/.test(l) && l !== '-');
    // 上一窗口存在而本窗口消失的行 → 关闭
    for (const [key, rec] of [...open.entries()]) {
      if (!lines.includes(key)) {
        rec.endMs = Math.max(rec.endMs, cue.startMs);
        closed.push(rec);
        open.delete(key);
      }
    }
    for (const line of lines) {
      const rec = open.get(line);
      if (rec) {
        rec.endMs = Math.max(rec.endMs, cue.endMs);
      } else {
        open.set(line, { text: line, startMs: cue.startMs, endMs: cue.endMs });
      }
    }
  }
  for (const rec of open.values()) closed.push(rec);
  return closed.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

/**
 * 把滚动字幕行合并为句子段：遇到句末标点即切段。
 * 超长段（> maxDurationMs）强制按行断开，保证段落粒度可用。
 */
export function rollingLinesToSegments(lines: SrtLine[], maxDurationMs = 45_000): SrtCue[] {
  const segs: SrtCue[] = [];
  let buf: SrtLine[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    segs.push({
      index: segs.length,
      startMs: buf[0].startMs,
      endMs: buf[buf.length - 1].endMs,
      text: buf.map((l) => l.text).join(' ')
    });
    buf = [];
  };
  for (const line of lines) {
    buf.push(line);
    const dur = buf[buf.length - 1].endMs - buf[0].startMs;
    if (/[.!?。！？]["')\]]?\s*$/.test(line.text) || dur > maxDurationMs) flush();
  }
  flush();
  return segs;
}

/**
 * 将 SRT 字幕条目合并为段落级别的"可显示行"：
 * 把时间上连续（间隔 < gapMs）且语言相同的 cue 合并，便于整句显示与循环。
 * 不改变任何时间戳数值。
 */
export function mergeSrtCuesToParagraphs(cues: SrtCue[], gapMs = 1200): SrtCue[] {
  const out: SrtCue[] = [];
  for (const cue of cues) {
    const prev = out[out.length - 1];
    if (
      prev &&
      isChineseDominant(prev.text) === isChineseDominant(cue.text) &&
      cue.startMs - prev.endMs <= gapMs
    ) {
      prev.text = `${prev.text}\n${cue.text}`;
      prev.endMs = cue.endMs;
    } else {
      out.push({ ...cue });
    }
  }
  return out;
}

/**
 * 用 SRT 时间轴为 PDF 解析出的段落标注真实时间戳。
 * 策略：按顺序把 SRT 事件切分给连续段落 ——
 * 用英文段落文本与字幕文本的词匹配比例打分（不要求一一对应）。
 * 没有匹配把握时返回 null，绝不伪造时间。
 */
export interface TimestampHint {
  startMs: number;
  endMs: number;
  confidence: number;
}

export function normalizeEnText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map(stemEn);
}

/** 轻量词干化：处理 -ing/-ed/-s 词形差异（PDF 整理文本 vs SRT 原始转写） */
export function stemEn(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ing') && w.length > 6) return w.slice(0, -3);
  if (w.endsWith('ied')) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function textSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeEnText(a));
  const wb = normalizeEnText(b);
  if (wa.size === 0 || wb.length === 0) return 0;
  const overlap = wb.filter((w) => wa.has(w)).length;
  return overlap / Math.max(wa.size, 1);
}

export interface AssignableParagraph {
  textEn: string;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
}

/**
 * 为段落序列分配时间戳：
 * 从未分配的段落开始，用"滑动窗口 + 相似度"在 SRT 上找最匹配区间。
 * 相似度过低（< 0.12）则不分配，保持 null。
 */
export function assignTimestampsFromSrt(
  paragraphs: AssignableParagraph[],
  cues: SrtCue[],
  options?: { minSimilarity?: number }
): (TimestampHint | null)[] {
  void options;
  const results: (TimestampHint | null)[] = paragraphs.map(() => null);
  /**
   * 词汇锚点法：
   * PDF"整理文本"与 SRT"原始转写"词形差异大，整句相似度不可靠；
   * 但罕见词（VP / Fortune / Caroline…）在两个版本中都会出现。
   * 1) 统计 cue 全文的词频 df；2) 每段落取 df 最低、词长最长的 3 个区分词；
   * 3) 顺序扫描 cue（指针单调），命中 >=2 个区分词的 cue 即锚点；
   * 4) 段落区间 = 本锚点起点 → 下一锚点前一条 cue 的终点。
   * 找不到锚点的段落保持 null —— 绝不伪造时间。
   */
  const cueWordsList = cues.map((c) => new Set(normalizeEnText(c.text)));
  const df = new Map<string, number>();
  for (const words of cueWordsList) {
    for (const w of words) df.set(w, (df.get(w) ?? 0) + 1);
  }

  interface Anchor {
    paraIdx: number;
    cueIdx: number;
  }
  const anchors: Anchor[] = [];
  let searchFrom = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const textEn = paragraphs[i].textEn?.trim();
    if (!textEn) continue;
    const words = [...new Set(normalizeEnText(textEn))];
    if (words.length === 0) continue;
    // 区分词：df 低优先，其次词长长
    const distinctive = words
      .filter((w) => (df.get(w) ?? 0) <= Math.max(3, cues.length * 0.08))
      .sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0) || b.length - a.length)
      .slice(0, 3);
    if (distinctive.length === 0) continue;

    const windowEnd = Math.min(cues.length, searchFrom + 80);
    let anchorIdx = -1;
    for (let j = searchFrom; j < windowEnd; j++) {
      const hits = distinctive.filter((w) => cueWordsList[j].has(w)).length;
      if (hits >= 2 || (hits >= 1 && distinctive.length === 1)) {
        anchorIdx = j;
        break;
      }
    }
    if (anchorIdx === -1) continue;
    anchors.push({ paraIdx: i, cueIdx: anchorIdx });
    searchFrom = anchorIdx + 1;
  }

  // 区间回填：段落 i 的终点 = 下一段落锚点前一条 cue 的终点
  for (let k = 0; k < anchors.length; k++) {
    const { paraIdx, cueIdx } = anchors[k];
    const startMs = cues[cueIdx].startMs;
    const endIdx =
      k + 1 < anchors.length ? Math.max(cueIdx, anchors[k + 1].cueIdx - 1) : Math.min(cues.length - 1, cueIdx + 8);
    const endMs = cues[endIdx].endMs;
    if (endMs > startMs) {
      results[paraIdx] = { startMs, endMs, confidence: 0.6 };
    }
  }
  return results;
}

/**
 * 连续学习天数计算：给定学习日期字符串集合（yyyy-mm-dd，UTC 或本地均可，保持一致），
 * 从今天（或最近一天）向回数连续天数。
 */
export function calcStreakDays(dates: string[], today: string): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date(today + 'T00:00:00Z');
  // 今天没学不影响 streak（从最近一天开始数）
  if (!set.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** 本地 yyyy-mm-dd */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- 文档角色判定（学习笔记 PDF） ----------

/** 学习笔记文件名规则：含「笔记」或 notes（不区分大小写） */
const NOTES_FILENAME_RE = /笔记|notes/i;

/** 学习笔记内容关键词：前 2 页文本命中 ≥2 个即判为笔记 */
export const NOTES_CONTENT_KEYWORDS: readonly string[] = ['导语', '重难点', '知识点总结', '用法总结'];

/**
 * 判定上传文档角色（纯函数，导入与课程两端共用）：
 * 1. 文件名含「笔记」/ notes → notes；
 * 2. 提供了前 2 页文本且命中 ≥2 个内容关键词 → notes；
 * 3. 其余 → source。
 * firstPagesText 传 null/undefined 表示只做文件名判断。
 */
export function detectNotesDocument(filename: string, firstPagesText?: string | null): 'source' | 'notes' {
  if (NOTES_FILENAME_RE.test(filename)) return 'notes';
  if (firstPagesText) {
    const hits = NOTES_CONTENT_KEYWORDS.filter((k) => firstPagesText.includes(k)).length;
    if (hits >= 2) return 'notes';
  }
  return 'source';
}

/** 文件名规范化（用于同名/同集匹配）：去扩展名、括号、空白与后缀词 */
export function normalizeNameForMatch(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[（(]/g, '')
    .replace(/[）)]/g, '')
    .replace(/[\s_.-]+/g, '')
    .replace(/对照文本|对照|翻译|文本|字幕|英文|中文|配套音频|音频|学习笔记/g, '')
    .toLowerCase();
}

/** 提取文件名中的集数编号（Episode 12 / ep12 / 第12集 等），用于跨后缀精确匹配 */
export function episodeKeyOf(name: string): string | null {
  const m = name.match(/(?:episode|ep|第)\s*[_-]?\s*(\d{1,4})\s*集?/i);
  return m ? `ep${m[1]}` : null;
}

/** 文件名匹配：规范化相等 或 集数编号相等（episode1 不会误配 episode10-13） */
export function nameMatches(a: string, b: string): boolean {
  const nA = normalizeNameForMatch(a);
  const nB = normalizeNameForMatch(b);
  if (nA && nB && nA === nB) return true;
  const eA = episodeKeyOf(a);
  const eB = episodeKeyOf(b);
  return Boolean(eA && eB && eA === eB);
}
