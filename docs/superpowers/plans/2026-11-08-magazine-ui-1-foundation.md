# 雑誌 UI リデザイン 計画 1/3: 基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新しい見た目の規則（色・文字・部品）を 1 系統にまとめ、3D を使わない全画面（ヘッダー/フッター・管理画面・ログイン・アルバム一覧・タグページ・アルバムページの枠・フィード）をその部品だけで組み直す。あわせて作品説明の入力欄、平面版の作品ページ `/works/<ID>`、Bluesky 投稿のリンク先の変更を入れる。

**Architecture:** 色や寸法は `tokens.css` の CSS 変数だけに置き、部品は `components.css` のクラスとして定義する。各ページは部品クラスとレイアウト用の最小限のスタイルだけを使う。「静的な `style="…"` 属性」と「`tokens.css` 以外の色の直書き」を禁止するテストで、一貫性が崩れないようにする。

**Tech Stack:** Astro 6（Cloudflare アダプタ）、React 19（UploadForm）、vitest、D1/Drizzle

**Spec:** `docs/superpowers/specs/2026-11-08-magazine-ui-design.md`

**この計画の範囲:** 設計書の「見た目の規則」「他の画面」「作品説明の入力」「Bluesky 投稿のリンク」と、作品ページ `/works/<ID>` の平面版。トップの 3D 雑誌と作品一覧（計画 2）、同じ画面で開く作品詳細・読むモード・旧ビューワーの置き換え（計画 3）は含まない。フィード（`/`）とアルバムページ（`/albums/<slug>`）は、この計画では配色と部品をそろえるだけにする。

## Global Constraints

- 背景 `#f1eee8`、アクセント `#ff5714`（既存の `--accent` と同じ）
- 本文は Noto Sans JP。計器風のラベル・数値・状態表示は小さな等幅文字（英大文字、字間広め）。大きな状態ラベルはオレンジの太字
- パネルは白の半透明（約 70%）＋細い線（`rgba(0,0,0,.08)` 程度）＋小さな角丸。影はほぼ付けない
- 部品は 1 系統: パネル、ボタン（主・副・危険）、入力欄、チップ（タグ）、カード、ラベル
- 今の緑（`#07a25c` など）は主役の色から外し、文字はインク色（濃いグレー）
- 管理画面に 3D を入れない。three.js をこの計画で読み込まない
- ログイン中だけ出る「管理画面」リンクは新しいヘッダーにも残す
- 元画像（`originals/`）は公開しない
- 既存 URL（`/albums/<slug>`, `/tags/<slug>`）を変えない
- Bluesky 投稿のリンクは `/works/<画像ID>`
- タイトルがない作品の表示上のタイトルは「無題」。`alt` は説明があれば説明の先頭、なければ「無題（2026年11月8日）」の形

## Review Focus

1. **見た目の手直しで管理画面の操作が壊れる**（保存・削除・アルバム作成・編集・アップロード・ログアウト） → 各タスクの手動確認で、操作が今まで通り完了することを確かめる（Task 3 Step 4）
2. **存在しない・不正な ID で `/works/<ID>` を開く** → 500 ではなく 404（Task 5 Step 5）
3. **静的なインライン指定や色の直書きが、後から再び入り込む** → 一貫性テストで検出（Task 1）
4. **作品説明が長い・改行を含む** → 作品ページでは改行を保って表示し、レイアウトを崩さない（Task 5 Step 5）
5. **リンクを含めない設定、または手で編集してリンクを消した文面** → 仮の URL が投稿に残らず、勝手に URL も足されない（Task 6 のテスト）

---

