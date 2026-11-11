import { BadRequestException, Body, Controller, Delete, Get, Inject, Injectable, Logger, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadedFiles, UseInterceptors } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.module';
import { UserResolver } from '../common/current-user';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.tokens';
import type { StorageService } from '../storage/storage.interface';
import { ParserClient } from './parser-client';
import {
  assignTimestampsFromSrt,
  isChineseDominant,
  mergeSrtCuesToParagraphs,
  parseSrt,
  rollingLinesToSegments,
  rollingSrtToLines,
  splitIntoSentences,
  type SrtCue
} from '@elp/learning-core';

const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB ?? 200) || 200) * 1024 * 1024;

type ImportFileKind = 'pdf' | 'txt' | 'srt' | 'mp3' | 'mp4' | 'wav' | 'm4a';
const AUDIO_KINDS: ImportFileKind[] = ['mp3', 'mp4', 'wav', 'm4a'];

function kindOf(name: string): ImportFileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt') return 'txt';
  if (ext === 'srt') return 'srt';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'mp4') return 'mp4';
  if (ext === 'wav') return 'wav';
  if (ext === 'm4a') return 'm4a';
  return null;
}

function normalizeName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[（(]/g, '')
    .replace(/[）)]/g, '')
    .replace(/[\s_.-]+/g, '')
    .replace(/对照文本|对照|翻译|文本|字幕|英文|中文|配套音频|音频|学习笔记/g, '')
    .toLowerCase();
}

export interface DraftParagraph {
  order: number;
  type: 'PARAGRAPH' | 'HEADING';
  textEn?: string | null;
  textZh?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence: number;
  warnings?: string[];
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  reviewStatus: 'PENDING' | 'EDITED' | 'CONFIRMED';
  timestampConfidence?: number | null;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger('ImportService');
  constructor(
    private prisma: PrismaService,
    private users: UserResolver,
    private parser: ParserClient,
    @Inject(STORAGE_SERVICE_TOKEN) private storage: StorageService
  ) {}

  /** 建任务并存文件，立即返回；解析在后台异步执行 */
  async createJob(files: Express.Multer.File[], name?: string) {
    const { id: userId } = await this.users.userForRequest();
    if (!files.length) throw new BadRequestException('未选择任何文件');

    const job = await this.prisma.importJob.create({
      data: { name: name ?? files[0].originalname.slice(0, 60), status: 'PENDING', createdById: userId, totalFiles: files.length },
      include: { files: true }
    });

    for (const f of files) {
      const kind = kindOf(f.originalname);
      if (!kind) throw new BadRequestException(`不支持的文件类型: ${f.originalname}`);
      if (f.size > MAX_BYTES) throw new BadRequestException(`${f.originalname} 超过大小限制`);

      const sha256 = createHash('sha256').update(f.buffer).digest('hex');
      const date = new Date().toISOString().slice(0, 10);
      const rand = Math.random().toString(36).slice(2, 8);
      const key = `imports/${date}/${Date.now()}-${rand}-${f.originalname.replace(/[^\w.\-\u4e00-\u9fff]/g, '_')}`;
      await this.storage.upload(f.buffer, key, f.mimetype || 'application/octet-stream');

      // 重复文件检测：同名同哈希曾经导入过
      const dup = await this.prisma.importFile.findFirst({ where: { sha256, status: { in: ['PARSED', 'MATCHED', 'PARSING'] } }, select: { id: true } });

      await this.prisma.importFile.create({
        data: {
          jobId: job.id,
          kind,
          originalName: f.originalname,
          storageKey: key,
          sha256,
          sizeBytes: f.size,
          status: dup ? 'DUPLICATE' : 'PENDING',
          error: dup ? `与已导入文件重复 (file ${dup.id})` : null
        }
      });
    }

    // 后台解析（不阻塞请求）
    void this.processJob(job.id).catch((e) => console.error('processJob fatal', e));
    return this.getJob(job.id);
  }

