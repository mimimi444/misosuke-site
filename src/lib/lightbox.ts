// Lightbox.astro のブラウザ側の処理

let returnFocus: HTMLElement | null = null;

function elements() {
  const box = document.getElementById('lightbox') as HTMLDivElement | null;
  const img = document.getElementById('lightboxImg') as HTMLImageElement | null;
  const caption = document.getElementById('lightboxCaption') as HTMLElement | null;
  const close = document.getElementById('lightboxClose') as HTMLButtonElement | null;
  if (!box || !img || !caption || !close) throw new Error('lightbox elements missing');
  return { box, img, caption, close };
}

export function openLightbox(src: string, title: string) {
  const { box, img, caption, close } = elements();
  returnFocus = document.activeElement as HTMLElement | null;
  img.src = src;
  img.alt = title;
  caption.textContent = title;
  box.hidden = false;
  document.body.style.overflow = 'hidden';
  close.focus();
}

export function closeLightbox() {
  const { box, img } = elements();
  if (box.hidden) return;
  box.hidden = true;
  img.removeAttribute('src');
  document.body.style.overflow = '';
  returnFocus?.focus();
}

export function initLightbox() {
  const { box, img, close } = elements();
  close.addEventListener('click', closeLightbox);
  // 画像以外（背景）をクリック・タップしたら閉じる
  box.addEventListener('click', (e) => {
    if (e.target !== img) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}
