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

/** 雑誌のリンクの行き先。空なら押しても何も開かない。サイトの外は新しいタブで開く */
function setHref(hit: HTMLAnchorElement, href: string) {
  if (!href) { hit.removeAttribute('href'); return; }
  hit.href = href;
  const external = /^https?:\/\//.test(href) && new URL(href).origin !== location.origin;
  if (external) { hit.target = '_blank'; hit.rel = 'noopener'; }
  else { hit.removeAttribute('target'); hit.removeAttribute('rel'); }
}

/** 読み込み画面の 0% → 100%。実際の進みへ、数字が滑らかに追いつくように数える */
function createLoading(root: HTMLElement) {
  const value = root.querySelector<HTMLElement>('[data-role="loading-value"]');
  const bar = root.querySelector<HTMLElement>('[data-role="loading-bar"]');
  let target = 0, shown = 0, raf = 0;
  let done: (() => void) | null = null;
  const draw = () => {
    if (value) value.textContent = `${Math.round(shown)}%`;
    if (bar) bar.style.width = `${shown}%`;
  };
  const tick = () => {
    raf = 0;
    shown = Math.min(target, shown + Math.max(0.6, (target - shown) * 0.12));
    draw();
    if (shown < target) raf = requestAnimationFrame(tick);
    else if (shown >= 100) done?.();
  };
  return {
    progress(ratio: number) {
      target = Math.max(target, Math.min(100, ratio * 100));
      if (!raf) raf = requestAnimationFrame(tick);
    },
    /** 表示が 100% に達したら解決する */
    finished(): Promise<void> {
      target = 100;
      return new Promise((resolve) => {
        done = resolve;
        if (shown >= 100) resolve();
        else if (!raf) raf = requestAnimationFrame(tick);
      });
    },
  };
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

  // 3D が使えなければ、HTML の固定内容（平面の見開き）のまま（読み込み画面は出さない）
  const flat = () => { root.dataset.mode = 'flat'; setStage(null); };
  const loading = createLoading(root);
  let scene: typeof import('./magazine/scene');
  try {
    scene = await import('./magazine/scene');
  } catch (e) {
    console.error('3D の雑誌を読み込めなかったので平面表示にする', e);
    return flat();
  }
  const { canUseWebGL, createShowcaseScene } = scene;
  if (!canUseWebGL()) return flat();

  const show = JSON.parse(json.textContent || 'null') as Showcase | null;
  if (!show) return flat();

  const set = (role: string, text: string) => {
    const el = root.querySelector(`[data-role="${role}"]`);
    if (el) el.textContent = text;
  };
  set('title', show.title);
  set('count', `${show.pages.length} PAGES`);
  setHref(hit, hrefFor(show, 0));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.hidden = false;
  try {
    const api = await createShowcaseScene(canvas, {
      pages: show.pages,
      reducedMotion,
      startClosed: true,
      onProgress: (ratio) => loading.progress(ratio),
      onState: ({ page, total, rightPageIndex, guestHref }) => {
        set('turn', `${reducedMotion ? 'MANUAL' : 'AUTO TURN'} ・ ${String(page).padStart(2, '0')} / ${String(total).padStart(2, '0')}`);
        // 詳細から戻ってのせた紙が見えている間は、その作品を開く
        setHref(hit, guestHref ?? hrefFor(show, rightPageIndex));
      },
    });
    root.dataset.mode = '3d';
    bindSwipe(root, hit, (delta) => api.flip(delta));
    setStage(api);
    // 100% まで数え終わったら読み込み画面を消し、閉じた雑誌を開いて最新の作品を見せる
    await loading.finished();
    root.dataset.loaded = '';
    window.setTimeout(() => { root.dataset.loadingDone = ''; }, reducedMotion ? 0 : 500);
    api.open();
  } catch (e) {
    console.error('3D の雑誌を表示できなかったので平面表示にする', e);
    canvas.hidden = true;
    flat();
  }
}

export function initShowcases() {
  const roots = document.querySelectorAll<HTMLElement>('.showcase');
  if (roots.length === 0) setStage(null);
  roots.forEach((root) => void setup(root));
}
