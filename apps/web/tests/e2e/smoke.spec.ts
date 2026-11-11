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

  test('API 健康检查', async ({ request }) => {
    const res = await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/users/me`);
    expect(res.ok()).toBeTruthy();
  });
});
