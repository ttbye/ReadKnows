# E2E 测试文档

## 概述

E2E（端到端）测试用于测试整个应用的用户流程。本项目推荐使用以下工具之一：

- **Playwright** (推荐): 跨浏览器支持，性能好
- **Cypress**: 流行的 E2E 测试框架

## 安装 Playwright (推荐)

```bash
npm install -D @playwright/test
npx playwright install
```

## 安装 Cypress (备选)

```bash
npm install -D cypress
```

## Playwright 配置示例

创建 `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1280',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1280',
    reuseExistingServer: !process.env.CI,
  },
});
```

## E2E 测试示例

### 播放器基本功能测试

```typescript
// e2e/audiobook-player.spec.ts
import { test, expect } from '@playwright/test';

test.describe('有声小说播放器', () => {
  test('应该能够播放和暂停音频', async ({ page }) => {
    await page.goto('/audiobook/test-id');
    
    // 等待播放器加载
    await page.waitForSelector('[aria-label="播放"]');
    
    // 点击播放按钮
    await page.click('[aria-label="播放"]');
    
    // 验证播放状态
    await expect(page.locator('[aria-label="暂停"]')).toBeVisible();
    
    // 点击暂停按钮
    await page.click('[aria-label="暂停"]');
    
    // 验证暂停状态
    await expect(page.locator('[aria-label="播放"]')).toBeVisible();
  });

  test('应该能够调整进度', async ({ page }) => {
    await page.goto('/audiobook/test-id');
    
    // 等待进度条加载
    await page.waitForSelector('[aria-label="调整播放进度"]');
    
    // 拖动进度条
    const slider = page.locator('[aria-label="调整播放进度"]');
    await slider.fill('50');
    
    // 验证进度更新
    await expect(page.locator('[aria-label="当前播放时间：00:50"]')).toBeVisible();
  });

  test('应该能够切换文件', async ({ page }) => {
    await page.goto('/audiobook/test-id');
    
    // 打开播放列表
    await page.click('[aria-label="显示播放列表"]');
    
    // 等待播放列表加载
    await page.waitForSelector('[role="list"]');
    
    // 点击第二个文件
    const secondFile = page.locator('[role="listitem"]').nth(1);
    await secondFile.click();
    
    // 验证文件切换
    await expect(page.locator('[aria-current="true"]')).toBeVisible();
  });
});
```

## 运行 E2E 测试

### Playwright

```bash
# 运行所有 E2E 测试
npx playwright test

# 运行特定测试文件
npx playwright test e2e/audiobook-player.spec.ts

# 在 UI 模式下运行
npx playwright test --ui

# 在特定浏览器中运行
npx playwright test --project=chromium
```

### Cypress

```bash
# 打开 Cypress UI
npx cypress open

# 运行所有测试（无头模式）
npx cypress run
```

## 测试最佳实践

1. **使用数据属性**: 优先使用 `data-testid` 而不是 CSS 选择器
2. **等待策略**: 使用 `waitFor` 等待异步操作完成
3. **隔离测试**: 每个测试应该是独立的，不依赖其他测试
4. **清理**: 测试后清理测试数据
5. **Mock 外部服务**: 在 E2E 测试中 Mock API 调用以确保稳定性

## CI/CD 集成

在 CI/CD 中运行 E2E 测试：

```yaml
# GitHub Actions 示例
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test
```
