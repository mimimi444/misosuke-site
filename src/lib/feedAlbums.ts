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
 * 画像ごとに、開くアルバムを決める（作品詳細の「アルバムで見る」）。
 * 1 ページだけのアルバムも対象。複数あればいちばん新しいアルバムを選ぶ。
 */
export function pickAlbumForImages(rows: ImageAlbumRow[]): Map<string, ImageAlbum> {
  const best = new Map<string, ImageAlbumRow>();
  for (const r of rows) {
    if (r.pageCount < 1) continue;
    const cur = best.get(r.imageId);
    if (!cur || r.albumCreatedAt > cur.albumCreatedAt) best.set(r.imageId, r);
  }
  return new Map([...best].map(([id, r]) => [id, { slug: r.slug, title: r.title, page: r.page }]));
}

/** 画像ごとに、入っているアルバムをすべて（新しいアルバムから順に）。作品一覧では、アルバムごとに束を出す */
export function groupAlbumsByImage(rows: ImageAlbumRow[]): Map<string, ImageAlbum[]> {
  const map = new Map<string, ImageAlbumRow[]>();
  for (const r of rows) map.set(r.imageId, [...(map.get(r.imageId) ?? []), r]);
  return new Map([...map].map(([id, list]) => [
    id,
    [...list].sort((a, b) => (a.albumCreatedAt < b.albumCreatedAt ? 1 : -1)).map((r) => ({ slug: r.slug, title: r.title, page: r.page })),
  ]));
}

/** 指定した画像が入っているアルバムと、その中の位置を取得する（いちばん新しいアルバム 1 つ） */
export async function loadImageAlbums(db: ReturnType<typeof getDb>, imageIds: string[]): Promise<Map<string, ImageAlbum>> {
  return pickAlbumForImages(await loadImageAlbumRows(db, imageIds));
}

/** 指定した画像が入っているアルバムをすべて */
export async function loadAlbumsOfImages(db: ReturnType<typeof getDb>, imageIds: string[]): Promise<Map<string, ImageAlbum[]>> {
  return groupAlbumsByImage(await loadImageAlbumRows(db, imageIds));
}

async function loadImageAlbumRows(db: ReturnType<typeof getDb>, imageIds: string[]): Promise<ImageAlbumRow[]> {
  if (imageIds.length === 0) return [];
  return db
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
}
