// タグ名から URL 用の識別子（slug）を作る。保存時とリンク生成で必ずこの関数を使う。

/**
 * 英字は小文字、空白はハイフンにし、文字（日本語を含む）・数字・_・- 以外を取り除く。
 * 以前は \w（ASCII のみ）で絞っていたため、日本語のタグがすべて空の slug になっていた。
 */
export function tagSlug(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{M}_-]/gu, '');
}

export function tagHref(name: string): string {
  return `/tags/${encodeURIComponent(tagSlug(name))}`;
}
