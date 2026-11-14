import { test, expect } from 'vitest';
import { pickAlbumForImages } from './feedAlbums';

const row = (imageId: string, slug: string, pageCount: number, albumCreatedAt: string, page = 1, title = slug) => ({
  imageId,
  slug,
  title,
  page,
  pageCount,
  albumCreatedAt,
});

test('2 ページ以上のアルバムに入っている画像だけ、そのアルバムと何ページ目かを返す', () => {
  const map = pickAlbumForImages([row('a', 'book', 3, '2026-01-01', 2, '本'), row('b', 'single', 1, '2026-01-01')]);
  expect(map.get('a')).toEqual({ slug: 'book', title: '本', page: 2 });
  expect(map.has('b')).toBe(false);
});

test('複数のアルバムに入っていれば、いちばん新しいアルバムを選ぶ', () => {
  const map = pickAlbumForImages([
    row('a', 'old', 5, '2026-01-01T00:00:00Z'),
    row('a', 'new', 2, '2026-06-01T00:00:00Z', 2),
    row('a', 'mid', 4, '2026-03-01T00:00:00Z'),
  ]);
  expect(map.get('a')?.slug).toBe('new');
  expect(map.get('a')?.page).toBe(2);
});

test('どのアルバムにも入っていない画像は含まない', () => {
  expect(pickAlbumForImages([]).size).toBe(0);
});
