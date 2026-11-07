import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../../db/client';
import { images } from '../../../../db/schema';
import { contentDisposition } from '../../../../lib/imageFiles';

// フルサイズの元画像をダウンロードさせる（ミドルウェアでログイン済みのときだけ届く）
export const GET: APIRoute = async ({ params }) => {
  const [image] = await getDb(env.DB).select().from(images).where(eq(images.id, params.id ?? ''));
  if (!image) return new Response('Not Found', { status: 404 });

  const key = image.originalR2Key ?? image.r2Key;
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Disposition', contentDisposition(image.title, image.id, key));
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'private, no-store');
  return new Response(obj.body, { headers });
};
