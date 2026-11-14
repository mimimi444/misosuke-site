import { describe, expect, test } from 'vitest';
import { layoutWidgets, RENDER_H, wrapLines } from './render';

const measure = (s: string) => [...s].length * 10;

describe('文字の折り返し', () => {
  test('幅を超えたら次の行へ、改行は保つ', () => {
    expect(wrapLines('あいうえおかき\nく', 50, 5, measure)).toEqual(['あいうえお', 'かき', 'く']);
  });
  test('行数を超えたら最後の行を … で終える', () => {
    expect(wrapLines('あいうえおかきくけこさしすせそ', 50, 2, measure)).toEqual(['あいうえお', 'かきくけ…']);
  });
  test('行頭の空白は捨てる', () => {
    expect(wrapLines('abcde fgh', 50, 3, measure)).toEqual(['abcde', 'fgh']);
  });
});

describe('ウィジェットの並び', () => {
  test('上から積み、全体をページの縦の中央に置く', () => {
    const boxes = layoutWidgets([{ type: 'heading' }, { type: 'divider' }]);
    const unit = RENDER_H / 14;
    expect(boxes[0]!.h).toBeCloseTo(unit * 2);
    expect(boxes[1]!.y).toBeCloseTo(boxes[0]!.y + boxes[0]!.h);
    expect(boxes[0]!.y).toBeCloseTo((RENDER_H - unit * 3) / 2);
  });
});