### Task 1: 見た目の規則（トークンと部品）と一貫性テスト

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/components.css`, `src/styles/consistency.test.ts`
- Modify: `src/styles/global.css`（リセットと基本だけ残し、2 ファイルを読み込む）

**Interfaces:**
- Produces（CSS 変数）: `--paper` `#f1eee8`、`--panel` `rgba(255,255,255,.72)`、`--panel-solid` `#fbfaf7`、`--line` `rgba(0,0,0,.08)`、`--line-strong` `rgba(0,0,0,.16)`、`--ink` `#2b2b2b`、`--ink-muted` `#6b6760`、`--accent` `#ff5714`、`--accent-ink` `#ffffff`、`--danger` `#c0392b`、`--font-jp` `'Noto Sans JP', sans-serif`、`--font-mono` `ui-monospace, SFMono-Regular, Menlo, monospace`、`--r-sm` `4px`、`--r-md` `8px`、`--r-pill` `999px`、`--gap`（既存の値）
- Produces（部品クラス）: `.panel`、`.btn` ＋ `.btn--primary` / `.btn--ghost` / `.btn--danger` / `.btn--sm`、`.field`（ラベルと入力の縦並び）、入力欄は `input[type=text|email|password]`, `textarea`, `select` の基本スタイル、`.chip` ＋ `.chip--accent`（タグ。`a.chip` でも使える）、`.card`、`.hud-label`（等幅・英大文字・字間広め・小）、`.state-label`（大きいオレンジの太字）、`.page-title`、`.empty`（空の状態の表示）、`.stack`（縦並びの余白）
- 移行のため、既存の変数名（`--bg` `--surface` `--surface-2` `--border` `--text` `--text-muted` `--green-*`）は `tokens.css` で新しい変数の別名にしておく（Task 2〜4 で使われなくなったら Task 4 で消す）

- [ ] **Step 1: 一貫性テストを書く**

`src/styles/consistency.test.ts`。`src/` 以下の `.astro` と `.tsx` を読み、次を確かめる（ファイル一覧は `fs.readdirSync` を再帰）。
```ts
test('静的な style 属性を使わない（動的な style={...} は可）', () => {
  expect(filesMatching(/\sstyle="/)).toEqual([]);
});
test('色の直書きは tokens.css だけ', () => {
  // #rgb / #rrggbb / rgb( / rgba( を、tokens.css 以外の .css/.astro/.tsx から探す
  expect(filesMatching(/#[0-9a-fA-F]{3,8}\b|rgba?\(/, { exclude: ['src/styles/tokens.css'] })).toEqual([]);
});
```
（`filesMatching` はヒットしたファイルの相対パスと行番号を返すテスト内ヘルパー。`src/styles/neumorphism.css` は存在しない前提）

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run src/styles/consistency.test.ts`
Expected: FAIL。既存のページ・レイアウトのファイル名が列挙される（この時点では失敗のままでよい。Task 4 の完了時に通る）

- [ ] **Step 3: `tokens.css` と `components.css` を作り、`global.css` から読み込む**

`global.css` から色・ボタン・入力欄・サイドバーなどの定義を `components.css` に移し、新しい変数で書き直す。`body` の背景は `--paper`、文字は `--ink`。

- [ ] **Step 4: 型チェックとビルド**

Run: `npx astro check && npx astro build`
Expected: 0 errors、ビルド成功

- [ ] **Step 5: コミット**（一貫性テストは失敗中のまま。コミットメッセージにその旨を書く）

```bash
git add src/styles && git commit -m "feat: 見た目のトークンと部品を定義し、一貫性テストを追加（ページの移行は後続）"
```

---

### Task 2: ヘッダー・フッター・管理画面の枠・ログイン

**Files:**
- Modify: `src/layouts/BaseLayout.astro`, `src/layouts/AdminLayout.astro`, `src/pages/[admin]/login.astro`

**Interfaces:**
- Consumes: Task 1 の部品クラスと変数

- [ ] **Step 1: 公開ヘッダー**: 左にオレンジの四角に `JJJ`（`.hud-label` の白文字）＋サイト名、右にナビ（フィード・アルバム、ログイン中だけ `管理画面`）。ナビは等幅の小さな文字、今いるページはオレンジの下線。フッターは細い線の上に等幅の小さな文字
- [ ] **Step 2: 管理画面の枠**: ヘッダーは公開と同じ組み方で、右に `← サイトへ戻る`。サイドバーは `.panel`、リンクは等幅、今いるページはオレンジ。ログアウトは `.btn--ghost`
- [ ] **Step 3: ログインページ**: 中央の `.panel` に `.field` 2 つと `.btn--primary`。エラーはオレンジの文字
- [ ] **Step 4: 確かめる**

Run: `npx astro check && npx astro build`、続けて `astro dev` で公開トップ・管理ダッシュボード・ログインを表示（ログインは自分で入力、またはローカル専用の中継で確認）
Expected: 0 errors。ログイン中は公開ヘッダーに「管理画面」が出て、ログアウトでログインページに戻る

- [ ] **Step 5: コミット** `feat: ヘッダー・フッター・管理画面の枠・ログインを新しい部品で組み直す`

---

### Task 3: 管理画面の各ページ

**Files:**
- Modify: `src/pages/[admin]/index.astro`, `upload.astro`, `images.astro`, `albums/index.astro`, `albums/new.astro`, `albums/edit/[id].astro`, `src/components/UploadForm.tsx`

- [ ] **Step 1**: 各ページの見出しは `.page-title`、まとまりは `.panel` / `.card`、ボタン・入力欄・タグは部品クラスに置き換える。ページ内の `<style>` にはグリッドなどのレイアウトだけを残し、色は変数で書く。静的な `style="…"` をなくす
- [ ] **Step 2**: ダッシュボードの数値（画像数・アルバム数・タグ数）は等幅の大きな数字＋`.hud-label` の見出しにする
- [ ] **Step 3**: `npx astro check && npx astro build` → 0 errors
- [ ] **Step 4: 操作が壊れていないことを確かめる**（`astro dev`、ログイン済み）
  - アップロード（投稿なし）→ フィードに移動し、画像が出る
  - 画像管理でタイトルを保存 → 再読み込みしても残る。削除 → 消える。元画像DL → ダウンロードされる
  - アルバム作成 → アルバムページに移動。編集で並びとタイトルを保存 → 残る。削除 → 消える
  - 確認に使ったデータは削除する
- [ ] **Step 5: コミット** `feat: 管理画面の各ページを新しい部品で組み直す`

---

### Task 4: 公開側のページと古い変数の削除

**Files:**
- Modify: `src/pages/index.astro`, `src/pages/albums/index.astro`, `src/pages/albums/[slug].astro`, `src/pages/tags/[slug].astro`, `src/components/Lightbox.astro`, `src/components/AlbumViewer.astro`, `src/styles/tokens.css`

- [ ] **Step 1**: アルバム一覧は表紙の `.card` を並べ、タイトルと枚数は `.hud-label`。タグページの見出しは `#タグ名` を `.page-title`。フィード・アルバムページ・ライトボックス・ビューワーは配色だけをそろえる（構成は計画 2・3 で作り替える）
- [ ] **Step 2**: 移行用の別名変数（`--bg` `--surface` `--green-*` など）を使っている箇所がなくなったら、`tokens.css` から消す
- [ ] **Step 3: 一貫性テストが通ることを確かめる**

