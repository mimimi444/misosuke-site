// アルバムの URL 用の識別子。タイトル部分はタグと同じ規則（日本語を残す）で作り、
// 同じタイトルでも衝突しないよう末尾に ID の先頭 6 文字を付ける。
import { tagSlug } from './tags';

const ID_PART_LENGTH = 6;

export function albumSlug(title: string, id: string): string {
  const idPart = id.slice(0, ID_PART_LENGTH);
  const base = tagSlug(title);
  return base ? `${base}-${idPart}` : idPart;
}

export function albumHref(slug: string): string {
  return `/albums/${encodeURIComponent(slug)}`;
}

/** slug の末尾は ID の先頭 6 文字。古い形式の slug から現在のアルバムを探すのに使う */
export function albumIdPrefixFromSlug(slug: string): string | null {
  return slug.length >= ID_PART_LENGTH ? slug.slice(-ID_PART_LENGTH) : null;
}
