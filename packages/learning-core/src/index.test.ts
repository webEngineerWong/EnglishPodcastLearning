import { describe, expect, it } from 'vitest';
import {
  assignTimestampsFromSrt,
  calcStreakDays,
  formatTime,
  isChineseDominant,
  mergeSrtCuesToParagraphs,
  normalizeRate,
  parseSrt,
  splitIntoSentences,
  textSimilarity,
  type SrtCue
} from './index';

describe('formatTime', () => {
  it('基本格式', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65000)).toBe('1:05');
    expect(formatTime(3723000)).toBe('1:02:03');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('parseSrt', () => {
  it('标准 SRT 解析', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,500
Hello world.

2
00:00:04,000 --> 00:00:06,000
Second line.`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(3500);
    expect(cues[1].text).toBe('Second line.');
  });
  it('容忍 BOM 与 CRLF', () => {
    const cues = parseSrt('﻿1\r\n00:00:00,500 --> 00:00:01,500\r\nHi');
    expect(cues[0].startMs).toBe(500);
  });
});

describe('mergeSrtCuesToParagraphs', () => {
  it('时间连续的英文 cue 合并', () => {
    const cues: SrtCue[] = [
      { index: 0, startMs: 0, endMs: 1000, text: 'The first part.' },
      { index: 1, startMs: 1100, endMs: 2000, text: 'The second part.' },
      { index: 2, startMs: 10000, endMs: 12000, text: 'After a long gap.' }
    ];
    const merged = mergeSrtCuesToParagraphs(cues, 1200);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toContain('first part');
    expect(merged[0].text).toContain('second part');
    expect(merged[0].endMs).toBe(2000);
  });
});

describe('assignTimestampsFromSrt', () => {
  it('用词匹配给段落分配真实时间戳', () => {
    const cues: SrtCue[] = [
      { index: 0, startMs: 0, endMs: 2000, text: 'The quick brown fox jumps over the lazy dog.' },
      { index: 1, startMs: 2500, endMs: 4500, text: 'A completely different sentence about cats.' },
      { index: 2, startMs: 5000, endMs: 7000, text: 'More text follows here now.' }
    ];
    const paragraphs = [
      { textEn: 'The quick brown fox jumps over the lazy dog.' },
      { textEn: 'A completely different sentence about cats and dogs.' },
      { textEn: 'More text follows here in the transcript.' }
    ];
    const hints = assignTimestampsFromSrt(paragraphs, cues);
    expect(hints[0]).not.toBeNull();
    expect(hints[0]!.startMs).toBe(0);
    expect(hints[1]).not.toBeNull();
    expect(hints[1]!.endMs).toBe(4500);
    expect(hints[2]).not.toBeNull();
  });

  it('无法匹配时保持 null，绝不伪造', () => {
    const cues: SrtCue[] = [{ index: 0, startMs: 0, endMs: 2000, text: 'Unrelated audio content here.' }];
    const hints = assignTimestampsFromSrt([{ textEn: 'Totally different paragraph about economics.' }], cues);
    expect(hints[0]).toBeNull();
  });
});

describe('textSimilarity / isChineseDominant', () => {
  it('相似度计算', () => {
    expect(textSimilarity('the quick fox', 'the quick fox runs')).toBeGreaterThan(0.5);
    expect(textSimilarity('apple banana', 'cherry date')).toBe(0);
  });
  it('中文判断', () => {
    expect(isChineseDominant('这是中文句子')).toBe(true);
    expect(isChineseDominant('This is English text.')).toBe(false);
    expect(isChineseDominant('')).toBe(false);
  });
});

describe('splitIntoSentences', () => {
  it('英文分句', () => {
    const out = splitIntoSentences('First sentence. Second one! Third?');
    expect(out).toEqual(['First sentence.', 'Second one!', 'Third?']);
  });
  it('中文分句', () => {
    const out = splitIntoSentences('第一句。第二句！第三句？');
    expect(out).toHaveLength(3);
  });
});

describe('normalizeRate', () => {
  it('合法倍速保持', () => {
    expect(normalizeRate(1.5)).toBe(1.5);
  });
  it('非法倍速回落到 1', () => {
    expect(normalizeRate(1.7)).toBe(1);
  });
});

describe('calcStreakDays', () => {
  it('连续天数', () => {
    const today = '2026-11-11';
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-01'];
    expect(calcStreakDays(dates, today)).toBe(3);
  });
  it('今天没学不影响，从昨天往前数', () => {
    const today = '2026-11-11';
    const dates = ['2026-11-09', '2026-11-10'];
    expect(calcStreakDays(dates, today)).toBe(2);
  });
});
