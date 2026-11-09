import { test, expect } from 'vitest';
import { pickShowcase, defaultShowcase, MAX_MAGAZINE_PAGES, type ShowcaseCandidates } from './showcase';
import type { MagazinePage } from './magazine/spread';

const s = (i: number): MagazinePage => ({ id: `s${i}`, src: `/s${i}.webp`, title: `single ${i}` });
const page = (id: string): MagazinePage => ({ id, src: `/${id}.webp`, title: id });
const a1 = { slug: 'album-1', title: 'アルバム1', pages: [page('a'), page('b')] };
const a2 = { slug: 'album-2', title: 'アルバム2', pages: [page('c'), page('d'), page('e')] };

test('候補が無ければ null', () => {
  expect(pickShowcase({ albums: [], singles: [] }, () => 0)).toBeNull();
  expect(defaultShowcase({ albums: [], singles: [] })).toBeNull();
});

test('1 枚ものが 1 枚だけなら、その 1 枚の紙', () => {
  const c: ShowcaseCandidates = { albums: [], singles: [s(1)] };
  expect(pickShowcase(c, () => 0)).toEqual({ kind: 'singles', title: s(1).title, pages: [s(1)] });
});

test('アルバムと「1 枚ものを束ねた仮の雑誌」から 1 つ選ぶ', () => {
  const c: ShowcaseCandidates = { albums: [a1], singles: [s(1), s(2)] };
  expect(pickShowcase(c, () => 0)?.kind).toBe('album');
  expect(pickShowcase(c, () => 0.99)?.kind).toBe('singles');
});

test('仮の雑誌は最大 6 枚、重複しない', () => {
  const picked = pickShowcase({ albums: [], singles: Array.from({ length: 9 }, (_, i) => s(i)) }, Math.random)!;
  expect(picked.pages).toHaveLength(6);
  expect(new Set(picked.pages.map((p) => p.id)).size).toBe(6);
});

test('JavaScript 前の固定内容は、最新のアルバム（候補の先頭）', () => {
  expect(defaultShowcase({ albums: [a1, a2], singles: [s(1)] })).toEqual({ kind: 'album', slug: a1.slug, title: a1.title, pages: a1.pages });
});

test('アルバムが無ければ、最新の 1 枚ものを最大 6 枚', () => {
  const singles = Array.from({ length: 8 }, (_, i) => s(i));
  expect(defaultShowcase({ albums: [], singles })).toEqual({ kind: 'singles', title: '新着', pages: singles.slice(0, 6) });
});

test('ページ数の多いアルバムは、先頭の 12 ページだけを雑誌にする（読み込みとメモリを抑える）', () => {
  const big = { slug: 'big', title: '分厚い', pages: Array.from({ length: 30 }, (_, i) => page(`p${i}`)) };
  expect(MAX_MAGAZINE_PAGES).toBe(12);
  expect(pickShowcase({ albums: [big], singles: [] }, () => 0)!.pages.map((p) => p.id)).toEqual(big.pages.slice(0, 12).map((p) => p.id));
  expect(defaultShowcase({ albums: [big], singles: [] })!.pages).toHaveLength(12);
});
