// 作品詳細の URL。ブラウザ側からも使うので、データベースに依存しない。
import { albumHref } from './albumSlug';
import type { MagazinePage } from './magazine/spread';
import { workPath } from './workMeta';

export type DetailTarget = { kind: 'album'; slug: string; page: number | null } | { kind: 'work'; id: string };

export type DetailPage = MagazinePage & {
  description: string | null;
  date: string;
  tags: string[];
  alt: string;
  width: number | null;
  height: number | null;
};

export type DetailData = {
  kind: 'album' | 'work';
  /** アルバムならアルバムの、作品なら作品の表示タイトル */
  title: string;
  description: string | null;
  /** アルバム（作品なら所属アルバム）。2 ページ以上のアルバムだけ */
  album: { title: string; slug: string } | null;
  pages: DetailPage[];
  startIndex: number;
};

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** /albums/<slug>（?page=n）と /works/<id> を詳細として解釈する。それ以外は null */
export function parseDetailPath(pathname: string, search: string): DetailTarget | null {
  const m = /^\/(albums|works)\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const value = decode(m[2]!);
  if (!value) return null;
  if (m[1] === 'works') return { kind: 'work', id: value };
  const raw = new URLSearchParams(search).get('page');
  const page = raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
  return { kind: 'album', slug: value, page };
}

export function detailPath(t: DetailTarget): string {
  if (t.kind === 'work') return workPath(t.id);
  return t.page ? `${albumHref(t.slug)}?page=${t.page}` : albumHref(t.slug);
}

/** 詳細を閉じたときの戻り先。トップかタグページから開いたらそこ、それ以外はトップ */
export function closeTarget(originPath: string | null): string {
  if (originPath === '/' || (originPath && /^\/tags\/[^/]+$/.test(originPath))) return originPath;
  return '/';
}
