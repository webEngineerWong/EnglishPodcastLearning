/**
 * Seed：演示用户、分类、示例课程（含生成的 WAV 音频 + 双语文本 + 真实时间戳）。
 * 音频由本脚本合成（正弦波 beep 序列），无需外部媒体文件。
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/** 生成 16bit 单声道 WAV：每句对应一段有节奏的音调，便于验证"点击段落跳转播放" */
function makeBeepWav(sentenceCount: number, secPerSentence = 4): { buffer: Buffer; durationSec: number } {
  const sampleRate = 22050;
  const totalSec = sentenceCount * secPerSentence;
  const samples = sampleRate * totalSec;
  const data = Buffer.alloc(samples * 2);

  const freqs = [262, 294, 330, 349, 392, 440, 494, 523]; // C4..C5
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sentenceIdx = Math.floor(t / secPerSentence);
    const inSentenceT = t - sentenceIdx * secPerSentence;
    // 每句内部: 前 0.6s 有音调，其余静音（模拟说话节奏）
    const freq = freqs[sentenceIdx % freqs.length];
    const amp = inSentenceT < 0.6 ? 0.5 * Math.sin((2 * Math.PI * freq * t)) : 0;
    const v = Math.max(-1, Math.min(1, amp * 0.8));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return { buffer: Buffer.concat([header, data]), durationSec: totalSec };
}

const DEMO_EN = [
  'Hello English learners, and welcome back to another great lesson.',
  'My name is Marco, and today we are bringing you a very useful lesson about asking questions.',
  'Before we start, let me ask you something: do you often practice listening?',
  'Listening every day is the fastest way to improve your English.',
  'Now, let us jump into our dialogue for today.',
  'That was a great example, and I hope you can use it in real life.'
];
const DEMO_ZH = [
  '大家好，英语学习者们，欢迎回到另一节精彩的课程。',
  '我是 Marco，今天我们带来一堂非常实用的关于提问的课程。',
  '在开始之前，我想问你一个问题：你经常练习听力吗？',
  '每天练习听力是提高英语水平最快的方式。',
  '现在，让我们进入今天的对话。',
  '这是一个很好的例子，希望你在实际生活中能用上它。'
];

/** 生成一个很小的合法单页 PDF（学习笔记占位，用于验证课程页「学习笔记」标签与 iframe 预览） */
function makeNotesPdf(): Buffer {
  const lines = ['Study Notes (Demo)', '', 'Key Point 1: asking questions', 'Key Point 2: time expressions'];
  const contentLines: string[] = ['BT', '/F1 16 Tf', '60 760 Td', '18 TL'];
  lines.forEach((line, i) => {
    const text = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    contentLines.push(i === 0 ? `(${text}) Tj` : `T* (${text}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** 幂等写入演示学习笔记 PDF 资产（role = notes），旧 seed 数据也能补上 */
async function ensureNotesAsset(courseId: string) {
  const has = await prisma.documentAsset.findFirst({ where: { courseId, role: 'notes' } });
  if (has) return;
  const storageDir = path.resolve(process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), '../../data/storage'));
  const notesKey = 'documents/seed/demo-ep1-notes.pdf';
  const notesPath = path.join(storageDir, notesKey);
  fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  const notesBuffer = makeNotesPdf();
  fs.writeFileSync(notesPath, notesBuffer);
  await prisma.documentAsset.create({
    data: {
      courseId,
      kind: 'pdf',
      role: 'notes',
      storageKey: notesKey,
      originalName: 'Episode_1_学习笔记.pdf',
      mimeType: 'application/pdf',
      sizeBytes: notesBuffer.length
    }
  });
}

async function main() {
  const email = process.env.DEFAULT_USER_EMAIL ?? 'local@elp.dev';
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Local User', locale: 'zh' }
  });

  const category = await prisma.category.upsert({
    where: { name: 'Podcast' },
    update: {},
    create: { name: 'Podcast', color: '#6366f1' }
  });
  const catLearn = await prisma.category.upsert({
    where: { name: '学习方法' },
    update: {},
    create: { name: '学习方法', color: '#10b981' }
  });

  // 演示课程
  const existing = await prisma.course.findFirst({ where: { title: 'EP1 - Asking Questions（演示课程）' } });
  if (existing) {
    await ensureNotesAsset(existing.id);
    console.log('seed: 演示课程已存在，跳过');
    return;
  }

  const { buffer, durationSec } = makeBeepWav(DEMO_EN.length);
  const storageDir = path.resolve(process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), '../../data/storage'));
  const key = 'audio/seed/demo-ep1.wav';
  const fullPath = path.join(storageDir, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  const course = await prisma.course.create({
    data: {
      title: 'EP1 - Asking Questions（演示课程）',
      description: '演示课程：用于验证播放器、双语文本、时间戳联动与学习进度。',
      notes: '这是 seed 生成的演示课程。音频为合成音调，每句 4 秒。',
      difficulty: 2,
      tags: ['demo', 'podcast'],
      status: 'PUBLISHED',
      categoryId: category.id,
      createdById: user.id
    }
  });

  const audio = await prisma.audioAsset.create({
    data: {
      courseId: course.id,
      storageKey: key,
      originalName: 'demo-ep1.wav',
      mimeType: 'audio/wav',
      durationSec,
      sizeBytes: buffer.length,
      order: 0
    }
  });

  const transcript = await prisma.transcript.create({
    data: { courseId: course.id, status: 'PUBLISHED', sourceType: 'manual' }
  });

  for (let i = 0; i < DEMO_EN.length; i++) {
    await prisma.transcriptParagraph.create({
      data: {
        transcriptId: transcript.id,
        order: i,
        type: i === 0 ? 'HEADING' : 'PARAGRAPH',
        textEn: DEMO_EN[i],
        textZh: DEMO_ZH[i],
        startTimeMs: i * 4000,
        endTimeMs: (i + 1) * 4000 - 200,
        confidence: 1,
        reviewStatus: 'CONFIRMED'
      }
    });
  }

  await ensureNotesAsset(course.id);

  // 第二个无音频课程（验证无音频场景）
  await prisma.course.create({
    data: {
      title: 'EP2 - Daily Routine（演示·仅文本）',
      description: '无音频演示课程。',
      difficulty: 3,
      tags: ['demo'],
      status: 'PUBLISHED',
      categoryId: catLearn.id,
      createdById: user.id
    }
  });

  console.log(`seed done: user=${user.email} course=${course.id} audio=${audio.id} duration=${durationSec}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
