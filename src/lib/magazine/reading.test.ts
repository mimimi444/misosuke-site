import { describe, test, expect } from 'vitest';
import { fitDistance, imageRect, clampZoom, nextPageIndex, edgeAction, type Insets } from './reading';

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const fovV = (26 * Math.PI) / 180;

/** 距離 d で見える縦の長さ */
const visibleH = (d: number) => 2 * d * Math.tan(fovV / 2);

describe('fitDistance', () => {
  const base = { pageW: 1.35, pageH: 1.8, fovV, aspect: 1280 / 800, viewW: 1280, viewH: 800, insets: NO_INSETS, margin: 0.06 };

  test('縦長の紙が、余白付きで画面の高さに丁度収まる', () => {
    const d = fitDistance(base);
    expect(1.8 * (1 + 2 * 0.06)).toBeCloseTo(visibleH(d), 5);
  });

  test('パネルの領域（インセット）を大きくすると、遠ざかって紙が小さくなる（パネルに重ならない）', () => {
    const d0 = fitDistance(base);
    const d1 = fitDistance({ ...base, insets: { top: 0, right: 360, bottom: 0, left: 96 } });
    expect(d1).toBeGreaterThanOrEqual(d0);
    // 横がきつい画面では、横幅で決まる
    const narrow = fitDistance({ ...base, aspect: 375 / 760, viewW: 375, viewH: 760, insets: { top: 76, right: 0, bottom: 200, left: 0 } });
    const availW = 375, visibleW = visibleH(narrow) * (375 / 760);
    expect(1.35 * (1 + 2 * 0.06)).toBeLessThanOrEqual(visibleW * (availW / 375) + 1e-6);
  });
});

describe('imageRect', () => {
  const box = { width: 760, height: 1040 };
  for (const [name, img] of [['縦長', { width: 1000, height: 4000 }], ['横長', { width: 4000, height: 1000 }], ['正方形', { width: 1000, height: 1000 }]] as const) {
    test(`${name}の絵が、縦横比を保って箱に収まり中央に来る`, () => {
      const r = imageRect(img, box);
      expect(r.width).toBeLessThanOrEqual(box.width + 1e-6);
      expect(r.height).toBeLessThanOrEqual(box.height + 1e-6);
      expect(r.width / r.height).toBeCloseTo(img.width / img.height, 5);
      expect(Math.max(r.width / box.width, r.height / box.height)).toBeCloseTo(1, 5);
      expect(r.x * 2 + r.width).toBeCloseTo(box.width, 5);
      expect(r.y * 2 + r.height).toBeCloseTo(box.height, 5);
    });
  }
});

describe('clampZoom', () => {
  const bounds = { viewW: 1000, viewH: 800, contentW: 600, contentH: 800 };
  test('倍率は 1〜4', () => {
    expect(clampZoom({ scale: 0.5, x: 0, y: 0 }, bounds).scale).toBe(1);
    expect(clampZoom({ scale: 9, x: 0, y: 0 }, bounds).scale).toBe(4);
  });
  test('倍率 1 では移動しない', () => {
    expect(clampZoom({ scale: 1, x: 300, y: -200 }, bounds)).toEqual({ scale: 1, x: 0, y: 0 });
  });
  test('拡大中も、絵が画面の外へ逃げない範囲に収める', () => {
    const z = clampZoom({ scale: 2, x: 5000, y: -5000 }, bounds);
    expect(z.x).toBe((600 * 2 - 1000) / 2);
    expect(z.y).toBe(-(800 * 2 - 800) / 2);
  });
});

describe('ページ送り', () => {
  test('範囲内で止まる（ループしない）', () => {
    expect(nextPageIndex(0, -1, 3)).toBe(0);
    expect(nextPageIndex(0, 1, 3)).toBe(1);
    expect(nextPageIndex(2, 1, 3)).toBe(2);
    expect(nextPageIndex(0, 1, 0)).toBe(0);
  });
  test('紙面の左右 22% のクリックで送る', () => {
    expect(edgeAction(10, 1000)).toBe('prev');
    expect(edgeAction(219, 1000)).toBe('prev');
    expect(edgeAction(500, 1000)).toBeNull();
    expect(edgeAction(781, 1000)).toBe('next');
    expect(edgeAction(990, 1000)).toBe('next');
  });
});
