// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // 投稿に含めるリンクの絶対 URL を組み立てるのに使う
  site: 'https://misosuke-site.misosuke.workers.dev',
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()]
});
