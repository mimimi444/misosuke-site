import { describe, test, expect } from 'vitest';
import { parseDetailPath, detailPath, closeTarget } from './detail';

describe('parseDetailPath', () => {
  test('アルバム（日本語の slug・ページ指定あり／なし）', () => {
    expect(parseDetailPath('/albums/%E3%81%82-abc123', '?page=3')).toEqual({ kind: 'album', slug: 'あ-abc123', page: 3 });
    expect(parseDetailPath('/albums/test--k6iMU', '')).toEqual({ kind: 'album', slug: 'test--k6iMU', page: null });
    expect(parseDetailPath('/albums/x', '?page=abc')).toEqual({ kind: 'album', slug: 'x', page: null });
    expect(parseDetailPath('/albums/x/', '')).toEqual({ kind: 'album', slug: 'x', page: null });
  });

  test('作品', () => {
    expect(parseDetailPath('/works/abc_-123', '')).toEqual({ kind: 'work', id: 'abc_-123' });
  });

  test('詳細ではないパス', () => {
    for (const p of ['/', '/tags/x', '/albums', '/albums/', '/works', '/works/', '/albums/a/b', '/api/detail', '/admin'])
      expect(parseDetailPath(p, ''), p).toBeNull();
  });

  test('不正なパーセントエンコードでも例外にならない', () => {
    expect(parseDetailPath('/albums/%E0%A4', '')).toBeNull();
  });
});

describe('detailPath', () => {
  test('parseDetailPath と往復できる', () => {
    for (const [path, search] of [['/albums/%E3%81%82-abc123', '?page=3'], ['/albums/x', ''], ['/works/abc', '']] as const) {
      const t = parseDetailPath(path, search)!;
      const back = detailPath(t);
      const u = new URL(back, 'https://example.com');
      expect(parseDetailPath(u.pathname, u.search)).toEqual(t);
    }
  });
});

describe('closeTarget', () => {
  test('トップかタグページから開いたらそこへ戻る', () => {
    expect(closeTarget('/')).toBe('/');
    expect(closeTarget('/tags/%E6%98%A5')).toBe('/tags/%E6%98%A5');
  });
  test('それ以外・不明ならトップ', () => {
    expect(closeTarget('/albums/x')).toBe('/');
    expect(closeTarget('/works/abc')).toBe('/');
    expect(closeTarget(null)).toBe('/');
    expect(closeTarget('https://evil.example/')).toBe('/');
  });
});
