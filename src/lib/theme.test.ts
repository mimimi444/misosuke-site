import { expect, test } from 'vitest';
import { DEFAULT_THEME, isThemeId, THEMES } from './theme';
// consistency.test.ts と同じく、文字列として読み込む（vitest.config.ts の css: true が要る）
const tokens = Object.values(import.meta.glob<string>('/src/styles/tokens.css', { query: '?raw', import: 'default', eager: true }))[0] ?? '';

test('10 色あり、既定は今のオレンジ', () => {
  expect(THEMES).toHaveLength(10);
  expect(DEFAULT_THEME).toBe('orange');
  expect(THEMES[0]!.id).toBe('orange');
});

test('知らない値はテーマではない', () => {
  expect(isThemeId('teal')).toBe(true);
  expect(isThemeId('nope')).toBe(false);
  expect(isThemeId(null)).toBe(false);
  expect(isThemeId('"><script>')).toBe(false);
});

test('どの色も tokens.css に色見本の定義がある（既定以外はページ全体の定義も）', () => {
  for (const t of THEMES) {
    expect(tokens, t.id).toContain(`[data-theme-swatch="${t.id}"]`);
    if (t.id !== DEFAULT_THEME) expect(tokens, t.id).toContain(`:root[data-theme="${t.id}"]`);
  }
});
