// 作品詳細の URL と履歴。リンクを横取りして同じ画面のまま詳細を開き、戻る・進む・閉じるを URL と一致させる。
import { closeTarget, parseDetailPath, type DetailData } from './detail';
import { closeDetail, isDetailOpen, openDetail, setDetailHandlers } from './detailClient';

/**
 * history.state に持つもの。
 * origin: 詳細を開いた元のパス（トップ・タグページ）。depth: 開いた元から積んだ詳細の履歴の数（直接開いたら 0）
 */
type DetailState = { detail: true; origin: string | null; depth: number };

function detailState(): DetailState | null {
  const s = history.state as Partial<DetailState> | null;
  return s?.detail ? { detail: true, origin: s.origin ?? null, depth: s.depth ?? 0 } : null;
}

/** 新しい要求が来たら、古い読み込みの結果は捨てる（二重に開かない） */
let seq = 0;

async function fetchDetail(pathAndSearch: string): Promise<DetailData | null> {
  try {
    const r = await fetch(`/api/detail?path=${encodeURIComponent(pathAndSearch)}`);
    return r.ok ? ((await r.json()) as DetailData) : null;
  } catch {
    return null;
  }
}

async function openFromLink(href: string, returnFocus: HTMLElement | null) {
  const n = ++seq;
  const data = await fetchDetail(href);
  if (n !== seq) return;
  if (!data) { location.href = href; return; } // 読めなければ普通に移動する
  const open = isDetailOpen();
  const cur = detailState();
  const state: DetailState = open
    ? { detail: true, origin: cur?.origin ?? null, depth: (cur?.depth ?? 0) + 1 }
    : { detail: true, origin: location.pathname, depth: 1 };
  history.pushState(state, '', href);
  await openDetail(data, { returnFocus });
}

async function syncWithLocation() {
  const target = parseDetailPath(location.pathname, location.search);
  const n = ++seq;
  if (!target) { closeDetail(); return; }
  const data = await fetchDetail(location.pathname + location.search);
  if (n !== seq) return;
  if (!data) { location.reload(); return; }
  await openDetail(data);
}

function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !parseDetailPath(url.pathname, url.search)) return;
  e.preventDefault();
  const href = url.pathname + url.search;
  if (isDetailOpen() && href === location.pathname + location.search) return;
  // 詳細の中のリンク（アルバムで見る）から開いたときは、元のリンクを覚え直さない
  void openFromLink(href, a.closest('.detail') ? null : a);
}

export function initDetailRouter(): void {
  setDetailHandlers({
    onPageChange(index, data) {
      if (data.kind !== 'album') return;
      // ページを送っても履歴は増やさない
      const url = index === 0 ? location.pathname : `${location.pathname}?page=${index + 1}`;
      history.replaceState(history.state, '', url);
    },
    onCloseRequest() {
      const st = detailState();
      if (st && st.depth > 0) {
        // 開いた元まで戻る（popstate で閉じる）
        seq++;
        history.go(-st.depth);
        return;
      }
      // 直接開いた: 履歴を増やさずに一覧の URL にして閉じる
      history.replaceState(null, '', closeTarget(st?.origin ?? null));
      closeDetail();
    },
  });

  // サーバーが詳細を開いた状態で返した（直接開いた・再読み込み）
  if (parseDetailPath(location.pathname, location.search) && !detailState()) {
    history.replaceState({ detail: true, origin: null, depth: 0 } satisfies DetailState, '', location.href);
  }

  document.addEventListener('click', onClick);
  window.addEventListener('popstate', () => void syncWithLocation());
}
