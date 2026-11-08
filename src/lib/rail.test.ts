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
