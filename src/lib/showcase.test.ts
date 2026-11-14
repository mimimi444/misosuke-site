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

test('作品一覧の先頭から同じ並び順で、最新 10 件を束ねる', () => {
  const items = Array.from({ length: 12 }, (_, i) => item(`w${i}`));
  const s = showcaseFromRail(items)!;
  expect(MAX_PICKUP).toBe(10);
  expect(s.pages.map((p) => p.id)).toEqual(items.slice(0, 10).map((i) => i.id));
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

test('フリーページがあれば最後のページにし、押したときの行き先は最初のリンク', () => {
  const free = { widgets: [{ id: 'h', type: 'heading' as const, text: 'おしらせ' }], href: 'https://example.com' };
  const s = showcaseFromRail([item('a')], free)!;
  expect(s.pages).toHaveLength(2);
  expect(s.pages[1]).toMatchObject({ id: 'free-page', title: 'おしらせ', href: 'https://example.com', free });
});

test('作品が無くてもフリーページだけで雑誌になる', () => {
  const free = { widgets: [{ id: 'd', type: 'divider' as const }], href: null };
  expect(showcaseFromRail([], free)!.pages[0]).toMatchObject({ id: 'free-page', href: '' });
});
