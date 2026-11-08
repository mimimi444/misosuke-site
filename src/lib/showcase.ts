// トップの雑誌に何を開くか。選ぶのはブラウザ側（random を渡す）。
import type { MagazinePage } from './magazine/spread';

export type ShowcaseCandidates = {
  /** 2 ページ以上のアルバム（新しい順） */
  albums: { slug: string; title: string; pages: MagazinePage[] }[];
  /** 2 ページ以上のアルバムに入っていない画像（新しい順） */
  singles: MagazinePage[];
};

export type Showcase =
  | { kind: 'album'; slug: string; title: string; pages: MagazinePage[] }
  | { kind: 'singles'; title: string; pages: MagazinePage[] };

/** 1 枚ものを束ねた「仮の雑誌」の最大枚数 */
const MAX_SINGLES = 6;

function singlesShowcase(pages: MagazinePage[], bundleTitle: string): Showcase {
  return { kind: 'singles', title: pages.length === 1 ? pages[0]!.title : bundleTitle, pages };
}

/** アルバムと「1 枚ものを束ねた仮の雑誌」を候補とし、1 つ選ぶ */
export function pickShowcase(c: ShowcaseCandidates, random: () => number): Showcase | null {
  const options = c.albums.length + (c.singles.length > 0 ? 1 : 0);
  if (options === 0) return null;
  const index = Math.min(options - 1, Math.floor(random() * options));
  if (index < c.albums.length) {
    const a = c.albums[index]!;
    return { kind: 'album', slug: a.slug, title: a.title, pages: a.pages };
  }
  // 1 枚ものから重複なく選ぶ（部分的なシャッフル）
  const pool = [...c.singles];
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
  if (a) return { kind: 'album', slug: a.slug, title: a.title, pages: a.pages };
  if (c.singles.length === 0) return null;
  return singlesShowcase(c.singles.slice(0, MAX_SINGLES), '新着');
}