  /** 后台任务：逐文件解析；文本文件之间做 SRT 匹配、MP3 文件名匹配 */
  async processJob(jobId: string): Promise<void> {
    await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
    const files = await this.prisma.importFile.findMany({ where: { jobId, status: { in: ['PENDING'] } }, orderBy: { createdAt: 'asc' } });

    for (const f of files) {
      try {
        await this.prisma.importFile.update({ where: { id: f.id }, data: { status: 'PARSING' } });
        if (AUDIO_KINDS.includes(f.kind)) {
          // 音频文件等待文本文件解析完成后做名称匹配（见 matchMedia）
          await this.prisma.importFile.update({ where: { id: f.id }, data: { status: 'PENDING' } });
          continue;
        }
        if (f.kind === 'pdf') {
          const localPath = await this.fetchToLocal(f.storageKey, f.originalName);
          const parsed = await this.parser.parsePdf(localPath);
          const draft: { paragraphs: DraftParagraph[]; meta: Record<string, unknown> } = {
            paragraphs: parsed.paragraphs.map((p, i) => ({
              order: i,
              type: p.type,
              textEn: p.textEn ?? null,
              textZh: p.textZh ?? null,
              pageStart: p.pageStart ?? null,
              pageEnd: p.pageEnd ?? null,
              confidence: p.confidence,
              warnings: p.warnings ?? [],
              startTimeMs: null,
              endTimeMs: null,
              reviewStatus: 'PENDING' as const,
              timestampConfidence: null
            })),
            meta: { parser: 'pymupdf', ...(parsed.meta ?? {}), needsOcr: parsed.needsOcr ?? [] }
          };
          await this.prisma.importFile.update({
            where: { id: f.id },
            data: { status: 'PARSED', paragraphCount: draft.paragraphs.length, parsedJson: draft as object, error: null }
          });
          await fs.promises.rm(localPath, { force: true });
        } else if (f.kind === 'txt') {
          const buf = await this.storage.getStream(f.storageKey).then(streamToBuffer);
          const draft = this.parseTxt(buf.toString('utf-8'));
          await this.prisma.importFile.update({
            where: { id: f.id },
            data: { status: 'PARSED', paragraphCount: draft.paragraphs.length, parsedJson: draft as object, error: null }
          });
        } else if (f.kind === 'srt') {
          const buf = await this.storage.getStream(f.storageKey).then(streamToBuffer);
          const draft = this.parseSrtDraft(buf.toString('utf-8'));
          await this.prisma.importFile.update({
            where: { id: f.id },
            data: { status: 'PARSED', paragraphCount: draft.paragraphs.length, parsedJson: draft as object, error: null }
          });
        }
      } catch (e) {
        await this.prisma.importFile.update({
          where: { id: f.id },
          data: { status: 'FAILED', error: e instanceof Error ? e.message : String(e) }
        });
      }
    }

    await this.matchMedia(jobId);

    const total = await this.prisma.importFile.count({ where: { jobId } });
    const failedTotal = await this.prisma.importFile.count({ where: { jobId, status: 'FAILED' } });
    const status = failedTotal === 0 ? 'REVIEWING' : failedTotal === total ? 'FAILED' : 'PARTIALLY_FAILED';
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status, processedFiles: total - failedTotal, failedFiles: failedTotal }
    });
  }

  /** 文件名匹配 + 双语字幕合成：PDF 用英文字幕对时间轴；纯字幕任务合成双语段落 */
  private async matchMedia(jobId: string) {
    const [texts, audios, srts] = await Promise.all([
      this.prisma.importFile.findMany({ where: { jobId, kind: { in: ['pdf', 'txt'] }, status: { in: ['PARSED', 'MATCHED'] } } }),
      this.prisma.importFile.findMany({ where: { jobId, kind: { in: ['mp3', 'm4a', 'wav', 'mp4'] } } }),
      this.prisma.importFile.findMany({ where: { jobId, kind: 'srt' } })
    ]);

    type SrtDraft = { paragraphs: DraftParagraph[]; meta?: Record<string, unknown> };
    const draftOf = new Map<string, SrtDraft>();
    const langOf = new Map<string, 'en' | 'zh' | 'mixed'>();

    // 1) 确保每个 SRT 已解析并判定语言（重复导入的文件同样参与合成）
    for (const s of srts) {
      const existing = s.parsedJson as unknown as SrtDraft | null;
      if (existing?.paragraphs?.length) {
        draftOf.set(s.id, existing);
        langOf.set(s.id, (existing.meta?.language as 'en' | 'zh' | 'mixed') ?? 'mixed');
        continue;
      }
      if (['PENDING', 'PARSING', 'DUPLICATE'].includes(s.status)) {
        try {
          const buf = await this.storage.getStream(s.storageKey).then(streamToBuffer);
          const draft = this.parseSrtDraft(buf.toString('utf-8'));
          draftOf.set(s.id, draft);
          langOf.set(s.id, (draft.meta.language as 'en' | 'zh' | 'mixed') ?? 'mixed');
          await this.prisma.importFile.update({
            where: { id: s.id },
            data: { status: 'PARSED', paragraphCount: draft.paragraphs.length, parsedJson: draft as object, error: null }
          });
        } catch (e) {
          await this.prisma.importFile.update({ where: { id: s.id }, data: { status: 'FAILED', error: e instanceof Error ? e.message : String(e) } });
        }
      }
    }

    const nameMatch = (a: string, b: string) => {
      const nA = normalizeName(a);
      const nB = normalizeName(b);
      return Boolean(nA && nB && (nA === nB || nA.includes(nB) || nB.includes(nA)));
    };

    // 2) PDF/TXT：用英文（或 mixed）SRT 给段落对时间轴
    for (const t of texts) {
      const enSrt = srts.find((s) => ['en', 'mixed'].includes(langOf.get(s.id) ?? '') && nameMatch(s.originalName, t.originalName));
      if (enSrt && draftOf.get(enSrt.id)) {
        await this.applySrtTimestamps(t.id, enSrt.id);
        await this.prisma.importFile.update({ where: { id: enSrt.id }, data: { status: 'MATCHED' } });
        await this.prisma.importFile.update({ where: { id: t.id }, data: { status: 'MATCHED' } }).catch(() => undefined);
      }
    }

    // 3) 纯字幕双语合成：同名英文 SRT + 中文 SRT（+ 可选同名音频）→ 双语段落写入英文 SRT 的 draft
    for (const enS of srts.filter((s) => (langOf.get(s.id) ?? '') === 'en')) {
      const zhS = srts.find((s) => (langOf.get(s.id) ?? '') === 'zh' && nameMatch(s.originalName, enS.originalName));
      if (!zhS || !draftOf.get(enS.id) || !draftOf.get(zhS.id)) continue;
      const audio = audios.find((a) => nameMatch(a.originalName, enS.originalName));
      const bilingual = this.buildBilingualFromSrts(draftOf.get(enS.id)!, draftOf.get(zhS.id)!);
      const enMeta = draftOf.get(enS.id)!.meta ?? {};
      const meta = { ...enMeta, synthesized: 'bilingual', zhSource: zhS.originalName, audioMatched: Boolean(audio) };
      await this.prisma.importFile.update({
        where: { id: enS.id },
        data: { status: 'MATCHED', paragraphCount: bilingual.length, parsedJson: { paragraphs: bilingual, meta } as object }
      });
      await this.prisma.importFile.update({ where: { id: zhS.id }, data: { status: 'MATCHED' } });
      if (audio) await this.prisma.importFile.update({ where: { id: audio.id }, data: { status: 'MATCHED' } });
    }

    // 4) 音频兜底匹配：任何未匹配音频与同 norm 的 pdf/txt/英文SRT 配对
    for (const a of audios.filter((x) => !['MATCHED', 'FAILED'].includes(x.status))) {
      const partner = [...texts, ...srts.filter((s) => ['en', 'mixed'].includes(langOf.get(s.id) ?? ''))].find((t) =>
        nameMatch(t.originalName, a.originalName)
      );
      if (partner) await this.prisma.importFile.update({ where: { id: a.id }, data: { status: 'MATCHED' } });
    }
  }

  /**
   * 双语字幕合成（行级配对 + 重新聚段）：
   * 英/中字幕都是同一音频的滚动字幕，行级时间真实。以英文行为主轴，
   * 找时间重叠 ≥60% 的中文行配对；再按句末标点（或 12s 上限）重新聚成双语段落。
   * 未配对行保留并标记，不静默丢弃；时间戳全部来自 SRT 真实值。
   */
  private buildBilingualFromSrts(enDraft: { paragraphs: DraftParagraph[]; meta?: Record<string, unknown> }, zhDraft: { paragraphs: DraftParagraph[]; meta?: Record<string, unknown> }): DraftParagraph[] {
    type RawLine = { text: string; startMs: number; endMs: number };
    const fromDraft = (d: { paragraphs: DraftParagraph[]; meta?: Record<string, unknown> }, key: 'textEn' | 'textZh'): RawLine[] => {
      const raw = d.meta?.rawLines as RawLine[] | undefined;
      if (raw?.length) return raw;
      return d.paragraphs
        .filter((p) => typeof p.startTimeMs === 'number' && p[key])
        .map((p) => ({ text: (p[key] ?? '') as string, startMs: p.startTimeMs!, endMs: p.endTimeMs ?? p.startTimeMs! }));
    };
    const enLines = fromDraft(enDraft, 'textEn');
    const zhLines = fromDraft(zhDraft, 'textZh');

    interface Pair {
      textEn: string | null;
      textZh: string | null;
      startMs: number;
      endMs: number;
    }
    const pairs: Pair[] = [];
    const usedZh = new Set<number>();
    for (const e of enLines) {
      let best = -1;
      let bestOverlap = 0;
      zhLines.forEach((z, i) => {
        if (usedZh.has(i)) return;
        const ov = Math.min(e.endMs, z.endMs) - Math.max(e.startMs, z.startMs);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          best = i;
        }
      });
      const eLen = Math.max(1, e.endMs - e.startMs);
      if (best >= 0 && bestOverlap / eLen >= 0.6) {
        usedZh.add(best);
        pairs.push({ textEn: e.text, textZh: zhLines[best].text, startMs: e.startMs, endMs: e.endMs });
      } else {
        pairs.push({ textEn: e.text, textZh: null, startMs: e.startMs, endMs: e.endMs });
      }
    }
    for (let i = 0; i < zhLines.length; i++) {
      if (usedZh.has(i)) continue;
      pairs.push({ textEn: null, textZh: zhLines[i].text, startMs: zhLines[i].startMs, endMs: zhLines[i].endMs });
    }
    pairs.sort((a, b) => a.startMs - b.startMs);

    // 聚段：句末标点或 12s 上限
    const out: DraftParagraph[] = [];
    let buf: Pair[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      const textEn =
        buf
          .map((x) => x.textEn)
          .filter(Boolean)
          .join(' ')
          .trim() || null;
      const textZh =
        buf
          .map((x) => x.textZh)
          .filter(Boolean)
          .join('\n')
          .trim() || null;
      out.push({
        order: 0,
        type: 'PARAGRAPH',
        textEn,
        textZh,
        startTimeMs: buf[0].startMs,
        endTimeMs: buf[buf.length - 1].endMs,
        confidence: textEn && textZh ? 0.85 : 0.6,
        warnings: textEn && !textZh ? ['no_zh_match'] : !textEn ? ['zh_only'] : [],
        reviewStatus: 'PENDING',
        timestampConfidence: 1
      });
      buf = [];
    };
    for (const p of pairs) {
      buf.push(p);
      const last = p.textEn ?? p.textZh ?? '';
      const dur = p.endMs - buf[0].startMs;
      if (/[.!?。！？]["')\]]?\s*$/.test(last) || dur > 12000) flush();
    }
    flush();
    out.forEach((p, i) => (p.order = i));
    return out;
  }

  /** 用 SRT 给 PDF/TXT 草稿段落分配真实时间戳（绝不伪造：低置信度保持 null） */
  private async applySrtTimestamps(textFileId: string, srtFileId: string) {
    const [textFile, srtFile] = await Promise.all([
      this.prisma.importFile.findUnique({ where: { id: textFileId } }),
      this.prisma.importFile.findUnique({ where: { id: srtFileId } })
    ]);
    if (!textFile?.parsedJson || !srtFile?.parsedJson) return;

    const textDraft = textFile.parsedJson as unknown as { paragraphs: DraftParagraph[]; meta: Record<string, unknown> };
    const srtDraft = srtFile.parsedJson as unknown as { paragraphs: DraftParagraph[]; meta?: { rawLines?: { text: string; startMs: number; endMs: number }[] } };
    // 优先使用行级 rawLines（滚动字幕最细对齐单元），否则退回合并段落
    const raw = srtDraft.meta?.rawLines;
    this.logger.log(`applySrt: textFile=${textFileId} srtFile=${srtFileId} rawLines=${raw?.length ?? 'none'} paras=${textDraft.paragraphs.length}`);
    // rawLines 字段为 startMs/endMs；draft 段落为 startTimeMs/endTimeMs —— 统一读取
    const cueSource = (raw && raw.length > 0 ? raw : srtDraft.paragraphs) as Array<{
      startTimeMs?: number | null;
      endTimeMs?: number | null;
      startMs?: number;
      endMs?: number;
      text?: string;
      textEn?: string | null;
      textZh?: string | null;
    }>;
    const cues: SrtCue[] = cueSource
      .filter((p) => typeof (p.startTimeMs ?? p.startMs) === 'number')
      .map((p, i) => {
        const s = (p.startTimeMs ?? p.startMs)!;
        const e = (p.endTimeMs ?? p.endMs) ?? s;
        return { index: i, startMs: s, endMs: e, text: p.text ?? p.textEn ?? p.textZh ?? '' };
      });

    const paragraphs = textDraft.paragraphs.map((p) => ({ textEn: p.textEn ?? '' }));
    const hints = assignTimestampsFromSrt(paragraphs, cues, { minSimilarity: 0.15 });

    const assigned = hints.filter(Boolean).length;
    this.logger.log(`applySrt: assigned=${assigned}/${hints.length}`);
    textDraft.paragraphs = textDraft.paragraphs.map((p, i) => {
      const h = hints[i];
      if (!h) return p;
      return { ...p, startTimeMs: h.startMs, endTimeMs: h.endMs, timestampConfidence: h.confidence };
    });
    await this.prisma.importFile.update({ where: { id: textFileId }, data: { parsedJson: textDraft as object } });
  }

  private async fetchToLocal(storageKey: string, originalName: string): Promise<string> {
    const tmpDir = '/tmp/elp-parser';
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const localPath = path.join(tmpDir, `${Date.now()}-${originalName.replace(/[^\w.-]/g, '_')}`);
    const stream = await this.storage.getStream(storageKey);
    const buf = await streamToBuffer(stream);
    await fs.promises.writeFile(localPath, buf);
    return localPath;
  }

  /** TXT：连续非空行聚合为段落；英文/中文分列 */
  private parseTxt(content: string): { paragraphs: DraftParagraph[]; meta: Record<string, unknown> } {
    const paragraphs: DraftParagraph[] = [];
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let bufEn: string[] = [];
    let bufZh: string[] = [];
    const flush = () => {
      const textEn = bufEn.join(' ').trim() || null;
      const textZh = bufZh.join('\n').trim() || null;
      bufEn = [];
      bufZh = [];
      if (textEn || textZh) {
        paragraphs.push({
          order: paragraphs.length,
          type: 'PARAGRAPH',
          textEn,
          textZh,
          confidence: textEn && textZh ? 0.9 : 0.6,
          warnings: textEn && !textZh ? ['missing_translation'] : [],
          startTimeMs: null,
          endTimeMs: null,
          reviewStatus: 'PENDING' as const,
          timestampConfidence: null
        });
      }
    };
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        flush();
        continue;
      }
      if (isChineseDominant(t)) bufZh.push(t);
      else bufEn.push(t);
    }
    flush();
    return { paragraphs, meta: { parser: 'txt-internal' } };
  }

  /** SRT 草稿：滚动字幕行级去重 → 句子段；普通字幕则退回合并逻辑，保留真实时间戳 */
  private parseSrtDraft(content: string): { paragraphs: DraftParagraph[]; meta: Record<string, unknown> } {
    const cues = parseSrt(content);
    // 判定滚动字幕：连续 cue 文本重复率高（行级重叠）
    const sample = cues.slice(0, 40);
    let overlapPairs = 0;
    for (let i = 1; i < sample.length; i++) {
      const a = new Set(sample[i - 1].text.split('\n').map((l) => l.trim()).filter(Boolean));
      const b = sample[i].text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (b.some((line) => a.has(line) && line.length > 3)) overlapPairs++;
    }
    const isRolling = cues.length > 20 && overlapPairs / Math.max(1, sample.length - 1) > 0.4;
    const effective: SrtCue[] = isRolling ? rollingLinesToSegments(rollingSrtToLines(cues)) : mergeSrtCuesToParagraphs(cues, 1200);
    const merged = effective;
    // 行级 cue：滚动字幕的最细对齐单元，供时间戳分配使用
    const rawLines = isRolling ? rollingSrtToLines(cues) : undefined;
    const paragraphs: DraftParagraph[] = merged.map((c) => {
      const lines = c.text.split('\n');
      const enLines = lines.filter((l) => !isChineseDominant(l));
      const zhLines = lines.filter((l) => isChineseDominant(l));
      return {
        order: 0,
        type: 'PARAGRAPH' as const,
        textEn: enLines.join(' ').trim() || null,
        textZh: zhLines.join('\n').trim() || null,
        confidence: 1,
        warnings: [],
        startTimeMs: c.startMs,
        endTimeMs: c.endMs,
        reviewStatus: 'PENDING' as const,
        timestampConfidence: 1
      };
    });
    paragraphs.forEach((p, i) => (p.order = i));
    return { paragraphs, meta: { parser: 'srt-internal', cues: cues.length, rolling: isRolling, segments: effective.length, rawLines,
      language: (() => {
        const zhLineCount = paragraphs.filter((p) => p.textZh && isChineseDominant(p.textZh)).length;
        return paragraphs.length && zhLineCount / paragraphs.length > 0.5 ? 'zh' : paragraphs.some((p) => p.textEn && p.textZh) ? 'mixed' : 'en';
      })() } };
  }

  /** 正式课程（TranscriptParagraph）时间戳修正：仅允许显式传值 */
  async updatePublishedParagraph(paragraphId: string, input: { startTimeMs?: number | null; endTimeMs?: number | null }) {
    const existing = await this.prisma.transcriptParagraph.findUnique({ where: { id: paragraphId } });
    if (!existing) throw new NotFoundException(`Paragraph ${paragraphId} not found`);
    const data: Record<string, unknown> = { reviewStatus: 'EDITED' };
    if (input.startTimeMs !== undefined) data.startTimeMs = input.startTimeMs;
    if (input.endTimeMs !== undefined) data.endTimeMs = input.endTimeMs;
    const updated = await this.prisma.transcriptParagraph.update({ where: { id: paragraphId }, data });
    return {
      id: updated.id,
      startTimeMs: updated.startTimeMs,
      endTimeMs: updated.endTimeMs,
      reviewStatus: updated.reviewStatus
    };
  }

  // ---------- 查询 ----------
  async listJobs(query?: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const where = query?.status ? { status: query.status as 'RUNNING' | 'REVIEWING' | 'COMPLETED' | 'FAILED' | 'PARTIALLY_FAILED' | 'PENDING' } : {};
    const [rows, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { files: { orderBy: { createdAt: 'asc' } } }
      }),
      this.prisma.importJob.count({ where })
    ]);
    return { items: rows, total, page, limit };
  }

  async getJob(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id }, include: { files: { orderBy: { createdAt: 'asc' } } } });
    if (!job) throw new NotFoundException(`ImportJob ${id} not found`);
    return job;
  }

  async getFileDraft(fileId: string): Promise<{ file: unknown; paragraphs: DraftParagraph[]; meta: Record<string, unknown> }> {
    const f = await this.prisma.importFile.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException(`ImportFile ${fileId} not found`);
    const draft = (f.parsedJson as unknown as { paragraphs?: DraftParagraph[]; meta?: Record<string, unknown> }) ?? { paragraphs: [], meta: {} };
    return { file: f, paragraphs: draft.paragraphs ?? [], meta: draft.meta ?? {} };
  }

  async retryFile(jobId: string, fileId: string) {
    await this.prisma.importFile.update({ where: { id: fileId, jobId }, data: { status: 'PENDING', error: null } });
    void this.processJob(jobId).catch(() => undefined);
    return this.getJob(jobId);
  }

  async deleteJob(id: string) {
    const files = await this.prisma.importFile.findMany({ where: { jobId: id }, select: { storageKey: true } });
    await this.prisma.importJob.delete({ where: { id } });
    for (const f of files) await this.storage.delete(f.storageKey);
    return { deleted: true };
  }

  // ---------- 校对操作（操作 ImportFile.parsedJson 草稿） ----------
  private async loadDraft(fileId: string) {
    const f = await this.prisma.importFile.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException(`ImportFile ${fileId} not found`);
    const draft = (f.parsedJson as unknown as { paragraphs: DraftParagraph[]; meta: Record<string, unknown> }) ?? { paragraphs: [], meta: {} };
    if (!draft.paragraphs) draft.paragraphs = [];
    return { f, draft };
  }

  private async saveDraft(fileId: string, draft: { paragraphs: DraftParagraph[]; meta: Record<string, unknown> }) {
    draft.paragraphs.forEach((p, i) => (p.order = i));
    await this.prisma.importFile.update({ where: { id: fileId }, data: { paragraphCount: draft.paragraphs.length, parsedJson: draft as object } });
    return draft.paragraphs;
  }

  async updateParagraph(fileId: string, index: number, input: Partial<DraftParagraph>) {
    const { draft } = await this.loadDraft(fileId);
    const p = draft.paragraphs[index];
    if (!p) throw new NotFoundException(`Paragraph index ${index} not found`);
    if (input.textEn !== undefined) p.textEn = input.textEn;
    if (input.textZh !== undefined) p.textZh = input.textZh;
    if (input.startTimeMs !== undefined) p.startTimeMs = input.startTimeMs;
    if (input.endTimeMs !== undefined) p.endTimeMs = input.endTimeMs;
    if (input.type !== undefined) p.type = input.type;
    if (input.reviewStatus !== undefined) p.reviewStatus = input.reviewStatus;
    else p.reviewStatus = 'EDITED';
    await this.saveDraft(fileId, draft);
    return p;
  }

  /** 拆分：把第 index 段在句子 splitAfterIndex 之后切成两段（中英同步拆，尽量对齐） */
  async splitParagraph(fileId: string, index: number, splitAfterIndex: number) {
    const { draft } = await this.loadDraft(fileId);
    const p = draft.paragraphs[index];
    if (!p) throw new NotFoundException(`Paragraph index ${index} not found`);

    const enParts = p.textEn ? splitIntoSentences(p.textEn) : [];
    const zhParts = p.textZh ? splitIntoSentences(p.textZh) : [];
    if (enParts.length <= 1 && zhParts.length <= 1) throw new BadRequestException('该段落不足两句，无法拆分');

    const enA = enParts.slice(0, splitAfterIndex + 1).join(' ');
    const enB = enParts.slice(splitAfterIndex + 1).join(' ');
    // 中文按比例拆：优先等比例，避免错位
    const ratio = enParts.length > 1 ? (splitAfterIndex + 1) / enParts.length : 0.5;
    const zhSplit = Math.max(1, Math.min(zhParts.length - 1, Math.round(zhParts.length * ratio)));
    const zhA = zhParts.slice(0, zhSplit).join('');
    const zhB = zhParts.slice(zhSplit).join('');

    const a: DraftParagraph = { ...p, textEn: enA || null, textZh: zhA || null, confidence: 0.6, reviewStatus: 'EDITED', startTimeMs: p.startTimeMs, endTimeMs: null, warnings: ['split'] };
    const b: DraftParagraph = {
      ...p,
      textEn: enB || null,
      textZh: zhB || null,
      confidence: 0.6,
      reviewStatus: 'EDITED',
      startTimeMs: null,
      endTimeMs: p.endTimeMs,
      warnings: ['split']
    };
    draft.paragraphs.splice(index, 1, a, b);
    await this.saveDraft(fileId, draft);
    return draft.paragraphs;
  }

  async mergeParagraphs(fileId: string, indices: number[]) {
    const { draft } = await this.loadDraft(fileId);
    if (indices.length < 2) throw new BadRequestException('至少选择两段');
    const sorted = [...indices].sort((a, b) => a - b);
    // 必须连续
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) throw new BadRequestException('只允许合并连续段落');
    }
    const target = draft.paragraphs[sorted[0]];
    const rest = sorted.slice(1);
    target.textEn = [target.textEn, ...rest.map((i) => draft.paragraphs[i]?.textEn)].filter(Boolean).join(' ') || null;
    target.textZh = [target.textZh, ...rest.map((i) => draft.paragraphs[i]?.textZh)].filter(Boolean).join('\n') || null;
    target.endTimeMs = draft.paragraphs[sorted[sorted.length - 1]]?.endTimeMs ?? target.endTimeMs;
    if (target.startTimeMs == null) target.startTimeMs = draft.paragraphs[sorted[0]].startTimeMs ?? null;
    target.confidence = Math.min(target.confidence, 0.7);
    target.reviewStatus = 'EDITED';
    target.warnings = [...(target.warnings ?? []), 'merged'];
    for (const i of [...rest].reverse()) draft.paragraphs.splice(i, 1);
    await this.saveDraft(fileId, draft);
    return draft.paragraphs;
  }

  async reorderParagraph(fileId: string, index: number, direction: 'up' | 'down') {
    const { draft } = await this.loadDraft(fileId);
    const target = index + (direction === 'up' ? -1 : 1);
    if (target < 0 || target >= draft.paragraphs.length) throw new BadRequestException('无法移动');
    const tmp = draft.paragraphs[index];
    draft.paragraphs[index] = draft.paragraphs[target];
    draft.paragraphs[target] = tmp;
    await this.saveDraft(fileId, draft);
    return draft.paragraphs;
  }

  async deleteParagraph(fileId: string, index: number) {
    const { draft } = await this.loadDraft(fileId);
    if (!draft.paragraphs[index]) throw new NotFoundException(`Paragraph index ${index} not found`);
    draft.paragraphs.splice(index, 1);
    await this.saveDraft(fileId, draft);
    return draft.paragraphs;
  }

  /** 发布：每个 PARSED 文本文件生成一个正式课程（含音频与 SRT 时间戳） */
  async publishJob(
    jobId: string,
    input?: { title?: string; categoryId?: string; fileIds?: string[] }
  ) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId }, include: { files: true } });
    if (!job) throw new NotFoundException(`ImportJob ${jobId} not found`);

    // 幂等：已发布过（存在关联 DocumentAsset）的文件自动跳过
    const publishedFileIds = new Set(
      (
        await this.prisma.documentAsset.findMany({
          where: { importFileId: { in: job.files.map((f) => f.id) } },
          select: { importFileId: true }
        })
      )
        .map((d) => d.importFileId)
        .filter(Boolean)
    );
    const isPublishable = (f: { kind: string; parsedJson: unknown }) =>
      ['pdf', 'txt'].includes(f.kind) ||
      (f.kind === 'srt' && (f.parsedJson as { meta?: { synthesized?: string } } | null)?.meta?.synthesized === 'bilingual');
    const textFiles = job.files.filter(
      (f) =>
        isPublishable(f) &&
        ['PARSED', 'MATCHED'].includes(f.status) &&
        !publishedFileIds.has(f.id) &&
        (!input?.fileIds || input.fileIds.includes(f.id))
    );
    if (textFiles.length === 0) throw new BadRequestException('任务中没有可发布的已解析文本文件（或已全部发布过）');

    const { id: userId } = await this.users.userForRequest();
    const createdCourses: string[] = [];
    let lastDraftParagraphs: DraftParagraph[] = [];

    for (const tf of textFiles) {
      const { draft } = await this.loadDraft(tf.id);
      const title =
        input?.fileIds && input.fileIds.length === 1 && input.title
          ? input.title
          : cleanTitle(tf.originalName);
      const course = await this.prisma.course.create({
        data: {
          title,
          difficulty: 3,
          tags: [],
          categoryId: input?.categoryId,
          status: 'PUBLISHED',
          createdById: userId,
          sourceJobId: jobId
        }
      });

      // 原始 PDF/TXT 保留为 DocumentAsset
      await this.prisma.documentAsset.create({
        data: {
          courseId: course.id,
          kind: tf.kind === 'srt' ? 'txt' : (tf.kind as 'pdf' | 'txt' | 'srt'),
          storageKey: tf.storageKey,
          originalName: tf.originalName,
          mimeType: tf.kind === 'pdf' ? 'application/pdf' : 'text/plain',
          sizeBytes: tf.sizeBytes,
          sha256: tf.sha256,
          importFileId: tf.id
        }
      });

      // 匹配的音频 → AudioAsset
      const nT = normalizeName(tf.originalName);
      const audioFile = job.files.find((a) => AUDIO_KINDS.includes(a.kind as ImportFileKind) && a.status === 'MATCHED' && normalizeName(a.originalName) && (normalizeName(a.originalName) === nT || normalizeName(a.originalName).includes(nT) || nT.includes(normalizeName(a.originalName))));
      let audioAssetId: string | undefined;
      if (audioFile) {
        const audioAsset = await this.prisma.audioAsset.create({
          data: {
            courseId: course.id,
            storageKey: audioFile.storageKey,
            originalName: audioFile.originalName,
            mimeType: audioFile.kind === 'mp3' ? 'audio/mpeg' : audioFile.kind === 'wav' ? 'audio/wav' : audioFile.kind === 'm4a' ? 'audio/mp4' : 'video/mp4',
            sizeBytes: audioFile.sizeBytes,
            order: 0
          }
        });
        audioAssetId = audioAsset.id;
        // 音频也保留到 DocumentAsset 以便追溯（kind mp3）
        await this.prisma.documentAsset.create({
          data: {
            courseId: course.id,
            kind: audioFile.kind === 'mp4' ? 'mp4' : (audioFile.kind as 'pdf' | 'txt' | 'srt'),
            storageKey: audioFile.storageKey,
            originalName: audioFile.originalName,
            mimeType: 'audio/mpeg',
            sizeBytes: audioFile.sizeBytes,
            sha256: audioFile.sha256,
            importFileId: audioFile.id
          }
        });
      }

      // 正式 Transcript
      const transcript = await this.prisma.transcript.create({
        data: { courseId: course.id, status: 'PUBLISHED', sourceType: 'import' }
      });
      const paragraphs = draft.paragraphs;
      if (paragraphs.length) {
        await this.prisma.transcriptParagraph.createMany({
          data: paragraphs.map((p) => ({
            transcriptId: transcript.id,
            order: p.order,
            type: p.type,
            textEn: p.textEn,
            textZh: p.textZh,
            startTimeMs: p.startTimeMs ?? null,
            endTimeMs: p.endTimeMs ?? null,
            pageStart: p.pageStart ?? null,
            pageEnd: p.pageEnd ?? null,
            confidence: p.confidence,
            reviewStatus: p.reviewStatus,
            importFileId: tf.id
          }))
        });
      }
      lastDraftParagraphs = paragraphs;
      createdCourses.push(course.id);
      await this.prisma.importFile.update({ where: { id: tf.id }, data: { status: 'MATCHED' } });
    }

    await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });
    return { courseId: createdCourses[0], courseIds: createdCourses, paragraphCount: lastDraftParagraphs.length };
  }
}

