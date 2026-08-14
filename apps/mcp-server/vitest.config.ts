import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@texas-holdem/protocol': fileURLToPath(
        new URL('../../packages/protocol/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'src/**/*.e2e.test.ts'],
  },
});
