// 作品一覧（レール）のデータ。新しい順に、カーソルで続きを読み足す。
import { and, asc, desc, eq, exists, inArray, lt, or, sql } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { albumImages, albums, images, imageTags, tags } from '../db/schema';
import { railHref } from './links';
import { albumHref } from './albumSlug';
import { loadImageAlbums, type ImageAlbum } from './feedAlbums';
import { thumbSrc } from './imageFiles';
import { r2Url } from './r2url';
import { altText, displayTitle, formatPostedDate } from './workMeta';

export type RailItem = {
  /** 1 枚もの（1 ページだけのアルバムの絵を含む）か、2 ページ以上のアルバムの束か */
  kind: 'work' | 'album';
  id: string;
  thumb: string;
  /** 表に見えている絵（アルバムなら束の表の絵）の ID と、その大きい画像。トップの雑誌に使う */
  pageId: string;
  src: string;
  /** 束の後ろに重ねるページのサムネイル（最大 2 枚）。1 枚ものは空 */
  stack: string[];
  pageCount: number;
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

/** 一覧の 1 行（画像） */
export type RailRow = {
  id: string;
  title: string | null;
  description: string | null;
  r2Key: string;
  thumbR2Key: string | null;
  createdAt: string;
  tagList: string | null;
};

/** アルバムの全ページ（並び順）。matches はタグページの絞り込みに当たるか（絞り込みが無ければ常に true） */
export type AlbumInfo = {
  slug: string;
  title: string;
  coverId: string | null;
  pages: { id: string; thumb: string; src: string; page: number; createdAt: string; matches: boolean }[];
};

/** 束の後ろに重ねる枚数 */
const STACK_BEHIND = 2;

const newer = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);

/**
 * 画像の行を一覧の項目にする。2 ページ以上のアルバムの絵は、絞り込みに当たる一番新しいページの位置に
 * アルバムの束として 1 つだけ出し、それ以外のページは出さない（読み足しの続きでも同じ規則なので重ならない）。
 * 束の表は、一覧では表紙（無ければ 1 ページ目）で 1 ページ目から開き、タグページではそのタグの付いたページで、そのページから開く。
 */
export function buildRailItems(
  rows: RailRow[],
  albumOf: Map<string, ImageAlbum>,
  albumInfo: Map<string, AlbumInfo>,
  opts: { tagged: boolean },
): RailItem[] {
  const items: RailItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const album = albumOf.get(r.id) ?? null;
    const info = album ? albumInfo.get(album.slug) : undefined;
    if (!album || !info || info.pages.length < 2) {
      items.push({
        kind: 'work',
        id: r.id,
        thumb: thumbSrc(r),
        pageId: r.id,
        src: r2Url(r.r2Key),
        stack: [],
        pageCount: 1,
        title: displayTitle(r.title),
        date: formatPostedDate(r.createdAt),
        tags: r.tagList ? r.tagList.split('\u001f') : [],
        albumTitle: album?.title ?? null,
        href: railHref(r.id, album),
        alt: altText(r),
      });
      continue;
    }
    const rep = info.pages.filter((p) => p.matches).reduce<AlbumInfo['pages'][number] | null>((best, p) => (!best || newer(p, best) ? p : best), null);
    if (!rep || rep.id !== r.id || seen.has(info.slug)) continue;
    seen.add(info.slug);
    const top = opts.tagged ? rep : info.pages.find((p) => p.id === info.coverId) ?? info.pages[0]!;
    items.push({
      kind: 'album',
      id: r.id,
      thumb: top.thumb,
      pageId: top.id,
      src: top.src,
      stack: info.pages.filter((p) => p.id !== top.id).slice(0, STACK_BEHIND).map((p) => p.thumb),
      pageCount: info.pages.length,
      title: info.title,
      date: formatPostedDate(rep.createdAt),
      tags: [],
      albumTitle: null,
      href: opts.tagged ? railHref(rep.id, { slug: info.slug, page: rep.page }) : albumHref(info.slug),
      alt: `アルバム「${info.title}」（${info.pages.length}ページ）`,
    });
  }
  return items;
}

/** 一覧に出るアルバムの全ページ */
async function loadAlbumInfo(db: ReturnType<typeof getDb>, slugs: string[], tagSlug?: string): Promise<Map<string, AlbumInfo>> {
  const map = new Map<string, AlbumInfo>();
  if (slugs.length === 0) return map;
  const rows = await db
    .select({
      slug: albums.slug,
      title: albums.title,
      coverId: albums.coverImageId,
      id: images.id,
      r2Key: images.r2Key,
      thumbR2Key: images.thumbR2Key,
      createdAt: images.createdAt,
      matches: tagSlug
        ? sql<number>`exists(select 1 from image_tags it join tags t on t.id = it.tag_id where it.image_id = "images"."id" and t.slug = ${tagSlug})`
        : sql<number>`1`,
    })
    .from(albumImages)
    .innerJoin(albums, eq(albums.id, albumImages.albumId))
    .innerJoin(images, eq(images.id, albumImages.imageId))
    .where(inArray(albums.slug, slugs))
    .orderBy(asc(albums.slug), asc(albumImages.sortOrder));
  for (const r of rows) {
    const info = map.get(r.slug) ?? { slug: r.slug, title: r.title, coverId: r.coverId, pages: [] };
    info.pages.push({ id: r.id, thumb: thumbSrc(r), src: r2Url(r.r2Key), page: info.pages.length + 1, createdAt: r.createdAt, matches: !!r.matches });
    map.set(r.slug, info);
  }
  return map;
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
  const albumInfo = await loadAlbumInfo(db, [...new Set([...albumsById.values()].map((a) => a.slug))], opts.tagSlug);
  const items = buildRailItems(page, albumsById, albumInfo, { tagged: !!opts.tagSlug });
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > opts.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
}
