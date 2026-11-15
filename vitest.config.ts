import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CSS も中身のまま読む（?raw で読む検査が空振りしないように）
    css: true,
  },
});
