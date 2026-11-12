import { describe, expect, it } from 'vitest';
import { detectNotesDocument, episodeKeyOf, nameMatches, normalizeNameForMatch } from './index';

describe('detectNotesDocument', () => {
  it('文件名含「笔记」→ notes', () => {
    expect(detectNotesDocument('Episode_2_学习笔记.pdf')).toBe('notes');
    expect(detectNotesDocument('Episode 2 笔记.pdf')).toBe('notes');
  });

  it('文件名含 notes（不区分大小写）→ notes', () => {
    expect(detectNotesDocument('Episode_2_Notes.pdf')).toBe('notes');
    expect(detectNotesDocument('episode2-NOTES.pdf')).toBe('notes');
  });

  it('仅文件名判断：Episode_2.pdf 无内容文本时 → source', () => {
    expect(detectNotesDocument('Episode_2.pdf')).toBe('source');
    expect(detectNotesDocument('Episode_2.pdf', null)).toBe('source');
  });

  it('内容命中 ≥2 个关键词 → notes', () => {
    const text = '一、导语\n二、重难点单词短语总结\n用法总结';
    expect(detectNotesDocument('Episode_2.pdf', text)).toBe('notes');
  });

  it('内容仅命中 1 个关键词 → source', () => {
    expect(detectNotesDocument('Episode_2.pdf', '本集导语：关于时间表达')).toBe('source');
  });

  it('对照文本（0 命中）→ source', () => {
    const text = "Hello English Learners, welcome back to English pod. My name is Marco and I'm Erica.";
    expect(detectNotesDocument('Episode_2_中英文对照_.pdf', text)).toBe('source');
  });

  it('真实学习笔记样例文本 → notes', () => {
    const text =
      '制作BY：公众号青木城\n一、导语\n《职场必备：如何优雅地申请延期？》\n二、重难点单词短语总结\n英文 中文 用法总结 例句';
    expect(detectNotesDocument('Episode_2.pdf', text)).toBe('notes');
  });

  it('txt/srt 等非 PDF 同样适用文件名规则', () => {
    expect(detectNotesDocument('notes.txt')).toBe('notes');
  });
});

describe('episodeKeyOf / nameMatches（集数归一化）', () => {
  it('验收样例：四个文件归为同一集 ep2', () => {
    const names = ['Episode_2.pdf', 'Episode_2_中英文对照_.pdf', 'Episode_2_中文字幕_.srt', 'Episode_2__英文字幕_.srt'];
    const keys = names.map((n) => episodeKeyOf(n));
    expect(new Set(keys)).toEqual(new Set(['ep2']));
  });

  it('空格/下划线/中缀变体同样归组', () => {
    expect(episodeKeyOf('Episode 2.mp3')).toBe('ep2');
    expect(episodeKeyOf('ep2.txt')).toBe('ep2');
    expect(episodeKeyOf('第2集.srt')).toBe('ep2');
  });

  it('episode1 与 episode10-13 不互配', () => {
    expect(episodeKeyOf('episode23.srt')).toBe('ep23');
    expect(episodeKeyOf('Episode 213 .mp3')).toBe('ep213');
    expect(nameMatches('episode1.pdf', 'episode10.pdf')).toBe(false);
  });

  it('nameMatches：同集跨后缀成立，跨集不成立', () => {
    expect(nameMatches('Episode_2.pdf', 'Episode_2_中英文对照_.pdf')).toBe(true);
    expect(nameMatches('Episode_2_中文字幕_.srt', 'Episode_2__英文字幕_.srt')).toBe(true);
    expect(nameMatches('Episode_2.pdf', 'Episode_3_中英文对照_.pdf')).toBe(false);
  });

  it('normalizeNameForMatch 剥离后缀词', () => {
    expect(normalizeNameForMatch('Episode_2_中文字幕_.srt')).toBe('episode2');
    // 「中英文对照」不在剥离表（与既有 API 行为一致）；同集匹配由 episodeKeyOf 兜底
    expect(normalizeNameForMatch('Episode 19（中英文对照）.pdf')).toBe('episode19中');
  });
});
