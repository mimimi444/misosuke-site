// 作品を開く先の URL（ブラウザ側からも使うので、データベースに依存しない）
import { albumHref } from './albumSlug';
import { workPath } from './workMeta';

/** 2 ページ以上のアルバムに入っていればそのページ、なければ作品ページ */
export function railHref(imageId: string, album: { slug: string; page: number } | null): string {
  return album ? `${albumHref(album.slug)}?page=${album.page}` : workPath(imageId);
}

/** ?page=N（1 始まり）を、ページ数の範囲に収めた 0 始まりの位置にする。指定が無い・不正なら null */
export function pageIndexFromSearch(search: string, pageCount: number): number | null {
  if (pageCount <= 0) return null;
  const raw = new URLSearchParams(search).get('page');
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Math.min(pageCount, Math.max(1, Number(raw))) - 1;
}
