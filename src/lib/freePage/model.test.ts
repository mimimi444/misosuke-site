import { describe, expect, test } from 'vitest';
import { countChars, isAllowedUrl, MAX_UNITS, pageHref, pageProblems, parseFreePage, unitsOf, type Widget } from './model';

const h = (text: string): Widget => ({ id: 'h', type: 'heading', text });

describe('フリーページの制限', () => {
  test('文字数は見た目の 1 文字で数える', () => {
    expect(countChars('あいう')).toBe(3);
    expect(countChars('👨‍👩‍👧')).toBe(1);
  });

  test('見出しは 20 文字まで、空は不可', () => {
    expect(pageProblems({ widgets: [h('あ'.repeat(20))] })).toEqual([]);
    expect(pageProblems({ widgets: [h('あ'.repeat(21))] })[0]).toContain('20 文字まで');
    expect(pageProblems({ widgets: [h('  ')] })[0]).toContain('空');
  });

  test('本文は 4 行まで', () => {
    expect(pageProblems({ widgets: [{ id: 't', type: 'text', text: 'a\nb\nc\nd\ne' }] })[0]).toContain('4 行まで');
  });

  test('ページの高さを超えたら収まらない', () => {
    const images: Widget[] = [1, 2, 3].map((i) => ({ id: `i${i}`, type: 'image', imageId: `x${i}` }));
    expect(unitsOf(images)).toBeGreaterThan(MAX_UNITS);
    expect(pageProblems({ widgets: images })).toContain('ページに収まりません。ウィジェットを減らしてください');
  });

  test('リンク先は http(s) か、サイト内のパスだけ', () => {
    expect(isAllowedUrl('https://example.com/a')).toBe(true);
    expect(isAllowedUrl('/tags/春')).toBe(true);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl('//evil.example')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });
});

describe('データの読み込み', () => {
  test('知らない種類・項目は捨てる', () => {
    const page = parseFreePage({ widgets: [{ id: 'a', type: 'heading', text: 'やあ', extra: 1 }, { type: 'script', src: 'x' }, 'junk', { id: 'd', type: 'divider' }] });
    expect(page.widgets).toEqual([{ id: 'a', type: 'heading', text: 'やあ' }, { id: 'd', type: 'divider' }]);
  });

  test('形が違えば空のページ', () => {
    expect(parseFreePage(null)).toEqual({ widgets: [] });
    expect(parseFreePage({ widgets: 'x' })).toEqual({ widgets: [] });
  });

  test('押したときの行き先は最初の正しいリンク', () => {
    const page = parseFreePage({ widgets: [
      { id: '1', type: 'link', label: 'だめ', url: 'javascript:x' },
      { id: '2', type: 'link', label: 'いい', url: 'https://bsky.app/profile/x' },
    ] });
    expect(pageHref(page)).toBe('https://bsky.app/profile/x');
    expect(pageHref({ widgets: [] })).toBeNull();
  });
});
