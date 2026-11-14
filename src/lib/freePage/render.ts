// フリーページを canvas に描く。管理画面のプレビューと、トップの雑誌の紙（3D）で同じ描き方を使う。
import { MAX_UNITS, WIDGETS, type Widget } from './model';

export type FreePageColors = { ink: string; muted: string; accent: string; line: string };

/** 描く領域（紙面の絵の枠と同じ縦横比: 760 × 970）の、この倍率の大きさ */
export const RENDER_W = 760 * 2;
export const RENDER_H = 970 * 2;

const FONT = '"Noto Sans JP", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * 文字列を、幅に収まる行に分ける（日本語は 1 文字ずつ、改行は保つ）。maxLines を超えたら最後の行を … で終える。
 * measure は文字列の幅を返す関数（canvas の measureText など）。
 */
export function wrapLines(text: string, maxWidth: number, maxLines: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of [...para]) {
      if (line && measure(line + ch) > maxWidth) {
        lines.push(line);
        line = ch.trim() ? ch : '';
      } else line += ch;
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last && measure(last + '…') > maxWidth) last = [...last].slice(0, -1).join('');
  kept[maxLines - 1] = last + '…';
  return kept;
}

/** ウィジェットを上から積んだときの、それぞれの位置（ページの中で縦に中央寄せ） */
export function layoutWidgets(widgets: Pick<Widget, 'type'>[], height = RENDER_H): { y: number; h: number }[] {
  const unitH = height / MAX_UNITS;
  const total = widgets.reduce((s, w) => s + WIDGETS[w.type].units * unitH, 0);
  let y = Math.max(0, (height - total) / 2);
  return widgets.map((w) => {
    const h = WIDGETS[w.type].units * unitH;
    const box = { y, h };
    y += h;
    return box;
  });
}

/**
 * フリーページを描く。ctx は RENDER_W × RENDER_H の canvas（背景は描かない＝紙の色のまま）。
 * images は画像ウィジェットの imageId → 読み込んだ画像（無ければ枠だけ）。
 */
export function drawFreePage(
  ctx: CanvasRenderingContext2D,
  widgets: Widget[],
  images: Map<string, CanvasImageSource & { width: number; height: number }>,
  colors: FreePageColors,
): void {
  const W = RENDER_W, pad = 40;
  const boxes = layoutWidgets(widgets);
  ctx.textBaseline = 'top';
  widgets.forEach((w, i) => {
    const { y, h } = boxes[i]!;
    const text = (weight: string, family: string, color: string, size: number, lineH: number, value: string, align: CanvasTextAlign = 'left') => {
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      const maxLines = Math.max(1, Math.floor((h - pad * 0.5) / (size * lineH)));
      const lines = wrapLines(value, W - pad * 2, maxLines, (s) => ctx.measureText(s).width);
      const blockH = lines.length * size * lineH;
      const top = y + (h - blockH) / 2;
      const x = align === 'center' ? W / 2 : pad;
      lines.forEach((l, k) => ctx.fillText(l, x, top + k * size * lineH + (size * (lineH - 1)) / 2));
      return { top, blockH, lines, x };
    };
    switch (w.type) {
      case 'heading':
        text('700', FONT, colors.ink, 100, 1.3, w.text);
        break;
      case 'text':
        text('400', FONT, colors.ink, 64, 1.6, w.text);
        break;
      case 'note':
        text('400', MONO, colors.muted, 44, 1.4, w.text);
        break;
      case 'link': {
        const r = text('700', FONT, colors.accent, 60, 1.4, `→ ${w.label}`);
        // 下線
        ctx.fillStyle = colors.accent;
        const width = Math.min(W - pad * 2, ctx.measureText(r.lines[0] ?? '').width);
        ctx.fillRect(r.x, r.top + r.blockH - 6, width, 5);
        break;
      }
      case 'divider':
        ctx.fillStyle = colors.line;
        ctx.fillRect(pad, y + h / 2 - 2, W - pad * 2, 4);
        break;
      case 'image': {
        const img = images.get(w.imageId);
        const bw = W - pad * 2, bh = h - pad;
        if (!img) {
          ctx.strokeStyle = colors.line;
          ctx.lineWidth = 4;
          ctx.strokeRect(pad, y + pad / 2, bw, bh);
          break;
        }
        const k = Math.min(bw / img.width, bh / img.height);
        const dw = img.width * k, dh = img.height * k;
        ctx.drawImage(img, pad + (bw - dw) / 2, y + pad / 2 + (bh - dh) / 2, dw, dh);
        break;
      }
    }
  });
}
