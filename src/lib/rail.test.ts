import { describe, test, expect } from 'vitest';
import { railHref, encodeCursor, decodeCursor } from './rail';

describe('railHref', () => {
  test('アルバムに入っていなければ作品ページ', () => {
    expect(railHref('abc', null)).toBe('/works/abc');
  });
  test('2 ページ以上のアルバムに入っていれば、そのアルバムのそのページ', () => {
    expect(railHref('abc', { slug: 'アルバム-x', page: 3 })).toBe('/albums/%E3%82%A2%E3%83%AB%E3%83%90%E3%83%A0-x?page=3');
  });
});

describe('カーソル', () => {
  test('投稿日時と ID の組を往復できる', () => {
    const c = { createdAt: '2026-11-08T09:00:00.000Z', id: 'abc_-123' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  test('不正なカーソルは null', () => {
    for (const bad of ['', 'x', 'not-a-date|abc', '2026-11-08T09:00:00.000Z|', '2026-11-08T09:00:00.000Z|a b', "2026-11-08T09:00:00.000Z|a';--"])
      expect(decodeCursor(bad), bad).toBeNull();
  });
});

import { buildRailItems, type AlbumInfo, type RailRow } from './rail';

const row = (id: string, createdAt: string, extra: Partial<RailRow> = {}): RailRow => ({
  id, title: `t-${id}`, description: null, r2Key: `k/${id}.webp`, thumbR2Key: `th/${id}.webp`, createdAt, tagList: null, ...extra,
});
const page = (id: string, n: number, createdAt: string, matches = true) => ({ id, thumb: `/th/${id}`, src: `/full/${id}`, page: n, createdAt, matches });

describe('作品一覧: アルバムを 1 つの束にまとめる', () => {
  // アルバム A: a1(古い) a2 a3(新しい)。単品 w は a3 と a1 の間
  const rows = [row('a3', '2026-11-03T00:00:00.000Z'), row('w', '2026-11-02T12:00:00.000Z', { tagList: '春' }), row('a2', '2026-11-02T00:00:00.000Z'), row('a1', '2026-11-01T00:00:00.000Z')];
  const albumOf = new Map([
    ['a1', [{ slug: 'A', title: 'アルバムA', page: 1 }]],
    ['a2', [{ slug: 'A', title: 'アルバムA', page: 2 }]],
    ['a3', [{ slug: 'A', title: 'アルバムA', page: 3 }]],
  ]);
  const info = (matches: [boolean, boolean, boolean] = [true, true, true], coverId: string | null = null): Map<string, AlbumInfo> =>
    new Map([['A', {
      slug: 'A', title: 'アルバムA', coverId,
      pages: [page('a1', 1, '2026-11-01T00:00:00.000Z', matches[0]), page('a2', 2, '2026-11-02T00:00:00.000Z', matches[1]), page('a3', 3, '2026-11-03T00:00:00.000Z', matches[2])],
    }]]);

  test('アルバムは一番新しい絵の位置に 1 つだけ出て、表は 1 ページ目、後ろに残りのページが重なり、1 ページ目から開く', () => {
    const items = buildRailItems(rows, albumOf, info(), { tagged: false });
    expect(items.map((i) => [i.kind, i.id])).toEqual([['album', 'a3'], ['work', 'w']]);
    const a = items[0]!;
    expect(a.thumb).toBe('/th/a1');
    expect(a.pageId).toBe('a1');
    expect(a.src).toBe('/full/a1');
    expect(a.stack).toEqual(['/th/a2', '/th/a3']);
    expect(a.pageCount).toBe(3);
    expect(a.title).toBe('アルバムA');
    expect(a.href).toBe('/albums/A');
    expect(a.alt).toContain('3ページ');
  });

  test('表紙が決まっていれば表紙を表にする（開くのは 1 ページ目から）', () => {
    const a = buildRailItems(rows, albumOf, info(undefined, 'a2'), { tagged: false })[0]!;
    expect(a.thumb).toBe('/th/a2');
    expect(a.stack).toEqual(['/th/a1', '/th/a3']);
    expect(a.href).toBe('/albums/A');
  });

  test('単品は今までどおり作品ページを開き、束にしない', () => {
    const w = buildRailItems(rows, albumOf, info(), { tagged: false })[1]!;
    expect(w).toMatchObject({ kind: 'work', pageCount: 1, stack: [], href: '/works/w', tags: ['春'] });
  });

  test('タグページでは、そのタグの付いた一番新しいページを表にし、そのページから開く', () => {
    const tagRows = [row('a2', '2026-11-02T00:00:00.000Z')];
    const a = buildRailItems(tagRows, albumOf, info([true, true, false]), { tagged: true })[0]!;
    expect(a.id).toBe('a2');
    expect(a.thumb).toBe('/th/a2');
    expect(a.stack).toEqual(['/th/a1', '/th/a3']);
    expect(a.href).toBe('/albums/A?page=2');
  });

  test('続きの読み足しで、すでに束を出したアルバムの古い絵は出さない', () => {
    const next = buildRailItems([row('a1', '2026-11-01T00:00:00.000Z')], albumOf, info(), { tagged: false });
    expect(next).toEqual([]);
  });

  test('1 ページだけのアルバムも、ページ数 1 の束として出す', () => {
    const one = new Map<string, AlbumInfo>([['S', { slug: 'S', title: 'ひとつ', coverId: null, pages: [page('s1', 1, '2026-11-05T00:00:00.000Z')] }]]);
    const items = buildRailItems([row('s1', '2026-11-05T00:00:00.000Z')], new Map([['s1', [{ slug: 'S', title: 'ひとつ', page: 1 }]]]), one, { tagged: false });
    expect(items[0]).toMatchObject({ kind: 'album', pageCount: 1, stack: [], href: '/albums/S', thumb: '/th/s1' });
  });

  test('複数のアルバムに入っている画像は、それぞれのアルバムの束として出す', () => {
    const infos = new Map<string, AlbumInfo>([
      ['A', info().get('A')!],
      ['T', { slug: 'T', title: 'テスト', coverId: null, pages: [page('a1', 1, '2026-11-01T00:00:00.000Z')] }],
    ]);
    const albumsOf = new Map([...albumOf, ['a1', [{ slug: 'A', title: 'アルバムA', page: 1 }, { slug: 'T', title: 'テスト', page: 1 }]]]);
    const items = buildRailItems(rows, albumsOf, infos, { tagged: false });
    expect(items.map((i) => [i.kind, i.title])).toEqual([['album', 'アルバムA'], ['work', 't-w'], ['album', 'テスト']]);
  });
});
