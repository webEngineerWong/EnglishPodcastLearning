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
