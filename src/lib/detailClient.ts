// 作品詳細（DetailPanel.astro）のブラウザ側の処理: パネルの表示、ページ送り・ズームの操作、閉じる、フォーカス。
// URL と履歴は扱わない（detailRouter が setDetailHandlers で受け取って行う）。
import type { DetailData } from './detail';
import type { ShowcaseApi } from './magazine/scene';
import { clampZoom, edgeAction, nextPageIndex, type Insets, type Zoom } from './magazine/reading';
import { PAPER } from './magazine/pageShape';
import { albumHref } from './albumSlug';
import { tagHref } from './tags';
import { whenStage } from './stage';

/** 読むモードで紙の周りに残す余白（scene.ts の READ_MARGIN と同じ） */
const READ_MARGIN = 0.04;
const SWIPE_PX = 30;
const TAP_MOVE_PX = 8;
const TAP_MS = 350;
const DOUBLE_TAP_MS = 300;

export type DetailHandlers = {
  /** ページを送ったとき（index は 0 始まり） */
  onPageChange?: (index: number, data: DetailData) => void;
  /** ✕・Esc で閉じたいとき。無ければその場で閉じる */
  onCloseRequest?: () => void;
};

type Els = {
  root: HTMLElement;
  view: HTMLElement;
  panel: HTMLElement;
  flatImg: HTMLImageElement;
  zoomBar: HTMLElement;
  zoomValue: HTMLElement;
  live: HTMLElement;
};

let els: Els | null = null;
let handlers: DetailHandlers = {};
let data: DetailData | null = null;
let index = 0;
let zoom: Zoom = { scale: 1, x: 0, y: 0 };
let api: ShowcaseApi | null = null;
let returnFocus: HTMLElement | null = null;
/** 開くたびに増やす（閉じた後・開き直した後に、古い非同期の続きを捨てる） */
let generation = 0;

export function setDetailHandlers(h: DetailHandlers): void {
  handlers = h;
}

export function isDetailOpen(): boolean {
  return !!els && !els.root.hidden;
}

export function currentDetail(): { data: DetailData; index: number } | null {
  return data && isDetailOpen() ? { data, index } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function role<T extends HTMLElement>(name: string): T {
  return els!.root.querySelector<T>(`[data-role="${name}"]`)!;
}

/** パネルの中身を、今のデータとページに合わせる（DetailPanel.astro と同じ構造） */
function render() {
  if (!els || !data) return;
  const page = data.pages[index]!;
  const isAlbum = data.kind === 'album';
  const total = data.pages.length;
  const show = (el: HTMLElement, on: boolean) => { el.hidden = !on; };

  role('kind').textContent = isAlbum ? 'ALBUM' : 'WORK';
  show(role('album'), isAlbum);
  role('album-title').textContent = isAlbum ? data.title : '';
  role('album-desc').textContent = isAlbum ? data.description ?? '' : '';
  show(role('album-desc'), isAlbum && !!data.description);
  role('counter').textContent = `${pad(index + 1)} / ${pad(total)}`;

  role('title').textContent = page.title;
  role('date').textContent = page.date;
  role('desc').textContent = page.description ?? '';
  show(role('desc'), !!page.description);

  const tags = role<HTMLUListElement>('tags');
  tags.replaceChildren(...page.tags.map((t) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = tagHref(t);
    a.textContent = `#${t}`;
    li.appendChild(a);
    return li;
  }));
  show(tags, page.tags.length > 0);

  const albumLink = role('album-link');
  show(albumLink, data.kind === 'work' && !!data.album);
  if (data.album) {
    albumLink.querySelector('a')!.href = albumHref(data.album.slug);
    role('album-link-title').textContent = `：${data.album.title}`;
  }

  show(role('nav'), total >= 2);
  els.root.querySelector<HTMLButtonElement>('[data-action="prev"]')!.disabled = index === 0;
  els.root.querySelector<HTMLButtonElement>('[data-action="next"]')!.disabled = index >= total - 1;

  if (els.flatImg.getAttribute('src') !== page.src) els.flatImg.src = page.src;
  els.flatImg.alt = page.alt;
  els.flatImg.hidden = false;
}

