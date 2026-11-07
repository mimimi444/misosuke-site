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

  return new Response(obj.body, { headers });
};
