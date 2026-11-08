// 作品（画像 1 枚）の表示に関する決まりごと

const UNTITLED = '無題';
const ALT_MAX_GRAPHEMES = 100;
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function displayTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED;
}

/** 投稿日を日本時間で「2026年11月8日」の形にする */
export function formatPostedDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** 画像の代替テキスト。説明があれば説明の先頭、なければ「表示タイトル（投稿日）」 */
export function altText(work: { title?: string | null; description?: string | null; createdAt: string }): string {
  const description = work.description?.replace(/\s+/g, ' ').trim();
  if (description) {
    return Array.from(segmenter.segment(description), (s) => s.segment).slice(0, ALT_MAX_GRAPHEMES).join('');
  }
  return `${displayTitle(work.title)}（${formatPostedDate(work.createdAt)}）`;
}

export function workPath(id: string): string {
  return `/works/${encodeURIComponent(id)}`;
}
