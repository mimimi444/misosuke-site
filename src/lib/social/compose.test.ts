import { describe, test, expect } from 'vitest';
import { composePostText, clampPostText, countGraphemes, splitTagNames, resolvePostText, WORK_ID_PLACEHOLDER } from './compose';

const URL = 'https://misosuke-site.misosuke.workers.dev/';

describe('composePostText', () => {
  test('全項目がそろっている場合', () => {
    expect(
      composePostText({
        title: 'ジャンクジャーナル 1冊目',
        description: '古い切符と包装紙で作った',
        tagNames: ['コラージュ', 'ジャンクジャーナル'],
        url: URL,
      }),
    ).toBe(`ジャンクジャーナル 1冊目\n古い切符と包装紙で作った\n#コラージュ #ジャンクジャーナル\n${URL}`);
  });

  test('欠けた項目は行ごと省き、空行を残さない', () => {
    expect(composePostText({ title: 'T', description: '', tagNames: [], url: URL })).toBe(`T\n${URL}`);
    expect(composePostText({ title: null, description: null, tagNames: ['a'], url: null })).toBe('#a');
  });

  test('url が null ならリンクを含めない', () => {
    expect(composePostText({ title: 'T', tagNames: [], url: null })).not.toContain('http');
  });

  test('タグ名の空白を取り除く', () => {
    expect(composePostText({ tagNames: ['ジャンク ジャーナル', ' a　b '] })).toBe('#ジャンクジャーナル #ab');
  });

  test('タグ名の先頭に付けた # は重ねない', () => {
    expect(composePostText({ tagNames: ['#猫', '##犬'] })).toBe('#猫 #犬');
  });

  test('大文字小文字だけ違うタグは最初の表記で1つにまとめる', () => {
    expect(composePostText({ tagNames: ['Cat', 'cat', '#CAT'] })).toBe('#Cat');
  });

  test('# だけのタグは出さない', () => {
    expect(composePostText({ tagNames: ['#', 'a'] })).toBe('#a');
  });

  test('空白だけのタグと重複したタグは出さない', () => {
    expect(composePostText({ tagNames: ['  ', 'a', 'a'] })).toBe('#a');
  });

  test('超えたら説明から削り、タイトル・タグ・URL は残す', () => {
    const out = composePostText({ title: 'T', description: 'あ'.repeat(400), tagNames: ['x'], url: URL });
    expect(countGraphemes(out)).toBeLessThanOrEqual(300);
    expect(out.startsWith('T\n')).toBe(true);
    expect(out.endsWith(`\n#x\n${URL}`)).toBe(true);
    expect(out.split('\n')[1]!.endsWith('…')).toBe(true);
  });

  test('説明を全部削っても超えるなら末尾を切って … を付ける', () => {
    const out = composePostText({ title: 'あ'.repeat(400), description: 'd', tagNames: [], url: null });
    expect(countGraphemes(out)).toBe(300);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('d');
  });

  test('説明の削り位置が絵文字にかかっても壊れない', () => {
    const out = composePostText({ title: 'T', description: '👨‍👩‍👧'.repeat(400), tagNames: [], url: null });
    expect(countGraphemes(out)).toBeLessThanOrEqual(300);
    expect(out).not.toMatch(/‍…|‍$/); // ZWJ の途中で切れていない
  });
});

describe('countGraphemes', () => {
  test('絵文字と結合文字を1文字として数える', () => {
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
    expect(countGraphemes('が')).toBe(1); // か + 結合用濁点
    expect(countGraphemes('🇯🇵a')).toBe(2);
  });
});

describe('clampPostText', () => {
  test('300 以内ならそのまま、超えたら … 込みで 300', () => {
    expect(clampPostText('abc')).toBe('abc');
    const out = clampPostText('あ'.repeat(301));
    expect(countGraphemes(out)).toBe(300);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('splitTagNames', () => {
  test('カンマで分けて空白と空要素を除く', () => {
    expect(splitTagNames(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(splitTagNames(undefined)).toEqual([]);
  });
});

describe('resolvePostText', () => {
  const SITE = 'https://misosuke-site.misosuke.workers.dev/';
  const ph = `${SITE}works/${WORK_ID_PLACEHOLDER}`;

  test('仮の作品 URL を実際の作品 URL に置き換える', () => {
    expect(resolvePostText(`T\n${ph}`, SITE, 'abc')).toBe(`T\n${SITE}works/abc`);
  });
  test('複数あればすべて置き換える', () => {
    expect(resolvePostText(`${ph} と ${ph}`, SITE, 'abc')).toBe(`${SITE}works/abc と ${SITE}works/abc`);
  });
  test('仮の URL が含まれていなければ、そのまま（勝手に URL を足さない）', () => {
    expect(resolvePostText('リンクなし', SITE, 'abc')).toBe('リンクなし');
  });
  test('手で編集して仮の ID の x が減っていても、実際の作品 URL に置き換える（壊れたリンクを投稿しない）', () => {
    expect(resolvePostText(`T\n${SITE}works/xxxxxxxx`, SITE, 'abc')).toBe(`T\n${SITE}works/abc`);
    expect(resolvePostText(`${SITE}works/x 続き`, SITE, 'abc')).toBe(`${SITE}works/abc 続き`);
  });
  test('x で始まる本物の ID らしい文字列までは置き換えない', () => {
    expect(resolvePostText(`${SITE}works/xyz123`, SITE, 'abc')).toBe(`${SITE}works/xyz123`);
  });
  test('仮の ID は nanoid と同じ 21 文字（文字数の表示がずれない）', () => {
    expect(WORK_ID_PLACEHOLDER).toHaveLength(21);
  });
});
