#!/usr/bin/env node
/**
 * check:ui —— UI 规范守门脚本
 * 扫描 apps/web/src、apps/desktop/src、packages/ui/src、packages/player/src 下的 .ts/.tsx/.css：
 *  1. Emoji / Unicode 符号图标（"·—…×" 纯排版符号除外）
 *  2. Tailwind 调色板颜色类（red-500 之类）
 *  3. bg-white / bg-black / text-white / text-black
 *  4. #hex / rgb( / hsl( 字面量（hsl(var(--token)) 合法；tokens.css 除外）
 *  5. lucide-react 之外的图标库
 *  6. 页面文件直接 import lucide-react（必须走 @elp/icons 封装）
 * 命中即报错并打印 文件:行号，退出码 1。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const ROOTS = ['apps/web/src', 'apps/desktop/src', 'packages/ui/src', 'packages/player/src'];
const EXTS = ['.ts', '.tsx', '.css'];
const ALLOWED_FILES = new Set(['packages/ui/src/styles/tokens.css']);

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const SYMBOL_RE = /[\u2190-\u21FF\u25A0-\u25FF\u2600-\u27BF\u2B50\u2B06\u2B07]/;
const PALETTE_CLASS_RE =
  /\b(text|bg|border|ring|fill|stroke|from|to|via|divide|outline)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/;
const WHITE_BLACK_RE = /\b(bg|text|border|ring)-(white|black)\b/;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RGB_RE = /\brgb\((?!var\()/;
const HSL_RE = /\bhsl\((?!var\()/;
const OTHER_ICON_LIB_RE = /from '(react-icons|@heroicons|@mui\/icons-material|phosphor-react|@phosphor-icons\/react|@expo\/vector-icons)'/;
const LUCIDE_IMPORT_RE = /from 'lucide-react'/;

// 纯排版符号，不算图标
const TYPOGRAPHY = new Set(['\u00B7', '\u2014', '\u2026', '\u00D7']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.some((e) => entry.endsWith(e))) yield full;
  }
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file).replaceAll('\\', '/');
    if (ALLOWED_FILES.has(rel)) continue;
    const lines = readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      const report = (rule, matched) => violations.push(`${rel}:${i + 1}  [${rule}]  ${matched}`);

      // 1. Emoji / 符号图标（去掉纯排版符号后检测）
      const stripped = [...line].filter((ch) => !TYPOGRAPHY.has(ch)).join('');
      if (EMOJI_RE.test(stripped)) report('emoji/pictographic', line.trim().slice(0, 90));
      else if (SYMBOL_RE.test(stripped)) report('unicode-symbol', line.trim().slice(0, 90));

      // 2. Tailwind 调色板类
      const m2 = line.match(PALETTE_CLASS_RE);
      if (m2) report('palette-color-class', m2[0]);

      // 3. white/black
      const m3 = line.match(WHITE_BLACK_RE);
      if (m3) report('white-black-class', m3[0]);

      // 4. 颜色字面量
      const m4 = line.match(HEX_RE);
      if (m4) report('hex-literal', m4[0]);
      const m5 = line.match(RGB_RE);
      if (m5) report('rgb-literal', line.trim().slice(0, 90));
      const m6 = line.match(HSL_RE);
      if (m6) report('hsl-literal', line.trim().slice(0, 90));

      // 5. 其它图标库
      if (OTHER_ICON_LIB_RE.test(line)) report('other-icon-library', line.trim().slice(0, 90));

      // 6. 直接 import lucide-react
      if (LUCIDE_IMPORT_RE.test(line)) report('direct-lucide-import', line.trim().slice(0, 90));
    });
  }
}

if (violations.length > 0) {
  console.error(`\n✗ check:ui 发现 ${violations.length} 处违规：\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('');
  process.exit(1);
}
console.log('✓ check:ui 通过：无违规（0 emoji、0 调色板类、0 white/black、0 颜色字面量、0 非 lucide 图标库、0 直接 lucide 导入）');
