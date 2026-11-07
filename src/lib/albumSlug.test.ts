import { describe, test, expect } from 'vitest';
import { albumSlug, albumHref, albumIdPrefixFromSlug } from './albumSlug';

describe('albumSlug', () => {
  test('日本語のタイトルを残し、末尾に ID の先頭 6 文字を付ける', () => {
    expect(albumSlug('アルバムやで', 'bYvd7BxxxxXXXX')).toBe('アルバムやで-bYvd7B');
    expect(albumSlug('ジャンク ジャーナル 1冊目', 'abcdefghij')).toBe('ジャンク-ジャーナル-1冊目-abcdef');
  });

  test('英字はこれまでと同じ形になる', () => {
    expect(albumSlug('test', '-k6iMUzzzz')).toBe('test--k6iMU');
  });

  test('タイトルが記号だけなら ID の部分だけにする', () => {
    expect(albumSlug('!!!', 'abcdefghij')).toBe('abcdef');
  });
});

describe('albumHref', () => {
  test('日本語の slug は URL エンコードする', () => {
    expect(albumHref('アルバム-abc123')).toBe('/albums/%E3%82%A2%E3%83%AB%E3%83%90%E3%83%A0-abc123');
  });
});

describe('albumIdPrefixFromSlug', () => {
  test('slug の末尾 6 文字が ID の先頭 6 文字（古い slug から新しい slug へ案内するのに使う）', () => {
    expect(albumIdPrefixFromSlug('-bYvd7B')).toBe('bYvd7B');
    expect(albumIdPrefixFromSlug('test--k6iMU')).toBe('-k6iMU');
  });

  test('6 文字に満たなければ null', () => {
    expect(albumIdPrefixFromSlug('abc')).toBeNull();
  });
});
