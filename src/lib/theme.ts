// サイトのテーマカラー。色そのものは src/styles/tokens.css の [data-theme="…"] で決め、ここは種類と表示名だけ。
export const THEMES = [
  { id: 'orange', label: 'オレンジ' },
  { id: 'red', label: 'レッド' },
  { id: 'pink', label: 'ピンク' },
  { id: 'violet', label: 'バイオレット' },
  { id: 'indigo', label: 'インディゴ' },
  { id: 'sky', label: 'スカイ' },
  { id: 'teal', label: 'ティール' },
  { id: 'green', label: 'グリーン' },
  { id: 'mustard', label: 'マスタード' },
  { id: 'charcoal', label: 'チャコール' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'orange';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}
