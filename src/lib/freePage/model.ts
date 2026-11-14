// トップの雑誌の最後のページ（フリーページ）の中身。決まったウィジェットを上から順に積む。
// レイアウトが崩れないよう、ウィジェットごとの高さ（単位）と文字数、ページ全体の高さを制限する。
// ブラウザ・サーバーの両方から使うので、ほかに依存しない。

export type Widget =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'note'; text: string }
  | { id: string; type: 'image'; imageId: string }
  | { id: string; type: 'link'; label: string; url: string }
  | { id: string; type: 'divider' };

export type WidgetType = Widget['type'];
export type FreePage = { widgets: Widget[] };

/** 表示用: 画像ウィジェットに画像の URL と縦横比を添えたもの */
export type FreePageView = {
  widgets: (Widget & { src?: string; aspect?: number })[];
  /** 押したときに開く先（最初のリンク）。無ければ null */
  href: string | null;
};

export const WIDGETS: Record<WidgetType, { label: string; units: number; maxChars?: number; maxLines?: number }> = {
  heading: { label: '見出し', units: 2, maxChars: 20 },
  text: { label: '本文', units: 4, maxChars: 100, maxLines: 4 },
  note: { label: '小さな文字', units: 1, maxChars: 40 },
  image: { label: '画像', units: 5 },
  link: { label: 'リンク', units: 1, maxChars: 20 },
  divider: { label: '区切り線', units: 1 },
};

/** ページ全体の高さ（単位）とウィジェットの最大数 */
export const MAX_UNITS = 14;
export const MAX_WIDGETS = 10;
export const MAX_URL = 300;

export function unitsOf(widgets: Pick<Widget, 'type'>[]): number {
  return widgets.reduce((sum, w) => sum + WIDGETS[w.type].units, 0);
}

/** 書記素（見た目の 1 文字）で数える */
export function countChars(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (!Seg) return [...s].length;
  let n = 0;
  for (const _ of new Seg('ja', { granularity: 'grapheme' }).segment(s)) n++;
  return n;
}

/** リンク先は http(s) の URL か、このサイトのパス（/ で始まり、// ではない） */
export function isAllowedUrl(url: string): boolean {
  if (url.length === 0 || url.length > MAX_URL) return false;
  if (url.startsWith('/')) return !url.startsWith('//') && !/[\s\\]/.test(url);
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** ウィジェットの問題（無ければ null） */
export function widgetProblem(w: Widget): string | null {
  const spec = WIDGETS[w.type];
  const text = w.type === 'heading' || w.type === 'text' || w.type === 'note' ? w.text : w.type === 'link' ? w.label : null;
  if (text !== null) {
    if (text.trim().length === 0) return `${spec.label}が空です`;
    if (spec.maxChars && countChars(text) > spec.maxChars) return `${spec.label}は ${spec.maxChars} 文字までです`;
    if (spec.maxLines && text.split('\n').length > spec.maxLines) return `${spec.label}は ${spec.maxLines} 行までです`;
  }
  if (w.type === 'link' && !isAllowedUrl(w.url)) return 'リンク先は https:// で始まる URL か、/ で始まるサイト内のパスにしてください';
  if (w.type === 'image' && !w.imageId) return '画像を選んでください';
  return null;
}

/** ページ全体の問題（無ければ空） */
export function pageProblems(page: FreePage): string[] {
  const problems: string[] = [];
  if (page.widgets.length > MAX_WIDGETS) problems.push(`ウィジェットは ${MAX_WIDGETS} 個までです`);
  if (unitsOf(page.widgets) > MAX_UNITS) problems.push('ページに収まりません。ウィジェットを減らしてください');
  page.widgets.forEach((w, i) => {
    const p = widgetProblem(w);
    if (p) problems.push(`${i + 1} 番目: ${p}`);
  });
  return problems;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** 保存されたデータや送られてきたデータを、知っている形だけに絞る（知らない種類・項目は捨てる） */
export function parseFreePage(raw: unknown): FreePage {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { widgets?: unknown }).widgets) ? (raw as { widgets: unknown[] }).widgets : [];
  const widgets: Widget[] = [];
  for (const item of list.slice(0, MAX_WIDGETS * 2)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id, 40) || Math.random().toString(36).slice(2, 10);
    switch (o.type) {
      case 'heading':
      case 'text':
      case 'note':
        widgets.push({ id, type: o.type, text: str(o.text, 1000).replace(/\r\n?/g, '\n') });
        break;
      case 'image':
        widgets.push({ id, type: 'image', imageId: str(o.imageId, 64) });
        break;
      case 'link':
        widgets.push({ id, type: 'link', label: str(o.label, 200), url: str(o.url, MAX_URL + 1).trim() });
        break;
      case 'divider':
        widgets.push({ id, type: 'divider' });
        break;
    }
  }
  return { widgets };
}

/** 押したときに開く先（最初の正しいリンク） */
export function pageHref(page: FreePage): string | null {
  const link = page.widgets.find((w): w is Extract<Widget, { type: 'link' }> => w.type === 'link' && isAllowedUrl(w.url));
  return link?.url ?? null;
}
