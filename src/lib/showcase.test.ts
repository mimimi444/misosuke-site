import { test, expect } from 'vitest';
import { showcaseFromRail, MAX_PICKUP } from './showcase';
import type { RailItem } from './rail';

const item = (id: string, kind: 'work' | 'album' = 'work'): RailItem => ({
  kind, id, thumb: `/th/${id}`, pageId: kind === 'album' ? `${id}-cover` : id, src: `/full/${id}`, stack: [], pageCount: kind === 'album' ? 3 : 1,
  title: `t-${id}`, date: '', tags: [], albumTitle: null, href: kind === 'album' ? `/albums/${id}` : `/works/${id}`, alt: '',
});

test('作品一覧が空なら null', () => {
  expect(showcaseFromRail([])).toBeNull();
});

test('作品一覧の先頭から同じ並び順で、最大 6 枚を束ねる', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => item(id));
  const s = showcaseFromRail(items)!;
  expect(MAX_PICKUP).toBe(6);
  expect(s.pages.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  expect(s.title).toBe('新着');
});

test('アルバムは一覧の束の表の絵で、押すと一覧と同じところを開く', () => {
  const s = showcaseFromRail([item('w'), item('A', 'album')])!;
  expect(s.pages[1]).toEqual({ id: 'A-cover', src: '/full/A', title: 't-A', href: '/albums/A' });
  expect(s.pages[0]!.href).toBe('/works/w');
});

test('1 枚だけなら、その作品のタイトル', () => {
  expect(showcaseFromRail([item('x')])!.title).toBe('t-x');
});
