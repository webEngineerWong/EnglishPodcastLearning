import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单元测试只收 src；tests/e2e 归 Playwright（pnpm test:e2e）
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/**', 'node_modules/**', '.next/**']
  }
});
