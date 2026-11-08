// 見た目の一貫性を保つためのテスト。
// 色や寸法は tokens.css の変数だけで決め、ページに静的な style 属性を書かない。
import { describe, test, expect } from 'vitest';

// src 以下のページ・部品・スタイル・スクリプトを文字列として読み込む（キーは '/src/...' 形式）
const files = import.meta.glob<string>(['/src/**/*.{astro,tsx,css,ts}', '!/src/**/*.test.ts', '!/src/**/*.d.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 静的な style 指定（"..." / '...' / {"..."} / {`...`} / {{ 定数だけ }}）。値を差し込む ${...} や変数を含む指定は許す */
export const STATIC_STYLE = /\sstyle\s*=\s*(["']|\{\s*["']|\{\s*`(?![^`]*\$\{)|\{\{(?![^}]*(\$\{|[A-Za-z_]\w*\s*[-+*/]|:\s*[A-Za-z_]\w*\s*[,}])))/;
/** この印がある行は検査しない（CSS ではない設定値など、正当な例外に限って使う） */
const ALLOW_MARK = 'consistency-allow';
/** 色の直書き（16 進、rgb/hsl/oklch 関数、CSS の色名）。tokens.css 以外では禁止 */
export const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|(color|background|border|fill|stroke|outline)[\w-]*\s*:\s*[^;]*\b(white|black|red|blue|green|gray|grey|orange|yellow|purple|pink|brown)\b/;

function filesMatching(pattern: RegExp, options: { exclude?: string[]; extensions?: string[] } = {}): string[] {
  const hits: string[] = [];
  for (const [path, source] of Object.entries(files)) {
    const rel = path.replace(/^\//, '');
    if (options.exclude?.includes(rel)) continue;
    if (options.extensions && !options.extensions.some((ext) => rel.endsWith(ext))) continue;
    source.split('\n').forEach((line, i) => {
      if (pattern.test(line) && !line.includes(ALLOW_MARK)) hits.push(`${rel}:${i + 1}`);
    });
  }
  return hits;
}

describe('検出パターン自体の確認', () => {
  test('静的な style 指定を検出する', () => {
    for (const s of [' style="color:red"', " style='margin:0'", ' style={"margin:0"}', " style={`margin:0`}", " style={{ margin: 0 }}", ' style = "x"'])
      expect(STATIC_STYLE.test(s), s).toBe(true);
  });
  test('変数を含む style={{...}} は許す', () => {
    for (const s of [' style={{ width: `${pct}%` }}', ' style={{ width: pct }}', ' style={`animation-delay:${i * 0.03}s`}'])
      expect(STATIC_STYLE.test(s), s).toBe(false);
  });
  test('色の直書きを検出する', () => {
    for (const s of ['color: #fff;', 'background: rgba(0,0,0,.5)', 'fill: hsl(10 50% 50%)', 'color: oklch(0.7 0.1 30)', 'color: white;', "el.style.background = '#000'", 'border: 1px solid black'])
      expect(COLOR_LITERAL.test(s), s).toBe(true);
  });
  test('変数や色名以外は検出しない', () => {
    for (const s of ['color: var(--ink);', 'white-space: nowrap;', 'background: var(--panel);', 'const blackList = []', '<a href="#">'])
      expect(COLOR_LITERAL.test(s), s).toBe(false);
  });
});

test('読み込めたファイルがある（テスト自体が空振りしていない）', () => {
  expect(Object.keys(files).length).toBeGreaterThan(10);
  expect(Object.keys(files).some((f) => f.endsWith('.ts'))).toBe(true);
});

test('静的な style 属性を使わない', () => {
  expect(filesMatching(STATIC_STYLE, { extensions: ['.astro', '.tsx'] })).toEqual([]);
});

test('色の直書きは tokens.css だけ', () => {
  expect(filesMatching(COLOR_LITERAL, { exclude: ['src/styles/tokens.css'] })).toEqual([]);
});
