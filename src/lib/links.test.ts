import { test, expect } from 'vitest';
import { pageIndexFromSearch } from './links';

test('?page=N（1 始まり）を、ページ数の範囲に収めた 0 始まりの位置にする', () => {
  expect(pageIndexFromSearch('?page=3', 5)).toBe(2);
  expect(pageIndexFromSearch('?page=1', 5)).toBe(0);
  expect(pageIndexFromSearch('?page=99', 5)).toBe(4);
  expect(pageIndexFromSearch('?page=0', 5)).toBe(0);
});

test('指定が無い・不正なら null（保存された位置などに任せる）', () => {
  for (const s of ['', '?', '?page=', '?page=abc', '?page=-2', '?page=1.5']) expect(pageIndexFromSearch(s, 5), s).toBeNull();
  expect(pageIndexFromSearch('?page=2', 0)).toBeNull();
});
