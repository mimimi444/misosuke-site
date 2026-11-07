import { describe, test, expect } from 'vitest';
import { imageKeys, shouldCompress, isPublicImageKey, contentDisposition, isAllowedUploadType, COMPRESS } from './imageFiles';

const NOW = new Date('2026-11-07T09:00:00Z');

describe('imageKeys', () => {
  test('元画像は originals/、公開用は images/ に年月で分けて置く', () => {
    expect(imageKeys('abc123', 'photo.JPG', NOW)).toEqual({
      originalKey: 'originals/2026/11/abc123.jpg',
      displayKey: 'images/2026/11/abc123.webp',
    });
  });

  test('拡張子がなければ bin にする', () => {
    expect(imageKeys('abc123', 'noext', NOW).originalKey).toBe('originals/2026/11/abc123.bin');
  });

  test('拡張子に使えない文字は捨てる', () => {
    expect(imageKeys('abc123', 'evil.p/n..g', NOW).originalKey).toBe('originals/2026/11/abc123.g');
    expect(imageKeys('abc123', 'evil.%2F', NOW).originalKey).toBe('originals/2026/11/abc123.2f');
  });
});

describe('shouldCompress', () => {
  test('写真系の形式は圧縮する', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic']) expect(shouldCompress(t)).toBe(true);
  });
  test('GIF（アニメーションが消える）と SVG は圧縮しない', () => {
    for (const t of ['image/gif', 'image/svg+xml', '']) expect(shouldCompress(t)).toBe(false);
  });
});

describe('isPublicImageKey', () => {
  test('元画像は公開 URL から取得させない', () => {
    expect(isPublicImageKey('images/2026/11/a.webp')).toBe(true);
    expect(isPublicImageKey('originals/2026/11/a.jpg')).toBe(false);
    expect(isPublicImageKey('./originals/2026/11/a.jpg')).toBe(false);
    expect(isPublicImageKey('images/../originals/a.jpg')).toBe(false);
  });
});

describe('contentDisposition', () => {
  test('タイトルをファイル名にし、日本語は RFC 5987 形式でも渡す', () => {
    expect(contentDisposition('作品 1', 'abc123', 'originals/2026/11/abc123.jpg')).toBe(
      `attachment; filename="abc123.jpg"; filename*=UTF-8''%E4%BD%9C%E5%93%81%201.jpg`,
    );
  });
  test('タイトルがなければ ID をファイル名にする', () => {
    expect(contentDisposition(null, 'abc123', 'originals/2026/11/abc123.png')).toBe(
      `attachment; filename="abc123.png"; filename*=UTF-8''abc123.png`,
    );
  });
  test('古い画像のキーに残る拡張子も、ヘッダーを壊さないよう英数字だけにする', () => {
    expect(contentDisposition('t', 'x', 'images/2026/05/x.jp"g; a=b')).toBe(
      `attachment; filename="x.jpgab"; filename*=UTF-8''t.jpgab`,
    );
  });

  test('ファイル名に使えない文字は _ に置き換える', () => {
    expect(contentDisposition('a/b\\c:"d"', 'x', 'originals/x.jpg')).toContain(`filename*=UTF-8''a_b_c__d_.jpg`);
  });
});

test('圧縮の設定は長辺 2000px・WebP 品質 80', () => {
  expect(COMPRESS).toEqual({ maxEdge: 2000, format: 'image/webp', quality: 80 });
});

describe('isAllowedUploadType', () => {
  test('写真・画像の形式だけを受け付ける', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'])
      expect(isAllowedUploadType(t)).toBe(true);
  });
  test('自サイトで配るとスクリプトが動きうる形式は拒否する', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/octet-stream', '', 'image/jpeg; x=1'])
      expect(isAllowedUploadType(t)).toBe(false);
  });
});
