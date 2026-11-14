// 流れる作品一覧（Rail.astro）のブラウザ側の処理。
// 一定速度で流し、ホバー・フォーカス・タップで慣性をつけて止め、選んだ作品を拡大してメタ情報を浮かべる。

import type { RailItem } from './rail';

const SPEED = 22;          // 流れる速さ（px/秒）
const EASE = 4;            // 速度が目標に近づく速さ（大きいほど早く止まる・戻る）
const PREFETCH_PX = 600;   // 残りがこれより少なくなったら続きを読み足す
const MAX_FAILURES = 4;    // 読み足しがこの回数続けて失敗したら諦める（失敗のたびに待ち時間を倍にする）

type State = {
  root: HTMLElement;
  viewport: HTMLElement;
  track: HTMLElement;
  pop: HTMLElement;
  vertical: boolean;
  reduced: boolean;
  offset: number;
  velocity: number;
  holding: boolean;
  active: HTMLAnchorElement | null;
  /** タッチで 1 回目にタップしたサムネイル（フォーカスで選ばれたものとは区別する） */
  tapped: HTMLAnchorElement | null;
  nextCursor: string;
  loading: boolean;
  /** 読み足しの連続失敗回数と、次に試してよい時刻 */
  failures: number;
  retryAt: number;
  looping: boolean;
};

function originals(s: State): HTMLElement[] {
  return [...s.track.querySelectorAll<HTMLElement>('.rail-cell:not([data-clone])')];
}

/** 元の並びの長さ（px）。gap を含む */
function originalLength(s: State): number {
  const cells = originals(s);
  if (cells.length === 0) return 0;
  const first = cells[0]!.getBoundingClientRect(), last = cells[cells.length - 1]!.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(s.track).gap || '0');
  return (s.vertical ? last.bottom - first.top : last.right - first.left) + gap;
}

function viewportLength(s: State): number {
  return s.vertical ? s.viewport.clientHeight : s.viewport.clientWidth;
}

/** 画面を埋められるだけの件数があるときだけ、複製を付けて切れ目なくループさせる */
function rebuildLoop(s: State) {
  s.track.querySelectorAll('[data-clone]').forEach((n) => n.remove());
  s.looping = !s.reduced && originalLength(s) > viewportLength(s);
  if (!s.looping) { s.offset = 0; applyOffset(s); return; }
  for (const cell of originals(s)) {
    const clone = cell.cloneNode(true) as HTMLElement;
    clone.dataset.clone = '';
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    s.track.appendChild(clone);
  }
}

function applyOffset(s: State) {
  s.track.style.transform = s.vertical ? `translateY(${-s.offset}px)` : `translateX(${-s.offset}px)`;
}

function cellHtml(item: RailItem): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'rail-cell';
  const a = document.createElement('a');
  a.className = 'rail-item';
  a.href = item.href;
  a.dataset.title = item.title;
  a.dataset.date = item.date;
  a.dataset.tags = JSON.stringify(item.tags);
  a.dataset.album = item.albumTitle ?? '';
  const img = document.createElement('img');
  img.src = item.thumb;
  img.alt = item.alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 400;
  img.height = 400;
  a.appendChild(img);
  li.appendChild(a);
  return li;
}

async function loadMore(s: State) {
  if (s.loading || !s.nextCursor || performance.now() < s.retryAt) return;
  s.loading = true;
  try {
    const params = new URLSearchParams({ cursor: s.nextCursor });
    if (s.root.dataset.tag) params.set('tag', s.root.dataset.tag);
    const res = await fetch(`/api/rail?${params}`).catch(() => null);
    if (!res || !res.ok) {
      // 失敗が続いても毎フレーム送り続けないよう、待ち時間を 2, 4, 8 秒…と伸ばし、続けて失敗したら諦める
      s.failures++;
      if (s.failures >= MAX_FAILURES) s.nextCursor = '';
      else s.retryAt = performance.now() + 1000 * 2 ** s.failures;
      return;
    }
    s.failures = 0;
    const page = (await res.json()) as { items: RailItem[]; nextCursor: string | null };
    const firstClone = s.track.querySelector('[data-clone]');
    for (const item of page.items) s.track.insertBefore(cellHtml(item), firstClone);
    s.nextCursor = page.nextCursor ?? '';
    rebuildLoop(s);
  } finally {
    s.loading = false;
  }
}

function showPop(s: State, a: HTMLAnchorElement) {
  if (s.active && s.active !== a) s.active.classList.remove('is-active');
  s.active = a;
  a.classList.add('is-active');
  const pop = s.pop;
  pop.querySelector('.rail-pop-title')!.textContent = a.dataset.title ?? '';
  pop.querySelector('.rail-pop-date')!.textContent = a.dataset.date ?? '';
  const tags = pop.querySelector('.rail-pop-tags')!;
  tags.replaceChildren(
    ...(JSON.parse(a.dataset.tags || '[]') as string[]).map((t) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `#${t}`;
      return chip;
    }),
  );
  const album = a.dataset.album;
  pop.querySelector('.rail-pop-album')!.textContent = album ? `アルバム: ${album}` : '';
  (pop.querySelector('.rail-pop-open') as HTMLAnchorElement).href = a.href;
  pop.hidden = false;

  // 位置: PC は列の右、スマホは帯の下。サムネイルの位置に合わせる
  const rootRect = s.root.getBoundingClientRect(), r = a.getBoundingClientRect();
  if (s.vertical) {
    pop.style.left = `${rootRect.width + 8}px`;
    pop.style.top = `${Math.max(8, r.top - rootRect.top - 8)}px`;
  } else {
    pop.style.top = `${rootRect.height + 8}px`;
    pop.style.left = `${Math.min(Math.max(8, r.left - rootRect.left - 40), rootRect.width - pop.offsetWidth - 8)}px`;
  }
}

