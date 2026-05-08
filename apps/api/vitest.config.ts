import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sdd/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
      '@sdd/schemas': resolve(__dirname, '../../packages/schemas/src/index.ts'),
      '@sdd/spec-format': resolve(__dirname, '../../packages/spec-format/src/index.ts'),
      '@sdd/llm-contracts': resolve(__dirname, '../../packages/llm-contracts/src/index.ts'),
    },
  },
});
