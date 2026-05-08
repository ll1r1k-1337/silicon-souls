import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sdd/schemas': resolve(__dirname, '../schemas/src/index.ts'),
    },
  },
});
