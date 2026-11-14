// 「見せる」ページめくりの時間割。three.js に依存しない（試作と同じ値）。

const T_FLIP = 1.9;      // 1 枚めくるのにかかる秒数
const T_GAP = 2.5;       // 次の紙をめくり始めるまでの間隔
const T_HOLD_END = 1.2;  // 最後までめくってから戻し始めるまで
const T_RIFFLE = 0.12;   // パラパラ戻すときの 1 枚ごとの遅れ
const T_BACK = 0.8;      // 1 枚が戻るのにかかる秒数
const T_REST = 1.8;      // 戻し終わってから次の周回まで

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** めくり終わって戻し始めるまでの時刻（これ以降は RIFFLE） */
export function forwardEnd(leafCount: number): number {
  return leafCount * T_GAP + T_HOLD_END;
}

export function cycleLength(leafCount: number): number {
  return leafCount * T_GAP + T_HOLD_END + leafCount * T_RIFFLE + T_REST;
}

/** 紙 i のめくりの進み（0 = 右に寝ている、1 = 左に寝ている）。時刻 t は周回で繰り返す */
export function leafProgress(i: number, t: number, leafCount: number): number {
  const local = t % cycleLength(leafCount);
  const forwardEnd = leafCount * T_GAP + T_HOLD_END;
  if (local < forwardEnd) return ease(clamp01((local - i * T_GAP) / T_FLIP));
  // 最後の紙から先に、パラパラと戻す
  return 1 - ease(clamp01((local - forwardEnd - (leafCount - 1 - i) * T_RIFFLE) / T_BACK));
}

/**
 * 手でめくる（スワイプ）ときの、時間割の時刻の動かし方。
 * jump へは一気に移り（何も動いていない待ち時間を飛ばす）、そこから target へ短い時間で進める（戻す）。
 * 次へ: まだめくれていない最初の紙をめくり終わる時刻へ。最後までめくった後は、次の周回の 1 枚目。
 * 前へ: めくっている途中の紙、なければ最後にめくった紙を戻す。何もめくれていなければ null。
 */
export function manualTurn(t: number, leafCount: number, delta: 1 | -1): { jump: number; target: number } | null {
  if (leafCount <= 0) return null;
  const cycle = cycleLength(leafCount);
  const base = Math.floor(t / cycle) * cycle;
  const local = t - base;
  const end = forwardEnd(leafCount);
  if (local >= end) {
    // 戻している最中・最後まで行った後
    return delta === 1 ? { jump: t, target: base + cycle + T_FLIP } : null;
  }
  // まだめくり終わっていない最初の紙と、それがめくり途中か
  const first = Math.min(leafCount, Math.floor(Math.max(0, local - T_FLIP) / T_GAP) + (local >= T_FLIP ? 1 : 0));
  const d = Math.min(leafCount, Math.max(0, first));
  const turning = d < leafCount && local > d * T_GAP;
  if (delta === 1) {
    if (d >= leafCount) return { jump: t, target: base + cycle + T_FLIP };
    return { jump: base + Math.max(local, d * T_GAP), target: base + d * T_GAP + T_FLIP };
  }
  const j = turning ? d : d - 1;
  if (j < 0) return null;
  return { jump: base + Math.min(local, j * T_GAP + T_FLIP), target: base + j * T_GAP };
}
