// Showcase.astro のブラウザ側の処理。three.js のシーンを動的に読み込む（中身は作品一覧の先頭と同じ並び）。
import type { Showcase } from './showcase';
import { setStage } from './stage';

/** 開いている見開きの右ページの作品へのリンク */
function hrefFor(show: Showcase, pageIndex: number): string {
  const page = show.pages[pageIndex];
  if (!page) return '#';
  // 作品一覧のサムネイルと同じところを開く
  return page.href;
}

const SWIPE_PX = 30;

/** スマホ・タブレット: 雑誌の上の横スワイプでページをめくる（左へ＝次、右へ＝前）。スワイプしたときはリンクを開かない */
function bindSwipe(root: HTMLElement, hit: HTMLAnchorElement, flip: (delta: 1 | -1) => void) {
  let start: { x: number; y: number; id: number } | null = null;
  let swiped = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    swiped = false;
  });
  root.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      flip(dx < 0 ? 1 : -1);
    }
  });
  root.addEventListener('pointercancel', () => { start = null; });
  // スワイプの指を離したときに起きるクリックで、作品を開かない
  hit.addEventListener('click', (e) => {
    if (!swiped) return;
    swiped = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}

async function setup(root: HTMLElement) {
  const json = root.querySelector<HTMLScriptElement>('[data-role="showcase"]');
  const canvas = root.querySelector<HTMLCanvasElement>('.showcase-canvas');
  const hit = root.querySelector<HTMLAnchorElement>('.showcase-hit');
  if (!json || !canvas || !hit) return setStage(null);

  // 3D が使えなければ、HTML の固定内容（平面の見開き）のまま
  const { canUseWebGL, createShowcaseScene } = await import('./magazine/scene');
  if (!canUseWebGL()) return setStage(null);

  const show = JSON.parse(json.textContent || 'null') as Showcase | null;
  if (!show) return setStage(null);

  const set = (role: string, text: string) => {
    const el = root.querySelector(`[data-role="${role}"]`);
    if (el) el.textContent = text;
  };
  set('title', show.title);
  set('count', `${show.pages.length} PAGES`);
  hit.href = hrefFor(show, 0);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.hidden = false;
  try {
    const api = await createShowcaseScene(canvas, {
      pages: show.pages,
      reducedMotion,
      onState: ({ state, page, total, rightPageIndex }) => {
        set('state', state);
        set('turn', `${reducedMotion ? 'MANUAL' : 'AUTO TURN'} ・ ${String(page).padStart(2, '0')} / ${String(total).padStart(2, '0')}`);
        hit.href = hrefFor(show, rightPageIndex);
      },
    });
    root.dataset.mode = '3d';
    bindSwipe(root, hit, (delta) => api.flip(delta));
    setStage(api);
  } catch (e) {
    console.error('3D の雑誌を表示できなかったので平面表示にする', e);
    canvas.hidden = true;
    setStage(null);
  }
}

export function initShowcases() {
  const roots = document.querySelectorAll<HTMLElement>('.showcase');
  if (roots.length === 0) setStage(null);
  roots.forEach((root) => void setup(root));
}
