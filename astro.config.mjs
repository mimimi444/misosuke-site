// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // 投稿に含めるリンクの絶対 URL を組み立てるのに使う
  site: 'https://misosuke-site.misosuke.workers.dev',
  security: {
    // 画像アップロードはアクション経由なので、既定の 1MB では写真が弾かれる（413）。
    // 管理画面は Basic 認証で守られており、Workers のリクエスト上限（100MB）より十分小さい値にする
    actionBodySizeLimit: 25 * 1024 * 1024,
  },
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()]
});
