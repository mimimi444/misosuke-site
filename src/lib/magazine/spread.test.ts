import { test, expect } from 'vitest';
import { buildLeaves, type MagazinePage } from './spread';

const p = (id: string): MagazinePage => ({ id, src: `/api/images/${id}.webp`, title: `t${id}` });
const ids = (pages: MagazinePage[]) => buildLeaves(pages).map((l) => [l.front?.id ?? null, l.back?.id ?? null]);

test('0 枚なら紙もない', () => {
  expect(buildLeaves([])).toEqual([]);
});

test('1 枚なら表だけ（裏は裏表紙の内側＝無地）', () => {
  expect(ids([p('1')])).toEqual([['1', null]]);
});

test('紙の表が右ページ、裏が次の見開きの左ページ', () => {
  expect(ids([p('1'), p('2')])).toEqual([['1', '2']]);
  expect(ids([p('1'), p('2'), p('3')])).toEqual([['1', '2'], ['3', null]]);
  expect(ids([p('1'), p('2'), p('3'), p('4')])).toEqual([['1', '2'], ['3', '4']]);
});
