# 测试文档

## 测试框架

本项目使用以下测试工具：
- **Vitest**: 测试运行器和断言库
- **React Testing Library**: React 组件测试
- **jsdom**: DOM 环境模拟

## 运行测试

```bash
# 运行所有测试
npm run test

# 运行测试（监视模式）
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行测试 UI
npm run test:ui
```

## 测试结构

```
src/
├── test/
│   ├── setup.ts              # 测试环境设置
│   ├── mocks/                # Mock 工具
│   │   ├── audio.ts          # 音频 API Mock
│   │   ├── api.ts            # API Mock
│   │   └── mediaSession.ts   # Media Session API Mock
│   └── utils/
│       └── testUtils.tsx     # 测试工具函数
└── components/
    └── audiobook/
        └── __tests__/        # 组件测试
            ├── PlayerControls.test.tsx
            ├── ProgressBar.test.tsx
            ├── playerReducer.test.ts
            ├── utils.test.ts
            └── ErrorBoundary.test.tsx
```

## 编写测试

### 组件测试示例

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../../test/utils/testUtils';
import { YourComponent } from '../YourComponent';

describe('YourComponent', () => {
  it('应该正确渲染', () => {
    render(<YourComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Mock 音频 API

```typescript
import { createMockAudioElement, simulateAudioPlay } from '../../../../test/mocks/audio';

const audio = createMockAudioElement();
simulateAudioPlay(audio);
```

### Mock API 调用

```typescript
import { createMockApi, mockSaveProgress } from '../../../../test/mocks/api';

const api = createMockApi();
mockSaveProgress(api);
```

## 测试覆盖率目标

- 单元测试覆盖率: > 80%
- 关键组件覆盖率: > 90%

## 注意事项

1. 测试文件应放在 `__tests__` 目录中
2. 使用 `testUtils.tsx` 中的 `render` 函数以确保包含必要的 Provider
3. Mock 音频 API 以避免实际播放音频
4. 清理每个测试后的副作用
