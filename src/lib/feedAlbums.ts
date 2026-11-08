import { inArray, sql } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { albumImages, albums } from '../db/schema';

export interface ImageAlbumRow {
  imageId: string;
  slug: string;
  title: string;
  /** その画像がアルバムの何ページ目か（1 始まり） */
  page: number;
  /** そのアルバムのページ数 */
  pageCount: number;
  albumCreatedAt: string;
}

export type ImageAlbum = { slug: string; title: string; page: number };

/**
 * 画像ごとに、開くアルバムを決める。
 * 2 ページ以上のアルバムに入っている画像だけが対象で、複数あればいちばん新しいアルバムを選ぶ。
 */
export function pickAlbumForImages(rows: ImageAlbumRow[]): Map<string, ImageAlbum> {
  const best = new Map<string, ImageAlbumRow>();
  for (const r of rows) {
    if (r.pageCount < 2) continue;
    const cur = best.get(r.imageId);
    if (!cur || r.albumCreatedAt > cur.albumCreatedAt) best.set(r.imageId, r);
  }
  return new Map([...best].map(([id, r]) => [id, { slug: r.slug, title: r.title, page: r.page }]));
}

/** 指定した画像が入っているアルバムと、その中の位置を取得する */
export async function loadImageAlbums(db: ReturnType<typeof getDb>, imageIds: string[]): Promise<Map<string, ImageAlbum>> {
  if (imageIds.length === 0) return new Map();
  const rows = await db
    .select({
      imageId: albumImages.imageId,
      slug: albums.slug,
      title: albums.title,
      albumCreatedAt: albums.createdAt,
      pageCount: sql<number>`(select count(*) from album_images x where x.album_id = "album_images"."album_id")`,
      page: sql<number>`(select count(*) from album_images x where x.album_id = "album_images"."album_id" and x.sort_order < "album_images"."sort_order") + 1`,
    })
    .from(albumImages)
    .innerJoin(albums, sql`${albums.id} = ${albumImages.albumId}`)
    .where(inArray(albumImages.imageId, imageIds));
  return pickAlbumForImages(rows);
}
