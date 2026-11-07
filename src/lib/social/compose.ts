/** Bluesky の本文上限（grapheme 単位） */
export const POST_MAX_GRAPHEMES = 300;

const ELLIPSIS = '…';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** 見た目の1文字を1と数える。絵文字や結合文字で String.length がずれるのを避ける */
export function countGraphemes(text: string): number {
  return graphemes(text).length;
}

/** カンマ区切りのタグ入力を配列にする */
export function splitTagNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 上限を超えたら末尾を切り、… を付ける（… を含めて上限に収める） */
export function clampPostText(text: string): string {
  const chars = graphemes(text);
  if (chars.length <= POST_MAX_GRAPHEMES) return text;
  return chars.slice(0, POST_MAX_GRAPHEMES - 1).join('') + ELLIPSIS;
}

export interface ComposeInput {
  title?: string | null;
  description?: string | null;
  tagNames: string[];
  url?: string | null;
}

function tagLine(tagNames: string[]): string {
  // Bluesky のタグは空白を含められないので取り除く。先頭の # はこちらで付けるので外す
  const tags = tagNames.map((name) => name.replace(/\s+/g, '').replace(/^#+/, '')).filter(Boolean);
  // Bluesky のタグは大文字小文字を区別しないので、最初に出た表記だけを残す
  const unique = new Map<string, string>();
  for (const t of tags) if (!unique.has(t.toLowerCase())) unique.set(t.toLowerCase(), t);
  return [...unique.values()].map((t) => `#${t}`).join(' ');
}

/**
 * タイトル → 説明 → タグ → URL の順に改行でつなぐ。
 * 上限を超えるときは説明から削り、それでも超えれば末尾を切る。
 */
export function composePostText(input: ComposeInput): string {
  const title = input.title?.trim() ?? '';
  const tags = tagLine(input.tagNames);
  const url = input.url?.trim() ?? '';
  let description = input.description?.trim() ?? '';

  const join = (desc: string) => [title, desc, tags, url].filter(Boolean).join('\n');

  if (description && countGraphemes(join(description)) > POST_MAX_GRAPHEMES) {
    const base = countGraphemes(join(''));
    // 説明の行を入れると改行が1つ増える
    const room = POST_MAX_GRAPHEMES - base - 1;
    description = room >= 2 ? graphemes(description).slice(0, room - 1).join('') + ELLIPSIS : '';
  }

  return clampPostText(join(description));
}
