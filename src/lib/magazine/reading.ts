// 「読む」モードの構図・ズーム・ページ送りの計算。three.js に依存しない。

/** パネルなどが占める画面の端の領域（px） */
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Zoom = { scale: number; x: number; y: number };

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
/** 紙面の左右この割合のクリック・タップでページを送る */
const EDGE = 0.22;

/**
 * 正面から見た紙が、パネルを除いた領域に余白付きで丁度収まるカメラの距離。
 * 投影の中心をパネルを除いた領域の中央へずらすのは、呼び出し側（camera.setViewOffset）で行う。
 */
export function fitDistance(opts: {
  pageW: number;
  pageH: number;
  fovV: number;
  aspect: number;
  viewW: number;
  viewH: number;
  insets: Insets;
  margin: number;
}): number {
  const { pageW, pageH, fovV, aspect, viewW, viewH, insets, margin } = opts;
  const availW = Math.max(1, viewW - insets.left - insets.right);
  const availH = Math.max(1, viewH - insets.top - insets.bottom);
  const t = 2 * Math.tan(fovV / 2);
  const byHeight = (pageH * (1 + 2 * margin)) / (t * (availH / viewH));
  const byWidth = (pageW * (1 + 2 * margin)) / (t * aspect * (availW / viewW));
  return Math.max(byHeight, byWidth);
}

/** 紙面の余白の中に、本来の縦横比で収めた絵の位置 */
export function imageRect(
  img: { width: number; height: number },
  box: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(box.width / img.width, box.height / img.height);
  const width = img.width * scale, height = img.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** 倍率を 1〜4 に、移動量を絵が画面の外へ逃げない範囲に収める */
export function clampZoom(z: Zoom, b: { viewW: number; viewH: number; contentW: number; contentH: number }): Zoom {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.scale));
  const maxX = Math.max(0, (b.contentW * scale - b.viewW) / 2);
  const maxY = Math.max(0, (b.contentH * scale - b.viewH) / 2);
  const clamp = (v: number, m: number) => (m === 0 ? 0 : Math.min(m, Math.max(-m, v)));
  return { scale, x: clamp(z.x, maxX), y: clamp(z.y, maxY) };
}

export function nextPageIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/** 紙面の左右の端のクリック・タップ。左＝前、右＝次 */
export function edgeAction(x: number, viewW: number): 'prev' | 'next' | null {
  if (x < viewW * EDGE) return 'prev';
  if (x > viewW * (1 - EDGE)) return 'next';
  return null;
}
