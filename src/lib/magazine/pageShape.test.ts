import { describe, test, expect } from 'vitest';
import { PAPER, restAngle, shapePage, leafOffsets, vertexCount } from './pageShape';

const N = vertexCount();
const shape = (p: number, offRight = 0, offLeft = 0, air = 0, flutter = 0) => {
  const out = new Float32Array(N * 3);
  shapePage(out, p, offRight, offLeft, air, flutter);
  return out;
};
const idx = (i: number, j: number) => (j * (PAPER.segU + 1) + i) * 3;

/** 行 j の頂点を x の小さい順に並べた (x, y) の列 */
function row(out: Float32Array, j: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= PAPER.segU; i++) pts.push([out[idx(i, j)]!, out[idx(i, j) + 1]!]);
  return pts.sort((a, b) => a[0] - b[0]);
}

/** 折れ線の x における高さ（範囲外は undefined） */
function heightAt(pts: [number, number][], x: number): number | undefined {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k]!, [x1, y1] = pts[k + 1]!;
    if (x >= x0 && x <= x1) return x1 === x0 ? Math.max(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return undefined;
}

describe('紙のしなり', () => {
  test('背表紙で立ち上がり、外側は重力で垂れる', () => {
    expect(restAngle(0)).toBeCloseTo(PAPER.rise);
    expect(restAngle(PAPER.width)).toBeLessThan(0);
  });

  test('右に寝た紙は背（x=0）から始まり、外側の端は右（x>0）', () => {
    const out = shape(0);
    const mid = Math.floor(PAPER.segV / 2);
    expect(out[idx(0, mid)]).toBeCloseTo(0);
    expect(out[idx(PAPER.segU, mid)]!).toBeGreaterThan(0.5);
  });

  test('左に寝た紙は右の鏡写し', () => {
    const r = shape(0), l = shape(1);
    for (const i of [0, 10, PAPER.segU]) {
      expect(l[idx(i, 2)]).toBeCloseTo(-r[idx(i, 2)]!, 5);
      expect(l[idx(i, 2) + 1]).toBeCloseTo(r[idx(i, 2) + 1]!, 5);
    }
  });
});

describe('紙の重なり', () => {
  test('右の束で、上の紙は下の紙から紙の面に垂直な方向にちょうど gap 離れる', () => {
    const n = 4;
    const upper = leafOffsets(0, n), lower = leafOffsets(1, n);
    const a = shape(0, upper.offRight, upper.offLeft), b = shape(0, lower.offRight, lower.offLeft);
    for (const i of [0, 20, PAPER.segU]) {
      const d = Math.hypot(a[idx(i, 3)]! - b[idx(i, 3)]!, a[idx(i, 3) + 1]! - b[idx(i, 3) + 1]!);
      expect(d).toBeCloseTo(PAPER.gap, 5);
    }
  });

  test('めくっている紙は、右の束のいちばん上の紙より下に来ない（下のページに埋まらない）', () => {
    const n = 4;
    const top = leafOffsets(1, n);                       // 紙 0 をめくっている間、右の束のいちばん上は紙 1
    const stack = row(shape(0, top.offRight, top.offLeft), 3);
    const o = leafOffsets(0, n);
    for (let p = 0.05; p < 0.96; p += 0.05) {
      const flying = row(shape(p, o.offRight, o.offLeft, o.air), 3);
      for (const [x, y] of flying) {
        if (x <= 0.02) continue;                          // 背表紙のごく近くはすべての紙が集まるので除く
        const h = heightAt(stack, x);
        if (h !== undefined) expect(y, `p=${p.toFixed(2)} x=${x.toFixed(3)}`).toBeGreaterThanOrEqual(h - 1e-3);
      }
    }
  });
});

describe('読むモードの平らな紙', () => {
  const flat = (p: number, off: number) => {
    const out = new Float32Array(N * 3);
    shapePage(out, p, off, off, 0, 0, 1);
    return out;
  };

  test('flatten=1 の右の紙は、どの頂点も同じ高さ（水平）で、幅は紙の幅', () => {
    const out = flat(0, 0.05);
    for (let j = 0; j <= PAPER.segV; j++) for (let i = 0; i <= PAPER.segU; i++) expect(out[idx(i, j) + 1]).toBeCloseTo(0.05, 6);
    expect(out[idx(PAPER.segU, 0)]).toBeCloseTo(PAPER.width, 6);
  });

  test('flatten=1 の左の紙も水平で、背から左へ伸びる', () => {
    const out = flat(1, 0.03);
    for (let i = 0; i <= PAPER.segU; i++) expect(out[idx(i, 2) + 1]).toBeCloseTo(0.03, 6);
    expect(out[idx(PAPER.segU, 2)]).toBeCloseTo(-PAPER.width, 6);
  });

  test('flatten=0 は従来どおり', () => {
    const a = shape(0.4, 0.02, 0.03, 0.05, 0.1);
    const b = new Float32Array(N * 3);
    shapePage(b, 0.4, 0.02, 0.03, 0.05, 0.1, 0);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  test('平らでも、めくり途中の紙は外側が遅れてしなる', () => {
    const out = new Float32Array(N * 3);
    shapePage(out, 0.5, 0, 0, 0, 0, 1);
    const mid = Math.floor(PAPER.segV / 2);
    // 外側の端は背の真上より手前（まだ右側に残っている）
    expect(out[idx(PAPER.segU, mid)]!).toBeGreaterThan(out[idx(0, mid)]!);
  });
});