function hidePop(s: State) {
  s.active?.classList.remove('is-active');
  s.active = null;
  s.tapped = null;
  s.pop.hidden = true;
}

function setup(root: HTMLElement) {
  const viewport = root.querySelector<HTMLElement>('.rail-viewport')!;
  const track = root.querySelector<HTMLElement>('.rail-track')!;
  const pop = root.querySelector<HTMLElement>('.rail-pop')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s: State = {
    root, viewport, track, pop,
    vertical: matchMedia('(min-width: 769px)').matches,
    reduced,
    offset: 0,
    velocity: reduced ? 0 : SPEED,
    holding: false,
    active: null,
    tapped: null,
    nextCursor: root.dataset.nextCursor ?? '',
    loading: false,
    failures: 0,
    retryAt: 0,
    looping: false,
  };
  root.dataset.orientation = s.vertical ? 'vertical' : 'horizontal';

  // 画面の幅が境目（768px）をまたいだら縦横を切り替え、大きさが変わったらループを組み直す
  // （タブレットの回転やウィンドウの幅の変更で、レイアウトが崩れたり空白が流れたりしないように）
  const wide = matchMedia('(min-width: 769px)');
  wide.addEventListener('change', () => {
    s.vertical = wide.matches;
    root.dataset.orientation = s.vertical ? 'vertical' : 'horizontal';
    hidePop(s);
    s.holding = false;
    s.offset = 0;
    applyOffset(s);
    rebuildLoop(s);
  });
  let lastSize = '';
  new ResizeObserver(() => {
    const size = `${viewport.clientWidth}x${viewport.clientHeight}`;
    if (size === lastSize) return;
    lastSize = size;
    rebuildLoop(s);
  }).observe(viewport);
  if (reduced) root.dataset.static = '';
  root.dataset.pointer = matchMedia('(hover: hover)').matches ? 'mouse' : 'touch';
  rebuildLoop(s);

  // ホバー（マウス）とフォーカス（キーボード）で止めて拡大
  track.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('.rail-item');
    if (a) { s.holding = true; showPop(s, a); }
  });
  root.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    s.holding = false; hidePop(s);
  });
  track.addEventListener('focusin', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('.rail-item');
    // キーボードのフォーカスだけで止める（詳細をマウスで閉じてフォーカスが戻ったときに止まったままにしない。
    // タップは click 側で選ぶ）
    if (a && a.matches(':focus-visible')) { s.holding = true; showPop(s, a); }
  });
  track.addEventListener('focusout', () => {
    if (root.dataset.pointer === 'touch' && s.tapped) return; // タップで選んだ状態は、外側のタップで解除する
    s.holding = false; hidePop(s);
  });

  // タッチ: 1 回目のタップで止めて拡大、2 回目（または「開く」）で移動
  track.addEventListener('click', (e) => {
    if (root.dataset.pointer !== 'touch') return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('.rail-item');
    // タップでリンクにフォーカスが当たると focusin が先に選択するので、「2 回目のタップ」は tapped で判定する
    if (!a || a === s.tapped) return;
    e.preventDefault();
    s.tapped = a;
    s.holding = true;
    showPop(s, a);
  });
  document.addEventListener('pointerdown', (e) => {
    if (root.dataset.pointer !== 'touch' || !s.active) return;
    if (!root.contains(e.target as Node)) { s.holding = false; hidePop(s); }
  });

  // 動きを減らす設定: 手でスクロールしたときに読み足す
  viewport.addEventListener('scroll', () => {
    if (!s.reduced) return;
    const remaining = s.vertical
      ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      : viewport.scrollWidth - viewport.scrollLeft - viewport.clientWidth;
    if (remaining < PREFETCH_PX) void loadMore(s);
  });

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!s.reduced && !document.hidden) {
      const target = s.holding ? 0 : SPEED;
      s.velocity += (target - s.velocity) * (1 - Math.exp(-EASE * dt));   // 慣性で止まる・戻る
      if (target === 0 && Math.abs(s.velocity) < 0.5) s.velocity = 0;      // 十分遅くなったら止める
      if (s.looping) {
        const len = originalLength(s);
        s.offset = (s.offset + s.velocity * dt) % len;
        applyOffset(s);
        if (len - s.offset - viewportLength(s) < PREFETCH_PX) void loadMore(s);
      } else if (s.nextCursor) {
        void loadMore(s);
      }
      if (s.active && !s.pop.hidden) showPop(s, s.active); // 流れに合わせてポップアップも追う
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initRails() {
  document.querySelectorAll<HTMLElement>('.rail').forEach(setup);
}
