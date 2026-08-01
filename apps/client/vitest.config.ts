import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@texas-holdem/protocol': fileURLToPath(
        new URL('../../packages/protocol/src/index.ts', import.meta.url),
      ),
      '@texas-holdem/ui': fileURLToPath(
        new URL('../../packages/ui/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
