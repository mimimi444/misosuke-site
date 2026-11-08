// 雑誌の紙の形（しなりと重なり）。three.js に依存しない。
// 試作（docs/superpowers/specs/assets/2026-11-08-magazine-prototype.html の shapePage）から移植。

const deg = (d: number) => (d * Math.PI) / 180;

export const PAPER = {
  width: 1.35,
  height: 1.8,
  segU: 60,      // 背から外側への分割数
  segV: 6,       // 上下方向の分割数
  rise: deg(58), // 背表紙での立ち上がり
  sag: deg(-14), // 外側の垂れ
  fall: 0.32,    // 立ち上がりから垂れへ移る速さ
  lag: 0.55,     // めくり途中に外側が遅れる量
  gap: 0.012,    // 紙同士の間隔
} as const;

export function vertexCount(): number {
  return (PAPER.segU + 1) * (PAPER.segV + 1);
}

/** 右に寝ている紙の、背からの距離 s における向き（水平からの角度） */
export function restAngle(s: number): number {
  return PAPER.sag + (PAPER.rise - PAPER.sag) * Math.exp(-s / PAPER.fall);
}

/** 紙 i（0 から）の重なり。右の束では若い番号ほど上、左の束では後からめくった紙ほど上 */
export function leafOffsets(i: number, leafCount: number): { offRight: number; offLeft: number; air: number } {
  return {
    offRight: (leafCount - i + 1) * PAPER.gap,
    offLeft: (i + 2) * PAPER.gap,
    air: (leafCount + 2) * PAPER.gap,
  };
}

/**
 * 1 枚の紙の頂点（xyz、行 j・列 i の順）を out に書く。
 * p はめくりの進み（0 = 右、1 = 左）。外側ほど遅れてついてくる（空気と重さでしなる）。
 * 間隔は縦ではなく紙の面に垂直な方向に取り、右の束では表が上、左の束では裏が上なので向きを反転する。
 * めくっている途中は束から air だけ浮かせる。flutter は空気でわずかに波打つ量。
 */
export function shapePage(out: Float32Array, p: number, offRight: number, offLeft: number, air: number, flutter: number): void {
  const { width: W, height: H, segU, segV, lag } = PAPER;
  const du = W / segU;
  for (let j = 0; j <= segV; j++) {
    const v = (j / segV - 0.5) * H;
    const edge = Math.abs(j / segV - 0.5) * 2; // 上下の端ほど 1（角がわずかに余計に垂れる）
    let x = 0, y = 0;
    for (let i = 0; i <= segU; i++) {
      const s = i * du, f = s / W;
      const ps = Math.min(1, Math.max(0, p * (1 + lag) - lag * f));
      const eps = ps * ps * (3 - 2 * ps);
      const aR = restAngle(s) - edge * 0.06 * f;
      const aL = Math.PI - aR;
      const a = aR + (aL - aR) * eps + flutter * Math.sin(Math.PI * eps) * Math.sin(f * Math.PI);
      if (i > 0) { x += Math.cos(a) * du; y += Math.sin(a) * du; }
      // 束から離す向き: 右に寝ているときの上向き (-sin aR, cos aR) から、左に寝ているときの上向き (sin aR, cos aR) へ
      // 連続的に移す。紙の法線で離すと、垂直を越えた瞬間に向きが反転して右の束へ押し込まれるため。
      // 垂直を越えた後は、左の束に着地する直前まで真上に浮かせる（背表紙付近で右の束へ寄らないように）
      const side = eps < 0.5 ? -(1 - 2 * eps) : Math.pow(2 * eps - 1, 4);
      // 背表紙のところでは紙は背の上に縦に重なるので、付け根に近いほど真上に離す
      const hinge = 1 - Math.exp(-s / 0.08);
      const nx = Math.sin(aR) * side * hinge, ny = Math.cos(aR);
      const nl = Math.hypot(nx, ny) || 1;
      const o = offRight * (1 - eps) + offLeft * eps + air * Math.sin(Math.PI * eps);
      const k = (j * (segU + 1) + i) * 3;
      out[k] = x + (nx / nl) * o;
      out[k + 1] = y + (ny / nl) * o;
      out[k + 2] = v;
    }
  }
}
