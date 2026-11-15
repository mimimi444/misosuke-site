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

import { waitSegment } from './schedule';

describe('次のページへ進むまでの時間（ページを開いてから次をめくり始めるまで）', () => {
  const n = 4;
  test('1 枚目をめくり終えてから、2 枚目をめくり始めるまで', () => {
    expect(waitSegment(2.0, n)).toEqual({ from: 1.9, to: 2.5 });
  });
  test('めくっている間は null', () => {
    expect(waitSegment(1.0, n)).toBeNull();
    expect(waitSegment(3.0, n)).toBeNull();
  });
  test('最後のページは、戻し始めるまで', () => {
    expect(waitSegment(forwardEnd(n) - 0.5, n)).toEqual({ from: 3 * 2.5 + 1.9, to: forwardEnd(n) });
  });
  test('戻している間は null、戻し終えてから次の周回の 1 枚目まで', () => {
    expect(waitSegment(forwardEnd(n) + 0.1, n)).toBeNull();
    const c = cycleLength(n);
    const seg = waitSegment(c - 0.2, n)!;
    expect(seg.to).toBeCloseTo(c);
    expect(seg.from).toBeCloseTo(forwardEnd(n) + 3 * 0.12 + 0.8);
  });
  test('周回の途中でも、その周回の中で計算する', () => {
    const c = cycleLength(n);
    expect(waitSegment(c + 2.0, n)).toEqual({ from: c + 1.9, to: c + 2.5 });
  });
});
