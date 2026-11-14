import type { APIRoute } from 'astro';
import { isNull, eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../db/client';
import { images } from '../../../db/schema';
import { imageKeys } from '../../../lib/imageFiles';
import { storeThumbnail } from '../../../lib/imageStore';

/** 1 回の呼び出しで作る件数（Workers の CPU 時間とメモリに収めるため少なめ） */
const BATCH = 20;

/**
 * サムネイルがまだ無い画像について、公開用画像からサムネイルを作る（ログイン必須はミドルウェアで担保）。
 * 管理画面のボタンから、remaining が 0 になるまで繰り返し呼ばれる。
 */
export const POST: APIRoute = async () => {
  const db = getDb(env.DB);
  const targets = await db.select().from(images).where(isNull(images.thumbR2Key)).limit(BATCH);

  let processed = 0;
  for (const image of targets) {
    const obj = await env.BUCKET.get(image.r2Key);
    // GIF や元画像が読めないものは、作らない印として公開用画像のキーを入れる（一覧では同じ画像を使う）
    let key = image.r2Key;
    if (obj && !image.r2Key.endsWith('.gif')) {
      const { thumbKey } = imageKeys(image.id, 'x.webp', new Date(image.createdAt));
      key = (await storeThumbnail(env.BUCKET, env.IMAGES, thumbKey, obj.body, { width: image.width, height: image.height })) ?? image.r2Key;
    }
    await db.update(images).set({ thumbR2Key: key }).where(eq(images.id, image.id));
    processed++;
  }

  const [{ remaining }] = await db.select({ remaining: sql<number>`count(*)` }).from(images).where(isNull(images.thumbR2Key));
  return Response.json({ processed, remaining }, { headers: { 'Cache-Control': 'no-store' } });
};
