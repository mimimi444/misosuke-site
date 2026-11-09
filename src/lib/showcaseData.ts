// トップ（とタグページ）の雑誌に出す候補を D1 から集める
import { and, asc, desc, eq, exists, inArray, notInArray, sql } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { albumImages, albums, images, imageTags, tags } from '../db/schema';
import type { MagazinePage } from './magazine/spread';
import { r2Url } from './r2url';
import { MAX_MAGAZINE_PAGES, type ShowcaseCandidates } from './showcase';
import { displayTitle } from './workMeta';

/** 候補として持つ数（HTML に埋め込むので増やしすぎない） */
const MAX_ALBUMS = 12;
const MAX_SINGLES = 30;

export async function loadShowcaseCandidates(db: ReturnType<typeof getDb>, opts: { tagSlug?: string } = {}): Promise<ShowcaseCandidates> {
  const hasTag = (imageIdCol: typeof images.id | typeof albumImages.imageId) =>
    exists(
      db.select({ one: sql`1` }).from(imageTags).innerJoin(tags, eq(tags.id, imageTags.tagId))
        .where(and(eq(imageTags.imageId, imageIdCol), eq(tags.slug, opts.tagSlug ?? ''))),
    );

  // 2 ページ以上のアルバム（タグ指定時は、そのタグの画像を含むもの）
  const albumRows = await db
    .select({ id: albums.id, slug: albums.slug, title: albums.title })
    .from(albums)
    .where(
      and(
        sql`(select count(*) from album_images x where x.album_id = "albums"."id") >= 2`,
        opts.tagSlug
          ? exists(db.select({ one: sql`1` }).from(albumImages).where(and(eq(albumImages.albumId, albums.id), hasTag(albumImages.imageId))))
          : undefined,
      ),
    )
    .orderBy(desc(albums.createdAt))
    .limit(MAX_ALBUMS);

  const pagesByAlbum = new Map<string, MagazinePage[]>();
  if (albumRows.length > 0) {
    const pageRows = await db
      .select({ albumId: albumImages.albumId, id: images.id, title: images.title, r2Key: images.r2Key })
      .from(albumImages)
      .innerJoin(images, eq(images.id, albumImages.imageId))
      .where(inArray(albumImages.albumId, albumRows.map((a) => a.id)))
      .orderBy(asc(albumImages.sortOrder));
    for (const r of pageRows) {
      const list = pagesByAlbum.get(r.albumId) ?? [];
      // HTML に埋め込む量を抑えるため、雑誌に使う先頭のページだけを持つ
      if (list.length >= MAX_MAGAZINE_PAGES) continue;
      list.push({ id: r.id, src: r2Url(r.r2Key), title: displayTitle(r.title) });
      pagesByAlbum.set(r.albumId, list);
    }
  }

  // 2 ページ以上のアルバムに入っていない画像
  const inMultiPageAlbum = db
    .select({ id: albumImages.imageId })
    .from(albumImages)
    .where(sql`(select count(*) from album_images x where x.album_id = "album_images"."album_id") >= 2`);
  const singleRows = await db
    .select({ id: images.id, title: images.title, r2Key: images.r2Key })
    .from(images)
    .where(and(notInArray(images.id, inMultiPageAlbum), opts.tagSlug ? hasTag(images.id) : undefined))
    .orderBy(desc(images.createdAt))
    .limit(MAX_SINGLES);

  return {
    albums: albumRows.map((a) => ({ slug: a.slug, title: a.title, pages: pagesByAlbum.get(a.id) ?? [] })),
    singles: singleRows.map((r) => ({ id: r.id, src: r2Url(r.r2Key), title: displayTitle(r.title) })),
  };
}
