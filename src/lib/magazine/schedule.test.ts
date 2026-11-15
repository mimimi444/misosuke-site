import { describe, test, expect } from 'vitest';
import { leafProgress, cycleLength, forwardEnd, flipCount } from './schedule';

const fwdEnd = 3 * 2.5 + 3.0;

test('最後のページで止めるので、最後の紙はめくらない', () => {
  expect(flipCount(5)).toBe(4);
  expect(flipCount(1)).toBe(0);
  expect(flipCount(0)).toBe(0);
});

test('めくり始めは 0、1.9 秒でめくり終わる', () => {
  expect(leafProgress(0, 0, 3)).toBe(0);
  expect(leafProgress(0, 1.9, 3)).toBe(1);
});

test('2 枚目は 2.5 秒後に始まる', () => {
  expect(leafProgress(1, 2.5, 3)).toBe(0);
  expect(leafProgress(1, 2.5 + 1.9, 3)).toBe(1);
});

test('最後まで行ったら、最後の紙から先にパラパラ戻る', () => {
  expect(leafProgress(2, fwdEnd, 3)).toBe(1);
  expect(leafProgress(2, fwdEnd + 0.8, 3)).toBe(0);
  expect(leafProgress(0, fwdEnd + 0.8, 3)).toBeGreaterThan(0);        // 最初の紙はまだ戻り中
  expect(leafProgress(0, fwdEnd + 2 * 0.12 + 0.8, 3)).toBe(0);
});

test('1 周の長さ', () => {
  expect(cycleLength(3)).toBeCloseTo(fwdEnd + 3 * 0.12 + 1.8);
});

test('時刻が 1 周を超えたら繰り返す', () => {
  expect(leafProgress(0, cycleLength(3) + 1.9, 3)).toBe(1);
});

test('紙が 0 枚でも壊れない', () => {
  expect(cycleLength(0)).toBeGreaterThan(0);
});

import { manualTurn } from './schedule';

describe('手でめくる（スワイプ）', () => {
  const n = 4;
  test('次へ: 待ち時間は飛ばし、次の紙がめくり終わる時刻へ向かう', () => {
    // 1 枚目がめくり終わった後の待ち時間（2.0 秒）
    expect(manualTurn(2.0, n, 1)).toEqual({ jump: 2.5, target: 2.5 + 1.9 });
  });
  test('次へ: めくっている途中なら、その紙を最後までめくる', () => {
    expect(manualTurn(3.0, n, 1)).toEqual({ jump: 3.0, target: 2.5 + 1.9 });
  });
  test('前へ: 最後にめくった紙を戻す', () => {
    expect(manualTurn(2.0, n, -1)).toEqual({ jump: 1.9, target: 0 });
  });
  test('前へ: めくっている途中なら、その紙を戻す', () => {
    expect(manualTurn(3.0, n, -1)).toEqual({ jump: 3.0, target: 2.5 });
  });
  test('前へ: 1 枚もめくっていなければ何もしない', () => {
    expect(manualTurn(0.0, n, -1)).toBeNull();
  });
  test('周回の途中でも、その周回の中で計算する', () => {
    const c = cycleLength(n);
    expect(manualTurn(c + 2.0, n, 1)).toEqual({ jump: c + 2.5, target: c + 2.5 + 1.9 });
  });
  test('最後までめくった後の次へは、次の周回の 1 枚目をめくる', () => {
    const c = cycleLength(n);
    expect(manualTurn(forwardEnd(n) + 0.5, n, 1)).toEqual({ jump: forwardEnd(n) + 0.5, target: c + 1.9 });
  });
});

import { openTime } from './schedule';

describe('指定したページを開いた時刻', () => {
  test('1 ページ目は最初、k ページ目は k-1 枚めくり終えた時刻', () => {
    expect(openTime(0, 4)).toBe(0);
    expect(openTime(2, 4)).toBeCloseTo(2.5 + 1.9);
    for (let k = 0; k < 5; k++) {
      const t = openTime(k, 4);
      const flipped = [0, 1, 2, 3].filter((i) => leafProgress(i, t, 4) >= 0.999).length;
      expect(flipped).toBe(k);
    }
  });
  test('範囲外は最後のページ', () => {
    expect(openTime(9, 4)).toBe(openTime(4, 4));
  });
});

import { currentPage } from './schedule';

describe('今見せているページとその区間（シークバー）', () => {
  const n = 4; // めくる紙 4 枚 = 5 ページ
  test('1 枚目をめくり始めてから 2 枚目をめくり始めるまでは 2 ページ目（めくっている時間も含む）', () => {
    expect(currentPage(1.0, n)).toEqual({ page: 1, from: 0, to: 2.5, riffle: false });
    expect(currentPage(2.0, n)).toEqual({ page: 1, from: 0, to: 2.5, riffle: false });
  });
  test('めくり始める瞬間（止めているとき）は前のページ', () => {
    expect(currentPage(2.5, n)).toEqual({ page: 1, from: 0, to: 2.5, riffle: false });
    expect(currentPage(0, n).page).toBe(0);
  });
  test('最後のページは戻し始めるまで', () => {
    expect(currentPage(forwardEnd(n) - 0.1, n)).toEqual({ page: 4, from: 3 * 2.5, to: forwardEnd(n), riffle: false });
  });
  test('戻している間は riffle、戻し終えたら 1 ページ目', () => {
    expect(currentPage(forwardEnd(n) + 0.1, n)).toEqual({ page: 0, riffle: true });
    const c = cycleLength(n);
    const p = currentPage(c - 0.2, n);
    expect(p.page).toBe(0);
    expect(!p.riffle && p.to).toBeCloseTo(c);
  });
  test('周回の途中でも、その周回の中で計算する', () => {
    const c = cycleLength(n);
    expect(currentPage(c + 3.0, n)).toEqual({ page: 2, from: c + 2.5, to: c + 5, riffle: false });
  });
});
