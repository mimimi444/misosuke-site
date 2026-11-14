import { test, expect } from 'vitest';
import { pickShowcase, defaultShowcase, MAX_PICKUP, type ShowcaseCandidates } from './showcase';
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
  expect(pickShowcase(c, () => 0)).toEqual({ title: s(1).title, pages: [s(1)] });
});

test('アルバムを丸ごと開くことはなく、表紙（1 ページ目）だけが 1 枚ものと混ざる', () => {
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const picked = pickShowcase({ albums: [a1, a2], singles: [s(1)] }, () => r)!;
    expect(picked.title).toBe('ピックアップ');
    expect(picked.pages.map((p) => p.id).sort()).toEqual(['a', 'c', 's1']);
  }
});

test('アルバムの表紙は、アルバムのタイトルで、押すとアルバムを 1 ページ目から開く', () => {
  const picked = pickShowcase({ albums: [a1], singles: [s(1)] }, () => 0)!;
  const cover = picked.pages.find((p) => p.id === 'a')!;
  expect(cover).toMatchObject({ title: 'アルバム1', href: '/albums/album-1' });
  expect(picked.pages.find((p) => p.id === 's1')!.href).toBeUndefined();
});

test('束ねるのは最大 6 枚、重複しない', () => {
  const picked = pickShowcase({ albums: [a1, a2], singles: Array.from({ length: 9 }, (_, i) => s(i)) }, Math.random)!;
  expect(MAX_PICKUP).toBe(6);
  expect(picked.pages).toHaveLength(6);
  expect(new Set(picked.pages.map((p) => p.id)).size).toBe(6);
});

test('JavaScript 前の固定内容は、新しい 1 枚ものとアルバムの表紙を交互に最大 6 枚', () => {
  const singles = Array.from({ length: 8 }, (_, i) => s(i));
  const d = defaultShowcase({ albums: [a1, a2], singles })!;
  expect(d.title).toBe('新着');
  expect(d.pages.map((p) => p.id)).toEqual(['s0', 'a', 's1', 'c', 's2', 's3']);
});
