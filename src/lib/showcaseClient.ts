// Showcase.astro のブラウザ側の処理。ランダムに作品を選び直し、three.js のシーンを動的に読み込む。
import { pickShowcase, type Showcase, type ShowcaseCandidates } from './showcase';
import { railHref } from './links';
import { workPath } from './workMeta';

/** 開いている見開きの右ページの作品へのリンク */
function hrefFor(show: Showcase, pageIndex: number): string {
  const page = show.pages[pageIndex];
  if (!page) return '#';
  return show.kind === 'album' ? railHref(page.id, { slug: show.slug, page: pageIndex + 1 }) : workPath(page.id);
}

async function setup(root: HTMLElement) {
  const json = root.querySelector<HTMLScriptElement>('[data-role="candidates"]');
  const canvas = root.querySelector<HTMLCanvasElement>('.showcase-canvas');
  const hit = root.querySelector<HTMLAnchorElement>('.showcase-hit');
  if (!json || !canvas || !hit) return;

  // 3D が使えなければ、HTML の固定内容（平面の見開き）のまま。選び直すと表示とリンクが食い違うため先に確かめる
  const { canUseWebGL, createShowcaseScene } = await import('./magazine/scene');
  if (!canUseWebGL()) return;

  const candidates = JSON.parse(json.textContent || '{}') as ShowcaseCandidates;
  const show = pickShowcase(candidates, Math.random);
  if (!show) return;

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
    // 開発中だけ、開発者ツールから読むモードを試せるようにする（Task 5 で詳細に組み込むまで）
    if (import.meta.env.DEV) (window as unknown as { __showcase?: typeof api }).__showcase = api;
  } catch (e) {
    console.error('3D の雑誌を表示できなかったので平面表示にする', e);
    canvas.hidden = true;
  }
}

export function initShowcases() {
  document.querySelectorAll<HTMLElement>('.showcase').forEach((root) => void setup(root));
}
