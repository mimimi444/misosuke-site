// AlbumViewer.astro のブラウザ側の処理。アルバムの全ページを comimi ビューワーで開く。
import { createMangaViewer } from '@yui540/comimi';

type PageData = { id: string; src: string };
type AlbumData = { id: string; title: string; slug: string; pages: PageData[] };

let viewer: ReturnType<typeof createMangaViewer> | null = null;

function elements() {
  const overlay = document.getElementById('viewerOverlay') as HTMLDivElement | null;
  const closeBtn = document.getElementById('closeViewerBtn') as HTMLButtonElement | null;
  const thumbs = document.getElementById('viewerThumbs') as HTMLElement | null;
  const container = document.getElementById('viewerContainer') as HTMLDivElement | null;
  if (!overlay || !closeBtn || !thumbs || !container) throw new Error('viewer elements missing');
  return { overlay, closeBtn, thumbs, container };
}

function updateActiveThumb(thumbs: HTMLElement, pageIndex: number) {
  thumbs.querySelectorAll<HTMLElement>('.viewer-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === pageIndex);
  });
  thumbs.querySelector<HTMLElement>(`.viewer-thumb[data-index="${pageIndex}"]`)?.scrollIntoView({ block: 'nearest' });
}

/**
 * アルバムをビューワーで開く。startImageId を渡すと、その画像のページから表示する。
 * 開けなかった（アルバムが空・取得失敗）ときは false を返す。
 */
export async function openAlbumViewer(slug: string, startImageId?: string): Promise<boolean> {
  const { overlay, closeBtn, thumbs, container } = elements();
  const res = await fetch(`/api/albums/${encodeURIComponent(slug)}`);
  if (!res.ok) return false;
  const data: AlbumData = await res.json();
  if (data.pages.length === 0) return false;

  const found = startImageId ? data.pages.findIndex((p) => p.id === startImageId) : -1;
  const startIndex = Math.max(found, 0);

  thumbs.replaceChildren(
    ...data.pages.map((page, i) => {
      const btn = document.createElement('button');
      btn.className = 'viewer-thumb';
      btn.dataset.index = String(i);
      const img = document.createElement('img');
      img.src = page.src;
      img.alt = `ページ ${i + 1}`;
      img.loading = 'lazy';
      btn.appendChild(img);
      btn.addEventListener('click', () => viewer?.goToPage(i));
      return btn;
    }),
  );

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  viewer = createMangaViewer(container, {
    manga: {
      id: data.slug,
      title: data.title,
      pages: data.pages.map((p) => ({ id: p.id, type: 'image' as const, src: p.src })),
    },
    initialPageIndex: startIndex,
    locale: 'ja',
    settings: {
      readingDirection: 'rtl',
      pageTurnMode: 'single',
      layoutMode: 'inline',
      backgroundColor: 'black', // comimi の背景テーマ名（CSS の色ではない） consistency-allow
    },
    // 前回の続きのページを覚える機能は、特定のページから開くときは使わない
    storage: { enabled: found < 0 },
    events: {
      pageChange: ({ pageIndex }: { pageIndex: number }) => updateActiveThumb(thumbs, pageIndex),
    },
  });
  // 保存された位置より、指定したページを優先する
  if (found >= 0) viewer.goToPage(startIndex);
  updateActiveThumb(thumbs, startIndex);
  closeBtn.focus();
  return true;
}

export function closeAlbumViewer() {
  const { overlay, thumbs } = elements();
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  overlay.hidden = true;
  thumbs.replaceChildren();
  document.body.style.overflow = '';
}

/** ページ読み込み時に 1 回呼ぶ。閉じるボタン・Esc と、[data-open-album] 要素のクリックを結び付ける */
export function initAlbumViewer() {
  const { overlay, closeBtn } = elements();
  closeBtn.addEventListener('click', closeAlbumViewer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeAlbumViewer();
  });
  document.querySelectorAll<HTMLElement>('[data-open-album]').forEach((el) => {
    el.addEventListener('click', () => void openAlbumViewer(el.dataset.openAlbum!));
  });
}
