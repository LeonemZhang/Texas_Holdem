import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@texas-holdem/lan-discovery/health': fileURLToPath(
        new URL('../../packages/lan-discovery/src/health.ts', import.meta.url),
      ),
      '@texas-holdem/protocol': fileURLToPath(
        new URL('../../packages/protocol/src/index.ts', import.meta.url),
      ),
      '@texas-holdem/ui': fileURLToPath(
        new URL('../../packages/ui/src/index.ts', import.meta.url),
      ),
    },
  },
});
