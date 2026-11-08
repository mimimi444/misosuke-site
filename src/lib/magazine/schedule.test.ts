import { test, expect } from 'vitest';
import { leafProgress, cycleLength } from './schedule';

const fwdEnd = 3 * 2.5 + 1.2;

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
