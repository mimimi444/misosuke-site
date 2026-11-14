import { test, expect } from 'vitest';
import { buildLeaves, rightPageIndex, type MagazinePage } from './spread';

const p = (id: string): MagazinePage => ({ id, src: `/api/images/${id}.webp`, title: `t${id}` });

test('0 枚なら紙もない', () => {
  expect(buildLeaves([])).toEqual([]);
});

test('紙 1 枚に絵 1 枚。表に絵、裏には同じ絵が透けて見える（左右反転・薄く）', () => {
  expect(buildLeaves([p('1'), p('2'), p('3')])).toEqual([
    { page: p('1'), back: 'ghost' },
    { page: p('2'), back: 'ghost' },
    { page: p('3'), back: 'ghost' },
  ]);
});

test('1 枚ものも 1 枚の紙になる', () => {
  expect(buildLeaves([p('1')])).toEqual([{ page: p('1'), back: 'ghost' }]);
});

test('めくり終えた枚数から、右ページに見えている絵の位置', () => {
  expect(rightPageIndex(0, 3)).toBe(0);
  expect(rightPageIndex(2, 3)).toBe(2);
  expect(rightPageIndex(3, 3)).toBe(2); // すべてめくり終えたら最後の絵（の透け）に留める
  expect(rightPageIndex(0, 0)).toBe(0);
});
