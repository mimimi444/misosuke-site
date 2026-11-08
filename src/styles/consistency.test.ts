// 見た目の一貫性を保つためのテスト。
// 色や寸法は tokens.css の変数だけで決め、ページに静的な style 属性を書かない。
import { test, expect } from 'vitest';

// src 以下のページ・部品・スタイルを文字列として読み込む（キーは '/src/...' 形式）
const files = import.meta.glob<string>('/src/**/*.{astro,tsx,css}', { query: '?raw', import: 'default', eager: true });

function filesMatching(pattern: RegExp, options: { exclude?: string[]; extensions?: string[] } = {}): string[] {
  const hits: string[] = [];
  for (const [path, source] of Object.entries(files)) {
    const rel = path.replace(/^\//, '');
    if (options.exclude?.includes(rel)) continue;
    if (options.extensions && !options.extensions.some((ext) => rel.endsWith(ext))) continue;
    source.split('\n').forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${rel}:${i + 1}`);
    });
  }
  return hits;
}

test('読み込めたファイルがある（テスト自体が空振りしていない）', () => {
  expect(Object.keys(files).length).toBeGreaterThan(10);
});

test('静的な style 属性を使わない（動的な style={...} は可）', () => {
  expect(filesMatching(/\sstyle="/, { extensions: ['.astro', '.tsx'] })).toEqual([]);
});

test('色の直書きは tokens.css だけ', () => {
  expect(filesMatching(/#[0-9a-fA-F]{3,8}\b|rgba?\(/, { exclude: ['src/styles/tokens.css'] })).toEqual([]);
});
