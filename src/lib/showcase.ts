// トップの雑誌の中身。作品一覧（レール）の先頭から同じ並び順で最新 10 件、最後にフリーページ（管理画面で設定）。
// 1 枚ものはその絵、アルバムは一覧の束の表の絵（アルバムの表紙）。押すと一覧のサムネイルと同じところを開く。
import type { MagazinePage } from './magazine/spread';
import type { RailItem } from './rail';
import type { FreePageView } from './freePage/model';

/** 雑誌のページ。href は押したときに開く URL（空なら何も開かない）。free はフリーページの中身 */
export type ShowcasePage = MagazinePage & { href: string; free?: FreePageView };

export type Showcase = { title: string; pages: ShowcasePage[] };

/** 雑誌に束ねる作品の最大数 */
export const MAX_PICKUP = 10;

export function showcaseFromRail(items: RailItem[], free: FreePageView | null = null): Showcase | null {
  const pages = items.slice(0, MAX_PICKUP).map((it): ShowcasePage => ({ id: it.pageId, src: it.src, title: it.title, href: it.href }));
  if (free) {
    const heading = free.widgets.find((w) => w.type === 'heading');
    pages.push({ id: 'free-page', src: '', title: heading && 'text' in heading ? heading.text : 'FREE PAGE', href: free.href ?? '', free });
  }
  if (pages.length === 0) return null;
  return { title: pages.length === 1 ? pages[0]!.title : '新着', pages };
}
