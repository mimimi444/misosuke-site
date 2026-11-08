// 「見せる」ページめくりの時間割。three.js に依存しない（試作と同じ値）。

const T_FLIP = 1.9;      // 1 枚めくるのにかかる秒数
const T_GAP = 2.5;       // 次の紙をめくり始めるまでの間隔
const T_HOLD_END = 1.2;  // 最後までめくってから戻し始めるまで
const T_RIFFLE = 0.12;   // パラパラ戻すときの 1 枚ごとの遅れ
const T_BACK = 0.8;      // 1 枚が戻るのにかかる秒数
const T_REST = 1.8;      // 戻し終わってから次の周回まで

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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
