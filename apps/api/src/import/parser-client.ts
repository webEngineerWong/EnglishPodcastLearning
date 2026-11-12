import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Python PDF 解析器调用封装 */
export interface ParserParagraph {
  order: number;
  type: 'PARAGRAPH' | 'HEADING';
  textEn?: string | null;
  textZh?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence: number;
  warnings?: string[];
}

export interface ParserResult {
  file: { name: string; sizeBytes?: number; sha256?: string; pages?: number };
  meta: Record<string, unknown>;
  paragraphs: ParserParagraph[];
  warnings?: string[];
  needsOcr?: { page: number; reason: string }[];
}

@Injectable()
export class ParserClient {
  private readonly logger = new Logger('ParserClient');

  private findRepoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return process.cwd();
  }

  private pythonBin(): string {
    if (process.env.PDF_PARSER_PYTHON) return process.env.PDF_PARSER_PYTHON;
    const venvPython = path.join(this.findRepoRoot(), 'services/pdf-parser/.venv/bin/python');
    if (fs.existsSync(venvPython)) return venvPython;
    return 'python3';
  }

  private scriptPath(): string {
    if (process.env.PDF_PARSER_SCRIPT) return process.env.PDF_PARSER_SCRIPT;
    return path.join(this.findRepoRoot(), 'services/pdf-parser/pdf_parser.py');
  }

  /**
   * 批量解析：单 Python 进程解析多个 PDF（JSONL 输出），
   * 消除每篇一次的 Python/PyMuPDF 启动开销；部分失败不影响整批。
   */
  async parseBatch(absPaths: string[]): Promise<{ ok: boolean; input: string; result?: ParserResult; error?: string }[]> {
    return this.runJsonlBatch<{ result?: ParserResult }>(['--batch'], absPaths);
  }

  /**
   * 批量类型检测（--detect 轻量模式）：单 Python 进程提取每个 PDF 前 2 页文本，
   * 供学习笔记判定使用，不做任何解析。
   */
  async detectBatch(absPaths: string[]): Promise<{ ok: boolean; input: string; detect?: { pages: number; sampledPages: number; text: string }; error?: string }[]> {
    return this.runJsonlBatch<{ detect?: { pages: number; sampledPages: number; text: string } }>(['--batch', '--detect'], absPaths);
  }

  /** 单 Python 进程批量执行（JSONL 输出），parseBatch / detectBatch 共用 */
  private async runJsonlBatch<T>(extraArgs: string[], absPaths: string[]): Promise<({ ok: boolean; input: string; error?: string } & T)[]> {
    const script = this.scriptPath();
    if (!fs.existsSync(script)) throw new ServiceUnavailableException(`PDF parser script not found: ${script}`);
    const bin = this.pythonBin();
    const outPath = `/tmp/elp-parser/batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`;
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    const args = [script, ...extraArgs, '--out', outPath, ...absPaths];

    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(bin, args, { cwd: path.dirname(script), timeout: 300_000 });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('error', (e) => {
        stderr += String(e);
        resolve({ code: -1, stdout, stderr });
      });
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });

    const lines = (await fs.promises.readFile(outPath, 'utf-8').catch(() => '')).split('\n').filter((l) => l.trim());
    await fs.promises.rm(outPath, { force: true });
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l) as { ok: boolean; input: string; error?: string } & T;
      } catch {
        return { ok: false, input: '?', error: 'JSONL 行解析失败' } as { ok: boolean; input: string; error?: string } & T;
      }
    });
    if (parsed.length === 0) {
      throw new Error(`批量解析无输出 (exit ${result.code}): ${result.stderr.slice(0, 300)}`);
    }
    return parsed;
  }

  /** 同步调用 Python 解析器；返回结构化 JSON。失败抛错并记录 stderr。 */
  async parsePdf(absPath: string): Promise<ParserResult> {
    const script = this.scriptPath();
    if (!fs.existsSync(script)) {
      throw new ServiceUnavailableException(`PDF parser script not found: ${script}`);
    }
    const bin = this.pythonBin();
    const outPath = `${absPath}.parsed.json`;
    const args = [script, absPath, '--out', outPath];

    this.logger.log(`spawn: ${bin} ${args.join(' ')}`);
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(bin, args, { cwd: path.dirname(script), timeout: 120_000 });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('error', (e) => {
        stderr += String(e);
        resolve({ code: -1, stdout, stderr });
      });
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });

    if (result.code !== 0) {
      this.logger.error(`parser exit ${result.code}: ${result.stderr.slice(0, 500)}`);
      throw new Error(`PDF 解析失败 (exit ${result.code}): ${result.stderr.slice(0, 300) || result.stdout.slice(0, 300)}`);
    }
    const raw = await fs.promises.readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw) as ParserResult;
    // 清理临时文件
    await fs.promises.rm(outPath, { force: true });
    return parsed;
  }
}
