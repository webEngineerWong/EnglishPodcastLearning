import { defineConfig } from '@playwright/test';

/** Web 冒烟测试：需要 API(3001) 与 Web(3000) 已启动。
 *  首次运行浏览器：pnpm exec playwright install chromium */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  webServer: undefined,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