Run: `npm test`
Expected: すべて PASS（Task 1 の一貫性テストを含む）

- [ ] **Step 4**: `npx astro check && npx astro build` → 0 errors。`astro dev` でフィード・アルバム一覧・アルバムページ（ビューワーが開く）・タグページを表示し、崩れがないこと
- [ ] **Step 5: コミット** `feat: 公開側のページを新しい部品でそろえ、古い色変数を削除`

---

### Task 5: 作品の表示ルールと平面版の作品ページ `/works/<ID>`

**Files:**
- Create: `src/lib/workMeta.ts`, `src/lib/workMeta.test.ts`, `src/pages/works/[id].astro`

**Interfaces:**
- Produces:
  - `displayTitle(title: string | null | undefined): string` — 空や空白だけなら `'無題'`
  - `formatPostedDate(iso: string): string` — `'2026年11月8日'` の形（日本時間）
  - `altText(work: { title?: string | null; description?: string | null; createdAt: string }): string` — 説明があれば説明の先頭 100 文字（grapheme）、なければ `'<表示タイトル>（<投稿日>）'`
  - `workPath(id: string): string` — `/works/<encodeURIComponent(id)>`

- [ ] **Step 1: テストを書く**（`src/lib/workMeta.test.ts`）
```ts
expect(displayTitle(null)).toBe('無題');
expect(displayTitle('  ')).toBe('無題');
expect(displayTitle('古い地図')).toBe('古い地図');
expect(formatPostedDate('2026-11-07T22:30:00.000Z')).toBe('2026年11月8日'); // 日本時間で日付が変わる
expect(altText({ title: null, description: null, createdAt: '2026-11-07T22:30:00.000Z' })).toBe('無題（2026年11月8日）');
expect(altText({ title: 'T', description: '海辺で拾った切符を貼った', createdAt: '2026-11-08T00:00:00Z' })).toBe('海辺で拾った切符を貼った');
expect(altText({ title: 'T', description: 'あ'.repeat(150), createdAt: '2026-11-08T00:00:00Z' })).toBe('あ'.repeat(100));
expect(workPath('a b/c')).toBe('/works/a%20b%2Fc');
```
- [ ] **Step 2**: `npx vitest run src/lib/workMeta.test.ts` → FAIL（モジュールがない）
- [ ] **Step 3**: `workMeta.ts` を実装（grapheme は `src/lib/social/compose.ts` の `countGraphemes` と同じく `Intl.Segmenter`）→ PASS
- [ ] **Step 4: `src/pages/works/[id].astro`**: 画像を取得（なければ `Astro.response.status = 404` で「見つかりません」を表示）。公開用画像 `r2Url(r2Key)` を `alt={altText(...)}` で中央に、本来の縦横比で表示（`width`/`height` 属性を付ける）。下に `displayTitle`、投稿日、作品説明（改行を保つ）、タグ（`a.chip`、`tagHref`）、所属アルバムへのリンク（`albumHref`）。`<title>` は表示タイトル、`<meta name="description">` は説明の先頭
- [ ] **Step 5: 確かめる**（`astro dev`）
  - 実在の ID → 200、タイトル・投稿日・タグ・説明が HTML に含まれる（`curl -s … | grep`）
  - 存在しない ID、`%00` などを含む ID → 404
  - 改行を含む長い説明が改行を保ち、横にはみ出さない
