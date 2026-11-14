import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isPublicImageKey } from '../../../lib/imageFiles';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  // フルサイズの元画像は管理画面からのダウンロードでだけ渡す
  if (!isPublicImageKey(key)) return new Response('Not Found', { status: 404 });

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  // 保存時の Content-Type 以外として解釈させない。万一スクリプトを含むファイルが混じっても動かさない
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");

  return new Response(obj.body, { headers });
};
