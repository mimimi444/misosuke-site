// 雑誌のページと紙（leaf）の対応。three.js に依存しない。

export type MagazinePage = { id: string; src: string; title: string };
export type Leaf = { front: MagazinePage | null; back: MagazinePage | null };

/**
 * 画像 1 枚 = 紙の片面 1 ページ。最初の見開きの左は表紙の内側（無地）なので、
 * 紙の表＝右ページ、裏＝次の見開きの左ページ。最後の裏が無ければ裏表紙の内側（無地）。
 */
export function buildLeaves(pages: MagazinePage[]): Leaf[] {
  const leaves: Leaf[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    leaves.push({ front: pages[i]!, back: pages[i + 1] ?? null });
  }
  return leaves;
}
