import { inArray, sql } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { albumImages, albums } from '../db/schema';

export interface ImageAlbumRow {
  imageId: string;
  slug: string;
  /** そのアルバムのページ数 */
  pageCount: number;
  albumCreatedAt: string;
}

/**
 * フィードの画像ごとに、ビューワーで開くアルバムを決める。
 * 2 ページ以上のアルバムに入っている画像だけが対象で、複数あればいちばん新しいアルバムを選ぶ。
 */
export function pickAlbumForImages(rows: ImageAlbumRow[]): Map<string, string> {
  const best = new Map<string, ImageAlbumRow>();
  for (const r of rows) {
    if (r.pageCount < 2) continue;
    const cur = best.get(r.imageId);
    if (!cur || r.albumCreatedAt > cur.albumCreatedAt) best.set(r.imageId, r);
  }
  return new Map([...best].map(([id, r]) => [id, r.slug]));
}

/** 指定した画像が入っているアルバムと、そのページ数を取得する */
export async function loadImageAlbums(db: ReturnType<typeof getDb>, imageIds: string[]): Promise<Map<string, string>> {
  if (imageIds.length === 0) return new Map();
  const rows = await db
    .select({
      imageId: albumImages.imageId,
      slug: albums.slug,
      albumCreatedAt: albums.createdAt,
      pageCount: sql<number>`(select count(*) from album_images x where x.album_id = ${albumImages.albumId})`,
    })
    .from(albumImages)
    .innerJoin(albums, sql`${albums.id} = ${albumImages.albumId}`)
    .where(inArray(albumImages.imageId, imageIds));
  return pickAlbumForImages(rows);
}
