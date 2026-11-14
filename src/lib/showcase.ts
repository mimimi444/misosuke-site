// トップ（とタグページ）の雑誌に何を開くか。選ぶのはブラウザ側（random を渡す）。
// 雑誌は常に「ピックアップ」: 1 枚ものと、アルバムの表紙（1 ページ目）を混ぜて束ねる。
import type { MagazinePage } from './magazine/spread';
import { albumHref } from './albumSlug';

/** 雑誌のページ。アルバムの表紙なら、押したときに開くアルバムの URL を持つ */
export type ShowcasePage = MagazinePage & { href?: string };

export type ShowcaseCandidates = {
  /** 2 ページ以上のアルバム（新しい順）。表紙に使うので先頭のページだけを持てばよい */
  albums: { slug: string; title: string; pages: MagazinePage[] }[];
  /** 2 ページ以上のアルバムに入っていない画像（新しい順） */
  singles: MagazinePage[];
};

export type Showcase = { title: string; pages: ShowcasePage[] };

/** 雑誌に束ねる最大枚数 */
export const MAX_PICKUP = 6;

/** 1 枚ものとアルバムの表紙（新しい順に交互） */
function pool(c: ShowcaseCandidates): ShowcasePage[] {
  const covers: ShowcasePage[] = c.albums
    .filter((a) => a.pages.length > 0)
    .map((a) => ({ ...a.pages[0]!, title: a.title, href: albumHref(a.slug) }));
  const out: ShowcasePage[] = [];
  for (let i = 0; i < Math.max(c.singles.length, covers.length); i++) {
    if (c.singles[i]) out.push(c.singles[i]!);
    if (covers[i]) out.push(covers[i]!);
  }
  return out;
}

function bundle(pages: ShowcasePage[], title: string): Showcase {
  return { title: pages.length === 1 ? pages[0]!.title : title, pages };
}

/** 1 枚ものとアルバムの表紙から、重複なくランダムに選んで束ねる */
export function pickShowcase(c: ShowcaseCandidates, random: () => number): Showcase | null {
  const items = pool(c);
  if (items.length === 0) return null;
  const count = Math.min(MAX_PICKUP, items.length);
  // 部分的なシャッフル
  for (let i = 0; i < count; i++) {
    const j = i + Math.min(items.length - 1 - i, Math.floor(random() * (items.length - i)));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return bundle(items.slice(0, count), 'ピックアップ');
}

/** JavaScript が動く前の HTML に入れる固定の内容（新しい 1 枚ものとアルバムの表紙） */
export function defaultShowcase(c: ShowcaseCandidates): Showcase | null {
  const items = pool(c);
  if (items.length === 0) return null;
  return bundle(items.slice(0, MAX_PICKUP), '新着');
}