function cleanTitle(filename: string): string {
  const cleaned = filename
    .replace(/\.[^.]+$/, '')
    .replace(/对照文本|对照|翻译|文本|学习笔记|配套音频|音频|字幕|英文|中文/g, '')
    .replace(/[（(]\s*[）)]|\(\s*\)/g, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || filename.replace(/\.[^.]+$/, '').trim();
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

// ---------- DTO ----------
export class PublishJobDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileIds?: string[];
}

export class UpdateParagraphDto {
  @IsOptional() @IsString() textEn?: string | null;
  @IsOptional() @IsString() textZh?: string | null;
  @IsOptional() startTimeMs?: number | null;
  @IsOptional() endTimeMs?: number | null;
  @IsOptional() @IsIn(['PARAGRAPH', 'HEADING']) type?: 'PARAGRAPH' | 'HEADING';
  @IsOptional() @IsIn(['PENDING', 'EDITED', 'CONFIRMED']) reviewStatus?: 'PENDING' | 'EDITED' | 'CONFIRMED';
}

export class SplitParagraphDto {
  /** 按第 splitAfterIndex 句（0-based）之后拆分 */
  @IsOptional() splitAfterIndex?: number;
}

export class MergeParagraphsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

export class ReorderParagraphDto {
  @IsString() id!: string;
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

// ---------- Controller ----------
@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private service: ImportService) {}

  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: 100 }], { storage: memoryStorage(), limits: { fileSize: MAX_BYTES } }))
  create(@Query('name') name?: string, @UploadedFiles() files?: { files?: Express.Multer.File[] }) {
    return this.service.createJob(files?.files ?? [], name);
  }

  @Get('jobs')
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('status') status?: string) {
    return this.service.listJobs({ page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined, status });
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.service.getJob(id);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string) {
    return this.service.deleteJob(id);
  }

  @Post('jobs/:id/files/:fileId/retry')
  retry(@Param('id') jobId: string, @Param('fileId') fileId: string) {
    return this.service.retryFile(jobId, fileId);
  }

  /** 某个文件的草稿段落（校对界面数据源） */
  @Get('files/:fileId/draft')
  draft(@Param('fileId') fileId: string) {
    return this.service.getFileDraft(fileId);
  }

  @Post('jobs/:id/publish')
  publish(@Param('id') jobId: string, @Body() dto: PublishJobDto) {
    return this.service.publishJob(jobId, dto);
  }

  // 段落校对操作：index 传草稿数组下标
  @Patch('files/:fileId/paragraphs/:index')
  updateParagraph(@Param('fileId') fileId: string, @Param('index') index: string, @Body() dto: UpdateParagraphDto) {
    return this.service.updateParagraph(fileId, Number(index), dto);
  }

  /** 正式课程段落时间戳校准（人工修正，严禁伪造） */
  @Patch('paragraphs/:paragraphId')
  async updatePublishedParagraph(@Param('paragraphId') paragraphId: string, @Body() dto: UpdateParagraphDto) {
    return this.service.updatePublishedParagraph(paragraphId, dto);
  }

  @Post('files/:fileId/paragraphs/:index/split')
  split(@Param('fileId') fileId: string, @Param('index') index: string, @Body() dto: SplitParagraphDto) {
    return this.service.splitParagraph(fileId, Number(index), dto.splitAfterIndex ?? 0);
  }

  @Post('files/:fileId/paragraphs/merge')
  merge(@Param('fileId') fileId: string, @Body() dto: MergeParagraphsDto) {
    return this.service.mergeParagraphs(fileId, dto.ids.map(Number));
  }

  @Post('files/:fileId/paragraphs/reorder')
  reorder(@Param('fileId') fileId: string, @Body() dto: ReorderParagraphDto) {
    return this.service.reorderParagraph(fileId, Number(dto.id), dto.direction);
  }

  @Delete('files/:fileId/paragraphs/:index')
  deleteParagraph(@Param('fileId') fileId: string, @Param('index') index: string) {
    return this.service.deleteParagraph(fileId, Number(index));
  }
}

@Module({
  controllers: [ImportController],
  providers: [ImportService, ParserClient, UserResolver]
})
export class ImportModule {}
