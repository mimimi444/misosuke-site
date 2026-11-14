// 雑誌のページと紙（leaf）の対応。three.js に依存しない。

export type MagazinePage = { id: string; src: string; title: string };

/**
 * 紙 1 枚に絵 1 枚。表に絵を載せ、裏には同じ絵が紙の裏から透けて見える（左右反転・薄く）。
 * めくると、左ページには直前まで右にあった絵の透けが、右ページには次の絵が来る。
 */
export type Leaf = { page: MagazinePage; back: 'ghost' };

export function buildLeaves(pages: MagazinePage[]): Leaf[] {
  return pages.map((page) => ({ page, back: 'ghost' as const }));
}

/** めくり終えた枚数から、右ページに見えている絵の位置（すべてめくり終えたら最後の絵に留める） */
export function rightPageIndex(flippedCount: number, pageCount: number): number {
  return Math.max(0, Math.min(flippedCount, pageCount - 1));
}
