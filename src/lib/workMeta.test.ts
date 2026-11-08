import { describe, test, expect } from 'vitest';
import { displayTitle, formatPostedDate, altText, workPath } from './workMeta';

describe('displayTitle', () => {
  test('空・空白だけ・未設定は「無題」', () => {
    expect(displayTitle(null)).toBe('無題');
    expect(displayTitle(undefined)).toBe('無題');
    expect(displayTitle('  ')).toBe('無題');
  });
  test('タイトルがあればそのまま（前後の空白は除く）', () => {
    expect(displayTitle('古い地図')).toBe('古い地図');
    expect(displayTitle(' 古い地図 ')).toBe('古い地図');
  });
});

describe('formatPostedDate', () => {
  test('日本時間の日付で表す', () => {
    expect(formatPostedDate('2026-11-07T22:30:00.000Z')).toBe('2026年11月8日');
    expect(formatPostedDate('2026-11-08T14:59:00.000Z')).toBe('2026年11月8日');
  });
});

describe('altText', () => {
  test('説明がなければ「表示タイトル（投稿日）」', () => {
    expect(altText({ title: null, description: null, createdAt: '2026-11-07T22:30:00.000Z' })).toBe('無題（2026年11月8日）');
    expect(altText({ title: '古い地図', description: '', createdAt: '2026-11-08T00:00:00Z' })).toBe('古い地図（2026年11月8日）');
  });
  test('説明があれば説明を使う', () => {
    expect(altText({ title: 'T', description: '海辺で拾った切符を貼った', createdAt: '2026-11-08T00:00:00Z' })).toBe('海辺で拾った切符を貼った');
  });
  test('長い説明は先頭 100 文字（見た目の 1 文字単位）', () => {
    expect(altText({ title: 'T', description: 'あ'.repeat(150), createdAt: '2026-11-08T00:00:00Z' })).toBe('あ'.repeat(100));
    expect(altText({ title: 'T', description: '👨‍👩‍👧'.repeat(120), createdAt: '2026-11-08T00:00:00Z' })).toBe('👨‍👩‍👧'.repeat(100));
  });
  test('説明の改行は空白にする（alt は 1 行）', () => {
    expect(altText({ title: 'T', description: '一行目\n二行目', createdAt: '2026-11-08T00:00:00Z' })).toBe('一行目 二行目');
  });
});

describe('workPath', () => {
  test('ID を URL エンコードする', () => {
    expect(workPath('abc_-123')).toBe('/works/abc_-123');
    expect(workPath('a b/c')).toBe('/works/a%20b%2Fc');
  });
});