- [ ] **Step 6: コミット** `feat: 作品の表示ルールと平面版の作品ページ /works/<ID> を追加`

---

### Task 6: 作品説明の入力欄と Bluesky のリンク先

**Files:**
- Modify: `src/components/UploadForm.tsx`, `src/pages/[admin]/images.astro`, `src/actions/index.ts`, `src/lib/social/compose.ts`, `src/lib/social/compose.test.ts`

**Interfaces:**
- Consumes: Task 5 の `workPath`
- Produces（`compose.ts`）:
  - `WORK_ID_PLACEHOLDER = 'x'.repeat(21)`（nanoid の長さに合わせ、文字数の表示が実際とずれないようにする）
  - `resolvePostText(text: string, siteUrl: string, workId: string): string` — 文面中の `<siteUrl>works/<WORK_ID_PLACEHOLDER>` を実際の作品 URL に置き換える。含まれていなければそのまま

- [ ] **Step 1: テストを書く**（`compose.test.ts` に追加）
```ts
const SITE = 'https://misosuke-site.misosuke.workers.dev/';
const ph = `${SITE}works/${WORK_ID_PLACEHOLDER}`;
expect(resolvePostText(`T\n${ph}`, SITE, 'abc')).toBe(`T\n${SITE}works/abc`);
expect(resolvePostText('リンクなし', SITE, 'abc')).toBe('リンクなし');
expect(resolvePostText(`${ph} と ${ph}`, SITE, 'abc')).toBe(`${SITE}works/abc と ${SITE}works/abc`);
```
- [ ] **Step 2**: FAIL を確かめる → **Step 3**: 実装 → PASS
- [ ] **Step 4: アップロード画面**: 画像ごとに「作品説明」のテキストエリアを追加し、`description` として送る。投稿の文面の自動作成は、タイトル・説明・タグ・URL を使い、URL は `${siteUrl}works/${WORK_ID_PLACEHOLDER}` にする。文面の下に「URL は投稿時に作品ページの URL に置き換わります」と小さく表示
- [ ] **Step 5: サーバー側**（`uploadImage`）: 手で編集した文面は `clampPostText(resolvePostText(edited, site, id))`、自動作成のときは `composePostText({ …, description, url: includeLink ? new URL(workPath(id), site).href : null })`
- [ ] **Step 6: 画像管理の編集欄**: 作品説明のテキストエリアを追加し、保存で `updateImage` に `description` を送る（既存の値を初期表示）
- [ ] **Step 7: 確かめる**: `npm test` → PASS、`npx astro check` → 0 errors。`astro dev` で説明付きでアップロード → 作品ページに説明が出る。画像管理で説明を編集して保存 → 反映される。投稿 ON・Bluesky の認証情報なしでアップロード → `bluesky_posts.text` の URL が `…/works/<実際のID>` になり、`xxxxxxxx` が残っていない。確認データは削除
- [ ] **Step 8: コミット** `feat: 作品説明の入力欄を追加し、Bluesky のリンクを作品ページにする`
