// トップの雑誌に何を開くか。選ぶのはブラウザ側（random を渡す）。
import type { MagazinePage } from './magazine/spread';
import { albumHref } from './albumSlug';

/** 仮の雑誌のページ。アルバムの表紙なら、押したときに開くアルバムの URL を持つ */
export type ShowcasePage = MagazinePage & { href?: string };

export type ShowcaseCandidates = {
  /** 2 ページ以上のアルバム（新しい順） */
  albums: { slug: string; title: string; pages: MagazinePage[] }[];
  /** 2 ページ以上のアルバムに入っていない画像（新しい順） */
  singles: MagazinePage[];
};

export type Showcase =
  | { kind: 'album'; slug: string; title: string; pages: MagazinePage[] }
  | { kind: 'singles'; title: string; pages: ShowcasePage[] };

/** 1 枚ものを束ねた「仮の雑誌」の最大枚数 */
const MAX_SINGLES = 6;
/** 雑誌として開く最大ページ数。分厚いアルバムでも、画像の読み込みと GPU のメモリを抑える */
export const MAX_MAGAZINE_PAGES = 12;

function singlesShowcase(pages: ShowcasePage[], bundleTitle: string): Showcase {
  return { kind: 'singles', title: pages.length === 1 ? pages[0]!.title : bundleTitle, pages };
}

/**
 * アルバムと「仮の雑誌」を候補とし、1 つ選ぶ。
 * 仮の雑誌は 1 枚ものとアルバムの表紙（1 ページ目）を混ぜて束ねる。表紙を押すとアルバムを 1 ページ目から開く。
 */
export function pickShowcase(c: ShowcaseCandidates, random: () => number): Showcase | null {
  const covers: ShowcasePage[] = c.albums
    .filter((a) => a.pages.length > 0)
    .map((a) => ({ ...a.pages[0]!, title: a.title, href: albumHref(a.slug) }));
  const bundle: ShowcasePage[] = [...c.singles, ...covers];
  const options = c.albums.length + (bundle.length > 0 ? 1 : 0);
  if (options === 0) return null;
  const index = Math.min(options - 1, Math.floor(random() * options));
  if (index < c.albums.length) {
    const a = c.albums[index]!;
    return { kind: 'album', slug: a.slug, title: a.title, pages: a.pages.slice(0, MAX_MAGAZINE_PAGES) };
  }
  // 1 枚ものと表紙から重複なく選ぶ（部分的なシャッフル）
  const pool = bundle;
  const count = Math.min(MAX_SINGLES, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.min(pool.length - 1 - i, Math.floor(random() * (pool.length - i)));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return singlesShowcase(pool.slice(0, count), 'ピックアップ');
}

/** JavaScript が動く前の HTML に入れる固定の内容（最新のアルバム、なければ最新の 1 枚もの） */
export function defaultShowcase(c: ShowcaseCandidates): Showcase | null {
  const a = c.albums[0];
  if (a) return { kind: 'album', slug: a.slug, title: a.title, pages: a.pages.slice(0, MAX_MAGAZINE_PAGES) };
  if (c.singles.length === 0) return null;
  return singlesShowcase(c.singles.slice(0, MAX_SINGLES), '新着');
}
