// 作品一覧（レール）のデータ。新しい順に、カーソルで続きを読み足す。
import { and, desc, eq, exists, lt, or, sql } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { images, imageTags, tags } from '../db/schema';
import { railHref } from './links';
import { loadImageAlbums } from './feedAlbums';
import { thumbSrc } from './imageFiles';
import { altText, displayTitle, formatPostedDate } from './workMeta';

export type RailItem = {
  id: string;
  thumb: string;
  title: string;
  date: string;
  tags: string[];
  albumTitle: string | null;
  href: string;
  alt: string;
};

export type Cursor = { createdAt: string; id: string };

export { railHref };

export function encodeCursor(c: Cursor): string {
  return `${c.createdAt}|${c.id}`;
}

/** 不正なカーソルは null（SQL に渡す前に形を確かめる） */
export function decodeCursor(raw: string): Cursor | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\|([A-Za-z0-9_-]{1,64})$/.exec(raw);
  return m ? { createdAt: m[1]!, id: m[2]! } : null;
}

export async function loadRailPage(
  db: ReturnType<typeof getDb>,
  opts: { cursor?: Cursor | null; tagSlug?: string; limit: number },
): Promise<{ items: RailItem[]; nextCursor: string | null }> {
  const conditions = [];
  if (opts.cursor) {
    const { createdAt, id } = opts.cursor;
    conditions.push(or(lt(images.createdAt, createdAt), and(eq(images.createdAt, createdAt), lt(images.id, id))));
  }
  if (opts.tagSlug) {
    conditions.push(
      exists(
        db.select({ one: sql`1` }).from(imageTags).innerJoin(tags, eq(tags.id, imageTags.tagId))
          .where(and(eq(imageTags.imageId, images.id), eq(tags.slug, opts.tagSlug))),
      ),
    );
  }

  const rows = await db
    .select({
      id: images.id,
      title: images.title,
      description: images.description,
      r2Key: images.r2Key,
      thumbR2Key: images.thumbR2Key,
      createdAt: images.createdAt,
      tagList: sql<string | null>`(select group_concat(t.name, char(31)) from image_tags it join tags t on t.id = it.tag_id where it.image_id = "images"."id")`, // 外側の列は表名付きで明示（省くと tags.id と取り違える）
    })
    .from(images)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(images.createdAt), desc(images.id))
    .limit(opts.limit + 1);

  const page = rows.slice(0, opts.limit);
  const albumsById = await loadImageAlbums(db, page.map((r) => r.id));
  const items = page.map((r): RailItem => {
    const album = albumsById.get(r.id) ?? null;
    return {
      id: r.id,
      thumb: thumbSrc(r),
      title: displayTitle(r.title),
      date: formatPostedDate(r.createdAt),
      tags: r.tagList ? r.tagList.split('\u001f') : [],
      albumTitle: album?.title ?? null,
      href: railHref(r.id, album),
      alt: altText(r),
    };
  });
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > opts.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
}
