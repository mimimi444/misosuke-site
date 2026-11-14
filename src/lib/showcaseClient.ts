// Showcase.astro のブラウザ側の処理。ランダムに作品を選び直し、three.js のシーンを動的に読み込む。
import { pickShowcase, type Showcase, type ShowcaseCandidates } from './showcase';
import { railHref } from './links';
import { workPath } from './workMeta';
import { setStage } from './stage';

/** 開いている見開きの右ページの作品へのリンク */
function hrefFor(show: Showcase, pageIndex: number): string {
  const page = show.pages[pageIndex];
  if (!page) return '#';
  if (show.kind === 'album') return railHref(page.id, { slug: show.slug, page: pageIndex + 1 });
  // 仮の雑誌: アルバムの表紙ならアルバム、1 枚ものなら作品
  return show.pages[pageIndex]?.href ?? workPath(page.id);
}

async function setup(root: HTMLElement) {
  const json = root.querySelector<HTMLScriptElement>('[data-role="candidates"]');
  const canvas = root.querySelector<HTMLCanvasElement>('.showcase-canvas');
  const hit = root.querySelector<HTMLAnchorElement>('.showcase-hit');
  if (!json || !canvas || !hit) return setStage(null);

  // 3D が使えなければ、HTML の固定内容（平面の見開き）のまま。選び直すと表示とリンクが食い違うため先に確かめる
  const { canUseWebGL, createShowcaseScene } = await import('./magazine/scene');
  if (!canUseWebGL()) return setStage(null);

  const candidates = JSON.parse(json.textContent || '{}') as ShowcaseCandidates;
  const show = pickShowcase(candidates, Math.random);
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
