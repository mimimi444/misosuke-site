// 作品を開く先の URL（ブラウザ側からも使うので、データベースに依存しない）
import { albumHref } from './albumSlug';
import { workPath } from './workMeta';

/** 2 ページ以上のアルバムに入っていればそのページ、なければ作品ページ */
export function railHref(imageId: string, album: { slug: string; page: number } | null): string {
  return album ? `${albumHref(album.slug)}?page=${album.page}` : workPath(imageId);
}
