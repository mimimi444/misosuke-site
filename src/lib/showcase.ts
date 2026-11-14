// トップ（とタグページ）の雑誌の中身。作品一覧（レール）の先頭から、同じ並び順で束ねる。
// 1 枚ものはその絵、アルバムは一覧の束の表の絵（アルバムの表紙）。押すと一覧のサムネイルと同じところを開く。
import type { MagazinePage } from './magazine/spread';
import type { RailItem } from './rail';

/** 雑誌のページ。押したときに開く URL を持つ */
export type ShowcasePage = MagazinePage & { href: string };

export type Showcase = { title: string; pages: ShowcasePage[] };

/** 雑誌に束ねる最大枚数 */
export const MAX_PICKUP = 6;

export function showcaseFromRail(items: RailItem[]): Showcase | null {
  const pages = items.slice(0, MAX_PICKUP).map((it): ShowcasePage => ({ id: it.pageId, src: it.src, title: it.title, href: it.href }));
  if (pages.length === 0) return null;
  return { title: pages.length === 1 ? pages[0]!.title : '新着', pages };
}
