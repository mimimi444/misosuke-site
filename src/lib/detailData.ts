// 作品詳細のデータを D1 から集める
import { asc, eq, inArray } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { albumImages, albums, images, imageTags, tags } from '../db/schema';
import type { DetailData, DetailPage, DetailTarget } from './detail';
import { loadImageAlbums } from './feedAlbums';
import { r2Url } from './r2url';
import { altText, displayTitle, formatPostedDate } from './workMeta';

type Db = ReturnType<typeof getDb>;
type ImageRow = typeof images.$inferSelect;

async function tagsByImage(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ imageId: imageTags.imageId, name: tags.name })
    .from(imageTags)
    .innerJoin(tags, eq(tags.id, imageTags.tagId))
    .where(inArray(imageTags.imageId, ids))
    .orderBy(asc(tags.name));
  for (const r of rows) map.set(r.imageId, [...(map.get(r.imageId) ?? []), r.name]);
  return map;
}

function toPage(row: ImageRow, tagNames: string[]): DetailPage {
  return {
    id: row.id,
    src: r2Url(row.r2Key),
    title: displayTitle(row.title),
    description: row.description?.trim() || null,
    date: formatPostedDate(row.createdAt),
    tags: tagNames,
    alt: altText(row),
    width: row.width,
    height: row.height,
  };
}

/** 詳細のデータ。見つからなければ null（アルバムの古い slug の扱いは呼び出し側） */
export async function loadDetail(db: Db, target: DetailTarget): Promise<DetailData | null> {
  if (target.kind === 'album') {
    const [album] = await db.select().from(albums).where(eq(albums.slug, target.slug));
    if (!album) return null;
    const rows = await db
      .select({ image: images })
      .from(albumImages)
      .innerJoin(images, eq(images.id, albumImages.imageId))
      .where(eq(albumImages.albumId, album.id))
      .orderBy(asc(albumImages.sortOrder));
    const tagMap = await tagsByImage(db, rows.map((r) => r.image.id));
    const pages = rows.map((r) => toPage(r.image, tagMap.get(r.image.id) ?? []));
    const startIndex = target.page ? Math.min(Math.max(target.page, 1), Math.max(pages.length, 1)) - 1 : 0;
    return {
      kind: 'album',
      title: album.title,
      description: album.description?.trim() || null,
      album: pages.length >= 2 ? { title: album.title, slug: album.slug } : null,
      pages,
      startIndex,
    };
  }

  const [image] = await db.select().from(images).where(eq(images.id, target.id));
  if (!image) return null;
  const [tagMap, albumMap] = await Promise.all([tagsByImage(db, [image.id]), loadImageAlbums(db, [image.id])]);
  const page = toPage(image, tagMap.get(image.id) ?? []);
  const album = albumMap.get(image.id);
  return {
    kind: 'work',
    title: page.title,
    description: page.description,
    album: album ? { title: album.title, slug: album.slug } : null,
    pages: [page],
    startIndex: 0,
  };
}
