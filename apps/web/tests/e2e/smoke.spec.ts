import { expect, test } from '@playwright/test';

test.describe('学习平台冒烟', () => {
  test('Dashboard 加载并显示统计', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '学习台' })).toBeVisible();
    await expect(page.getByText('累计学习')).toBeVisible();
  });

  test('课程列表加载', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { name: '课程' })).toBeVisible();
    await expect(page.getByPlaceholder('搜索课程…')).toBeVisible();
  });

  test('导入中心加载', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByText('上传文件')).toBeVisible();
  });

  test('课程详情：播放器与双语正文（需种子数据）', async ({ page }) => {
    const res = await page.request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/courses?limit=50`);
    const data = (await res.json()) as { items: { id: string; title: string }[] };
    const target = data.items.find((c) => c.title.includes('EP1'));
    test.skip(!target, '缺少演示课程（先 pnpm db:seed）');
    await page.goto(`/courses/${target!.id}`);
    await expect(page.getByText('Hello English learners')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'seek' })).toBeVisible();
  });

  test('课程详情：有学习笔记时出现「学习笔记」标签并可预览（需种子数据）', async ({ page }) => {
    const res = await page.request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/courses?limit=50`);
    const data = (await res.json()) as { items: { id: string; title: string }[] };
    const target = data.items.find((c) => c.title.includes('EP1'));
    test.skip(!target, '缺少演示课程（先 pnpm db:seed）');
    await page.goto(`/courses/${target!.id}`);
    await expect(page.getByRole('tab', { name: '学习笔记' })).toBeVisible();
    await page.getByRole('tab', { name: '学习笔记' }).click();
    // iframe 内嵌 PDF（/api/documents/:id/file）
    const frame = page.locator('iframe[src*="/api/documents/"]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('src', /#view=FitH/);
  });

  test('课程详情：?tab=notes 直达笔记标签，无笔记课程不显示该标签（需种子数据）', async ({ page }) => {
    const res = await page.request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/courses?limit=50`);
    const data = (await res.json()) as { items: { id: string; title: string }[] };
    const withNotes = data.items.find((c) => c.title.includes('EP1'));
    const withoutNotes = data.items.find((c) => c.title.includes('EP2'));
    test.skip(!withNotes || !withoutNotes, '缺少演示课程（先 pnpm db:seed）');
    // URL 参数直达
    await page.goto(`/courses/${withNotes!.id}?tab=notes`);
    await expect(page.locator('iframe[src*="/api/documents/"]')).toBeVisible();
    // 无笔记课程：标签不出现
    await page.goto(`/courses/${withoutNotes!.id}`);
    await expect(page.getByRole('tab', { name: '学习笔记' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '实时字幕' })).toBeVisible();
  });

  test('API 健康检查', async ({ request }) => {
    const res = await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/users/me`);
    expect(res.ok()).toBeTruthy();
  });
});
