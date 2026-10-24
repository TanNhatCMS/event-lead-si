import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'features/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: [
      // `server-only` chỉ có ý nghĩa khi bundle cho client — trong test Node
      // thì stub rỗng để import không lỗi.
      { find: /^server-only$/, replacement: path.resolve(__dirname, 'vitest.server-only-stub.ts') },
      {
        find: /^~\/lib\/(.*)/,
        replacement: path.resolve(__dirname, 'lib/$1'),
      },
      {
        find: /^~\/(.*)/,
        replacement: path.resolve(__dirname, 'app/$1'),
      },
    ],
  },
});
