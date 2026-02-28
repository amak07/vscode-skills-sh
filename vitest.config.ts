import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/test/unit/**/*.test.ts'],
    alias: {
      vscode: path.resolve(__dirname, 'src/test/__mocks__/vscode.ts'),
    },
    environment: 'node',
    setupFiles: ['src/test/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**',
        'src/views/marketplace/styles.ts',
      ],
      reporter: ['text', 'lcov'],
    },
    restoreMocks: true,
    clearMocks: true,
  },
});