/** 詳細の絵の領域（パネルを除く）が、雑誌のキャンバス（詳細全体と同じ大きさ）の端から離れている量 */
function currentInsets(): Insets {
  if (!els) return { top: 0, right: 0, bottom: 0, left: 0 };
  const r = els.root.getBoundingClientRect(), v = els.view.getBoundingClientRect();
  return { top: v.top - r.top, right: r.right - v.right, bottom: r.bottom - v.bottom, left: v.left - r.left };
}

/** 倍率 1 のときの紙（3D）または絵（平面）の画面上の大きさ */
function contentSize(): { w: number; h: number } {
  const v = els!.view.getBoundingClientRect();
  if (!api) {
    const img = els!.flatImg;
    return { w: img.offsetWidth, h: img.offsetHeight };
  }
  const aspect = PAPER.width / PAPER.height;
  const h = Math.min(v.height, v.width / aspect) / (1 + 2 * READ_MARGIN);
  return { w: h * aspect, h };
}

function applyZoom(z: Zoom) {
  if (!els) return;
  const v = els.view.getBoundingClientRect(), c = contentSize();
  zoom = clampZoom(z, { viewW: v.width, viewH: v.height, contentW: c.w, contentH: c.h });
  const zoomed = zoom.scale > 1.001;
  if (zoomed) els.root.dataset.zoomed = '';
  else delete els.root.dataset.zoomed;
  els.zoomBar.hidden = !zoomed;
  els.zoomValue.textContent = `${zoom.scale.toFixed(1)}×`;
  if (api) api.setZoom(zoom);
  else els.flatImg.style.transform = zoomed ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` : '';
}

/** 画面上の点 (px、絵の領域の中心から) を動かさずに倍率を変える */
function zoomAt(px: number, py: number, scale: number) {
  const k = scale / zoom.scale;
  applyZoom({ scale, x: px - (px - zoom.x) * k, y: py - (py - zoom.y) * k });
}

function resetZoom() {
  applyZoom({ scale: 1, x: 0, y: 0 });
}

function turn(delta: 1 | -1) {
  if (!data) return;
  const next = nextPageIndex(index, delta, data.pages.length);
  if (next === index) return;
  index = next;
  resetZoom();
  api?.turn(delta);
  render();
  if (els) els.live.textContent = `${index + 1} / ${data.pages.length} ページ`;
  handlers.onPageChange?.(index, data);
}

function requestClose() {
  if (handlers.onCloseRequest) handlers.onCloseRequest();
  else closeDetail();
}

/** 詳細を開く。開いていれば中身を切り替える */
export async function openDetail(next: DetailData, opts: { returnFocus?: HTMLElement | null } = {}): Promise<void> {
  if (!els || next.pages.length === 0) return;
  const wasOpen = isDetailOpen();
  if (!wasOpen) returnFocus = opts.returnFocus ?? null;
  data = next;
  index = Math.max(0, Math.min(next.startIndex, next.pages.length - 1));
  els.live.textContent = '';
  els.root.hidden = false;
  resetZoom();
  render();
  role('title').focus({ preventScroll: true });

  const gen = ++generation;
  const stage = await whenStage();
  if (gen !== generation || !stage) return;
  api = stage;
  api.onPage = undefined;
  await api.read({ pages: next.pages, startIndex: index, insets: currentInsets() });
  if (gen !== generation) return;
  els.root.dataset.mode = '3d';
  els.flatImg.style.transform = '';
  applyZoom(zoom);
}

/** 詳細を閉じ、「見せる」に戻して、開いた元のリンクへフォーカスを戻す */
export function closeDetail(): void {
  if (!els || !isDetailOpen()) return;
  generation++;
  resetZoom();
  els.root.hidden = true;
  delete els.root.dataset.mode;
  api?.show();
  data = null;
  const back = returnFocus;
  returnFocus = null;
  if (back?.isConnected) back.focus({ preventScroll: true });
}

function focusables(): HTMLElement[] {
  return [...els!.root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((e) => !e.closest('[hidden]') && e.offsetParent !== null);
}

function onKey(e: KeyboardEvent) {
  if (!isDetailOpen() || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
  if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    turn(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (e.key === 'Tab') {
    // Tab は詳細の中で循環させる
    const list = focusables();
    if (list.length === 0) return;
    const first = list[0]!, last = list[list.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && els!.root.contains(active);
    if (e.shiftKey && (!inside || active === first || active === role('title'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
  }
}

/** 絵の領域の上での、タップ・ダブルタップ・スワイプ・ドラッグ・ピンチ */
function bindGestures(view: HTMLElement) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number; t: number; zoom: Zoom } | null = null;
  let pinch: { dist: number; zoom: Zoom } | null = null;
  let moved = false, pinched = false;
  let lastTap = { t: 0, x: 0, y: 0 };
  let pendingTap = 0;

  /** 絵の領域の中心からの位置 */
  const local = (x: number, y: number) => {
    const r = view.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2, left: x - r.left, width: r.width };
  };

  const onTap = (x: number, y: number) => {
    const now = performance.now();
    if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
      // ダブルタップ・ダブルクリック: 2 倍 ⇔ 1 倍
      clearTimeout(pendingTap);
      lastTap.t = 0;
      if (zoom.scale > 1.001) resetZoom();
      else { const p = local(x, y); zoomAt(p.x, p.y, 2); }
      return;
    }
    lastTap = { t: now, x, y };
    clearTimeout(pendingTap);
    pendingTap = window.setTimeout(() => {
      if (zoom.scale > 1.001) return;
      const p = local(x, y);
      const action = edgeAction(p.left, p.width);
      if (action) turn(action === 'next' ? 1 : -1);
    }, DOUBLE_TAP_MS);
  };

  view.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, t: performance.now(), zoom: { ...zoom } };
      moved = pinched = false;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: { ...zoom } };
      pinched = true;
    }
  });

  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = local((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      const scale = Math.min(4, Math.max(1, (pinch.zoom.scale * dist) / pinch.dist));
      zoomAt(mid.x, mid.y, scale);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_MOVE_PX) moved = true;
    if (start.zoom.scale > 1.001 && moved) applyZoom({ scale: zoom.scale, x: start.zoom.x + dx, y: start.zoom.y + dy });
  });

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size > 0 || !start) return;
    const s = start;
    start = null;
    if (cancelled || pinched) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!moved && performance.now() - s.t < TAP_MS) onTap(e.clientX, e.clientY);
    else if (s.zoom.scale <= 1.001 && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
  };
  view.addEventListener('pointerup', (e) => end(e, false));
  view.addEventListener('pointercancel', (e) => end(e, true));

  // Ctrl+ホイール（トラックパッドのピンチを含む）で拡大縮小
  view.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    zoomAt(p.x, p.y, Math.min(4, Math.max(1, zoom.scale * Math.exp(-e.deltaY * 0.01))));
  }, { passive: false });
  // iOS Safari のページ全体のピンチズームを止める
  view.addEventListener('gesturestart', (e) => e.preventDefault());
}

export function initDetail(): void {
  const root = document.querySelector<HTMLElement>('.detail');
  if (!root || els) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  els = {
    root,
    view: q('[data-role="view"]'),
    panel: q('[data-role="panel"]'),
    flatImg: q<HTMLImageElement>('[data-role="flat-img"]'),
    zoomBar: q('[data-role="zoom"]'),
    zoomValue: q('[data-role="zoom-value"]'),
    live: q('[data-role="live"]'),
  };

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'close') requestClose();
    else if (action === 'prev') turn(-1);
    else if (action === 'next') turn(1);
    else if (action === 'unzoom') resetZoom();
    else if (action === 'collapse') {
      const collapsed = els!.panel.toggleAttribute('data-collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.textContent = collapsed ? 'ひらく' : 'たたむ';
    }
  });
  document.addEventListener('keydown', onKey);
  bindGestures(els.view);

  // パネルの大きさが変わったら（画面幅・たたむ）、絵がパネルに重ならないよう構図を直す
  new ResizeObserver(() => {
    if (!isDetailOpen()) return;
    api?.setInsets(currentInsets());
    applyZoom(zoom);
  }).observe(els.view);

  // サーバーが詳細を開いた状態で返したとき
  const json = root.querySelector<HTMLScriptElement>('[data-role="detail-data"]');
  if (json && !root.hidden) {
    try {
      void openDetail(JSON.parse(json.textContent || 'null') as DetailData);
    } catch (e) {
      console.error('詳細のデータを読めなかった', e);
    }
  }
}
