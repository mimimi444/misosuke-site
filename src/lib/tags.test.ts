import { describe, test, expect } from 'vitest';
import { tagSlug, tagHref } from './tags';

describe('tagSlug', () => {
  test('英字は小文字にし、空白はハイフンにする（既存の英字タグと同じ結果）', () => {
    expect(tagSlug('og')).toBe('og');
    expect(tagSlug('Suika')).toBe('suika');
    expect(tagSlug('Junk Journal')).toBe('junk-journal');
  });

  test('日本語のタグ名は文字を残す', () => {
    expect(tagSlug('コラージュ')).toBe('コラージュ');
    expect(tagSlug('ジャンクジャーナル')).toBe('ジャンクジャーナル');
    expect(tagSlug('作品 1')).toBe('作品-1');
  });

  test('違う日本語のタグは違う slug になる（1 つにまとめられない）', () => {
    expect(tagSlug('コラージュ')).not.toBe(tagSlug('ジャンクジャーナル'));
  });

  test('全角英数字や半角カナは NFKC で揃える', () => {
    expect(tagSlug('ＯＧ')).toBe('og');
    expect(tagSlug('ｺﾗｰｼﾞｭ')).toBe('コラージュ');
  });

  test('URL を壊す記号は取り除く', () => {
    expect(tagSlug('a/b?c#d')).toBe('abcd');
    expect(tagSlug('#猫')).toBe('猫');
    expect(tagSlug('  前後  ')).toBe('前後');
  });

  test('記号だけのタグ名は空になる（呼び出し側で捨てる）', () => {
    expect(tagSlug('!!!')).toBe('');
  });
});

describe('tagHref', () => {
  test('日本語の slug は URL エンコードする', () => {
    expect(tagHref('コラージュ')).toBe('/tags/%E3%82%B3%E3%83%A9%E3%83%BC%E3%82%B8%E3%83%A5');
    expect(tagHref('og')).toBe('/tags/og');
  });
});
