/** 视觉验证截图：7 路由 × 深/亮 × 1440×900 / 390×844 → docs/ui-screenshots/ */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const OUT = '../../docs/ui-screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// 取真实 id（课程 + 校对任务）
const courses = await (await fetch(`${API}/api/courses?limit=1`)).json();
const jobs = await (await fetch(`${API}/api/import/jobs?limit=1`)).json();
const courseId = courses.items[0]?.id;
const jobId = jobs.items[0]?.id;

const routes = [
  ['dashboard', '/'],
  ['courses', '/courses'],
  ['course-detail', courseId ? `/courses/${courseId}` : null],
  ['import', '/import'],
  ['import-review', jobId ? `/import/${jobId}` : null],
  ['vocabulary', '/vocabulary'],
  ['favorites', '/favorites']
].filter(([, path]) => path);

for (const theme of ['dark', 'light']) {
  for (const [w, h] of [
    [1440, 900],
    [390, 844]
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      colorScheme: theme
    });
    await ctx.addInitScript((t) => localStorage.setItem('elp-theme', t), theme);
    const page = await ctx.newPage();
    for (const [name, path] of routes) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${w}x${h}.png` });
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`screenshots: ${routes.length} routes × 2 themes × 2 viewports → ${OUT}`);
