# Bluesky 自動ポスト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面から画像をアップロードしたとき、フォームでの選択に応じて Bluesky へバックグラウンドで投稿し、結果を `bluesky_posts` に記録する。

**Architecture:** 文面組み立ては外部依存のない純粋関数（`compose.ts`）にしてブラウザとサーバーの両方で使う。`uploadImage` アクションは従来どおり R2/D1 に保存したあと、`locals.cfContext.waitUntil` で `publishImageToBluesky` を起動して即座に返す。`publish.ts` は例外を外に出さず、成否を必ず D1 に書く。

**Tech Stack:** Astro 6（Cloudflare アダプタ、Actions）、Drizzle + D1、R2、Cloudflare Images binding、`@atproto/api`、React 19、vitest 5

**Spec:** `docs/superpowers/specs/2026-10-11-bluesky-autopost-design.md`

## Global Constraints

- 本文上限は **300 grapheme**。数えるときは `Intl.Segmenter`（granularity: `'grapheme'`）を使う。`String.length` は使わない
- 文面の組み立て順は タイトル → 説明 → タグ → URL。ブロック同士は改行1つ、タグ同士は半角スペース1つで区切る。空の項目は行ごと省く
- 削るときは**説明文から**。タイトル・タグ・URL は残す。それでも超える場合は末尾を grapheme 単位で切り、`…` を付ける
- タグは `#` + タグ名。タグ名に含まれる空白はすべて取り除く
- 画像リサイズは `width: 1200, fit: 'scale-down'`、`format: 'image/jpeg', quality: 85`。1MB（1,000,000 バイト）を超えたら一度だけ quality を下げて再試行し、それでも超えたら画像なしで投稿して `error` に添付失敗を記録する
- 認証は**アプリパスワード**で行う。Secrets は `BLUESKY_IDENTIFIER` / `BLUESKY_APP_PASSWORD`
- **投稿の失敗でアップロードを壊さない。** `publishImageToBluesky` は例外を投げない
- `astro.config.mjs` の `site` は `'https://misosuke-site.misosuke.workers.dev'`
- wrangler を使う前に `wrangler whoami` で、アカウントID が `c6a3018a20d7abab33bb8e9ebfee20b6` であることを確かめる（`wrangler.jsonc` で固定済み）

## 設計書から決めたこと（設計書に書かれていない点）

- **投稿に入れるリンクはサイトのトップ（`site` の値）にする。** 設計書の例は `/albums/xxxx` だが、アップロード直後の画像はどのアルバムにも入っておらず、画像単体のページも存在しないため
- **投稿設定は画像ごとに持つ。** `UploadForm` は複数の画像を一度にアップロードでき、文面は画像ごとのタイトルやタグから作られるため。1枚 = 1投稿
- **リンク有無もアクションに渡す（`includeLink`）。** `postText` が空のとき、サーバー側でリンクを入れるかどうかを決めるのに必要なため
- **フォームの真偽値は `'true'` / `'false'` の文字列で送り、`formBoolean` で解釈する。** `z.coerce.boolean()` は文字列の `'false'` を `true` にしてしまうため
- アップロードフォームには説明の入力欄がないので、説明はアクションに渡された場合だけ文面に入る（今回は入力欄を追加しない）

## Review Focus

1. **チェックを外した項目が `'false'` として送られる** → 投稿されないこと（`z.coerce.boolean('false') === true` の罠）。Task 1 の `formBoolean` のテストで押さえる
2. **説明の削り位置が絵文字や結合文字の途中にかかる** → 文字が壊れず、300 grapheme 以内に収まること。Task 1 のテストで押さえる
3. **ユーザーが手で編集した文面が 300 を超える** → サーバー側で `clampPostText` により切り詰めてから投稿すること。Task 1 のテストと Task 4 で押さえる
4. **タグ名が空白だけ、または重複している** → 空の `#` を出さず、同じタグを2回出さないこと。Task 1 のテストで押さえる
5. **Secrets が未設定、Bluesky がダウン、R2 にオブジェクトがない** → アップロードは成功し、`bluesky_posts` に `failed` が残ること。D1/R2/Images のモックを作らないという設計書の方針に従い、Task 6 の手動確認で押さえる

---

### Task 1: 文面組み立てとフォーム真偽値（純粋関数とテスト）

**Files:**
- Create: `src/lib/social/compose.ts`
- Create: `src/lib/social/compose.test.ts`
- Create: `src/lib/form.ts`
- Create: `src/lib/form.test.ts`

**Interfaces:**
- Produces:
  - `POST_MAX_GRAPHEMES = 300`
  - `countGraphemes(text: string): number`
  - `splitTagNames(raw: string | null | undefined): string[]`: カンマで分け、前後の空白を取り、空の要素を捨てる
  - `interface ComposeInput { title?: string | null; description?: string | null; tagNames: string[]; url?: string | null }`
  - `composePostText(input: ComposeInput): string`
  - `clampPostText(text: string): string`: 300 grapheme を超えたら末尾を切って `…` を付ける（`…` を含めて 300）。超えていなければそのまま返す
  - `formBoolean`: zod スキーマ。`'true'` → `true`、`'false'` か未指定 → `false`

- [ ] **Step 1: `compose.test.ts` に失敗するテストを書く**

```ts
const URL = 'https://misosuke-site.misosuke.workers.dev/';

test('全項目がそろっている場合', () => {
  expect(composePostText({ title: 'ジャンクジャーナル 1冊目', description: '古い切符と包装紙で作った', tagNames: ['コラージュ', 'ジャンクジャーナル'], url: URL }))
    .toBe(`ジャンクジャーナル 1冊目\n古い切符と包装紙で作った\n#コラージュ #ジャンクジャーナル\n${URL}`);
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
test('絵文字と結合文字を1文字として数える', () => {
  expect(countGraphemes('👨‍👩‍👧')).toBe(1);
  expect(countGraphemes('が')).toBe(1); // か + 濁点の結合文字
  expect(countGraphemes('🇯🇵a')).toBe(2);
});
test('説明の削り位置が絵文字にかかっても壊れない', () => {
  const out = composePostText({ title: 'T', description: '👨‍👩‍👧'.repeat(400), tagNames: [], url: null });
  expect(countGraphemes(out)).toBeLessThanOrEqual(300);
  expect(out).not.toMatch(/‍…|‍$/); // ZWJ の途中で切れていない
});
test('clampPostText: 300 以内ならそのまま、超えたら … 込みで 300', () => {
  expect(clampPostText('abc')).toBe('abc');
  const out = clampPostText('あ'.repeat(301));
  expect(countGraphemes(out)).toBe(300);
  expect(out.endsWith('…')).toBe(true);
});
test('splitTagNames', () => {
  expect(splitTagNames(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
  expect(splitTagNames(undefined)).toEqual([]);
});
```

- [ ] **Step 2: `form.test.ts` に失敗するテストを書く**

```ts
test.each([['true', true], ['false', false], [undefined, false]])('formBoolean(%s) は %s', (input, expected) => {
  expect(formBoolean.parse(input)).toBe(expected);
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL。モジュールや関数が見つからないため

- [ ] **Step 4: `compose.ts` と `form.ts` を実装する**

削り方の手順は次のとおり。説明以外のブロックを `\n` でつないだときの grapheme 数を `base` とする。説明があり、`base + 1 + 説明` が 300 を超える場合、説明に使える数 `room = 300 - base - 1` を計算する。`room >= 2` なら説明を先頭 `room - 1` grapheme + `…` にし、そうでなければ説明の行ごと省く。最後に全体へ `clampPostText` をかける。grapheme の切り出しは `Intl.Segmenter` の分割結果を配列にして `slice` する。`formBoolean` は `z.enum(['true', 'false']).optional().transform(v => v === 'true')`（`import { z } from 'astro:schema'` ではなく `zod` から直接読む。vitest からは `astro:schema` が解決できないため。`zod` は astro 経由で 4.4.3 が入っているだけなので、`npm install zod@^4.4.3` で直接の依存に加える。astro と同じ版にそろえる）

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて PASS（既存の auth のテスト8件を含む）

- [ ] **Step 6: コミット**

```bash
git add src/lib/social/compose.ts src/lib/social/compose.test.ts src/lib/form.ts src/lib/form.test.ts package.json package-lock.json
git commit -m "feat: Bluesky 投稿文の組み立てとフォーム真偽値の解釈を追加"
```

---

### Task 2: `bluesky_posts` テーブル

**Files:**
- Modify: `src/db/schema.ts`（末尾に追加）
- Create: `drizzle/migrations/0001_*.sql`（生成）

**Interfaces:**
- Produces: `blueskyPosts` テーブル。列は設計書の「データモデル」のとおり（`id, imageId, status, text, postUri, postCid, error, createdAt, updatedAt`。`imageId` は `images.id` を参照し `onDelete: 'cascade'`）。`status` の値は `'pending' | 'success' | 'failed'`

- [ ] **Step 1: 設計書のとおりに `schema.ts` に `blueskyPosts` を追加する**
- [ ] **Step 2: マイグレーションを生成する**

Run: `npx drizzle-kit generate`
Expected: `drizzle/migrations/0001_*.sql` ができ、中身は `CREATE TABLE \`bluesky_posts\`` と外部キー（`ON DELETE cascade`）だけ。既存テーブルへの変更が含まれていたら止めて報告する

- [ ] **Step 3: ローカルの D1 に適用する**

Run: `npx wrangler d1 migrations apply misosuke-db --local`
Expected: `0001_*` が適用済みになる

- [ ] **Step 4: 型チェック**

Run: `npx astro check`
Expected: 0 errors

- [ ] **Step 5: コミット**

```bash
git add src/db/schema.ts drizzle/migrations
git commit -m "feat: bluesky_posts テーブルを追加"
```

本番 D1 への適用（`npm run cf:migrate`）は Task 6 で行う。

---

### Task 3: atproto ラッパーと設定

**Files:**
- Create: `src/lib/bluesky.ts`
- Modify: `package.json`（`@atproto/api` を dependencies に追加）
- Modify: `wrangler.jsonc`（`"images": { "binding": "IMAGES" }` を追加）
- Modify: `src/worker-env.d.ts`（`BLUESKY_IDENTIFIER: string; BLUESKY_APP_PASSWORD: string;` を両方の `Env` に追加）
- Modify: `worker-configuration.d.ts`（`npm run generate-types` で再生成）
- Modify: `astro.config.mjs`（`site` を追加）

**Interfaces:**
- Produces（設計書のシグネチャどおり）:
  - `createBlueskyAgent(identifier: string, appPassword: string): Promise<AtpAgent>`: `service: 'https://bsky.social'` でログインする
  - `uploadBlob(agent: AtpAgent, bytes: Uint8Array, mimeType: string): Promise<BlobRef>`
  - `createPost(agent: AtpAgent, params: { text: string; image?: { blob: BlobRef; alt: string } }): Promise<{ uri: string; cid: string }>`: `RichText` の `detectFacets(agent)` でリンクとタグの facet を作る。`image` があれば `app.bsky.embed.images` を付ける。`createdAt` は現在時刻の ISO 文字列

- [ ] **Step 1: 依存を追加する**

Run: `npm install @atproto/api`

- [ ] **Step 2: 設定を変える**

`wrangler.jsonc` に images binding、`astro.config.mjs` に `site`、`worker-env.d.ts` に Bluesky の Secrets の型を追加し、`npm run generate-types` を実行する。`IMAGES` はアダプタも自動で追加するので、ビルド結果の `dist/server/wrangler.json` で `images` が1つだけになっていることを Step 4 で確かめる

- [ ] **Step 3: `src/lib/bluesky.ts` を実装する**

- [ ] **Step 4: 型チェックとビルド**

Run: `npx astro check && npx astro build && grep -o '"images":{[^}]*}' dist/server/wrangler.json`
Expected: 0 errors。ビルドが成功し、`"images":{"binding":"IMAGES"}` が出る（`previews` 側を含めて重複によるエラーがないこと）

- [ ] **Step 5: コミット**

```bash
git add src/lib/bluesky.ts package.json package-lock.json wrangler.jsonc src/worker-env.d.ts worker-configuration.d.ts astro.config.mjs
git commit -m "feat: Bluesky API ラッパーと投稿用の設定を追加"
```

---

### Task 4: 投稿のオーケストレーションとアクションへの組み込み

**Files:**
- Create: `src/lib/social/publish.ts`
- Modify: `src/actions/index.ts`（`uploadImage`）

**Interfaces:**
- Consumes: Task 1 の `composePostText`, `clampPostText`, `splitTagNames`, `formBoolean`。Task 2 の `blueskyPosts`。Task 3 の `createBlueskyAgent`, `uploadBlob`, `createPost`
- Produces:
  - `publishImageToBluesky(params: { db: DrizzleD1Database; bucket: R2Bucket; images: ImagesBinding; imageId: string; text: string; attachImage: boolean; altText: string; env: { identifier: string; appPassword: string } }): Promise<void>`: 設計書のシグネチャに `altText` を加えたもの（呼び出し側がタイトルを渡す。なければ `''`）
  - `uploadImage` の input に `postToBluesky: formBoolean`, `attachImage: formBoolean`, `includeLink: formBoolean`, `postText: z.string().optional()` を追加

- [ ] **Step 1: `publish.ts` を実装する**

処理の順番と状態の書き込みは、設計書の「`src/lib/social/publish.ts`」の1〜5と「エラー処理」の表のとおり。決めておく点は次のとおり。
- 関数全体を try/catch で包み、何があっても reject しない。最初の `pending` の insert が失敗した場合は `console.error` だけを出す
- Secrets が空なら Bluesky に接続せず、`failed`、`error: '認証情報が未設定'` にする
- リサイズは `images.input(obj.body).transform({ width: 1200, fit: 'scale-down' }).output({ format: 'image/jpeg', quality })`。結果のバイト列は `.response().arrayBuffer()` で取り出す。quality 85 で 1,000,000 バイトを超えたら quality 60 で一度だけやり直す
- R2 にオブジェクトがない、リサイズ失敗、1MB 超えのいずれかなら画像なしで投稿する。投稿に成功したら `status: 'success'` とし、`error` に `画像の添付に失敗: <理由>` を残す
- `updatedAt` は更新のたびに書き換える

- [ ] **Step 2: `uploadImage` に組み込む**

handler を `async (input, context)` に変える。既存の保存処理のあと、`input.postToBluesky` が true なら次のようにする。
- 文面: `input.postText?.trim()` があれば `clampPostText(postText)`、なければ `composePostText({ title, description, tagNames: splitTagNames(input.tagNames), url: input.includeLink ? context.site?.href ?? null : null })`
- `context.locals.cfContext.waitUntil(publishImageToBluesky({ ..., env: { identifier: env.BLUESKY_IDENTIFIER ?? '', appPassword: env.BLUESKY_APP_PASSWORD ?? '' } }))`
- 戻り値は従来どおり `{ id }`。投稿の完了は待たない

- [ ] **Step 3: 型チェック・テスト・ビルド**

Run: `npx astro check && npm test && npx astro build`
Expected: 0 errors、すべて PASS、ビルド成功

- [ ] **Step 4: ローカルで投稿なしのアップロードが今までどおり動くことを確かめる**

`astro dev` を起動し、Basic 認証付きで `/_actions/uploadImage` に小さな画像を `postToBluesky` なしで POST する。200 と `{ id }` が返り、ローカル D1 の `bluesky_posts` に行が増えないこと。確認に使った画像はそのあと `deleteImage` で消す

- [ ] **Step 5: ローカルで Secrets 未設定時に `failed` が記録されることを確かめる**

`.dev.vars` に `BLUESKY_*` がない状態で `postToBluesky=true` を付けて POST する。200 が返り、数秒後に `bluesky_posts` に `status='failed'`, `error='認証情報が未設定'` の行ができること（`npx wrangler d1 execute misosuke-db --local --command "select status, error from bluesky_posts"`）。確認後は画像を `deleteImage` で消す（投稿記録は cascade で消える）

- [ ] **Step 6: コミット**

```bash
git add src/lib/social/publish.ts src/actions/index.ts
git commit -m "feat: 画像アップロード時に Bluesky へバックグラウンド投稿する"
```

---

### Task 5: アップロードフォームの投稿設定 UI

**Files:**
- Modify: `src/components/UploadForm.tsx`
- Modify: `src/pages/admin/upload.astro`（`siteUrl={Astro.site?.href ?? ''}` を渡す。設定欄のスタイルを既存の `:global(...)` に合わせて追加する）

**Interfaces:**
- Consumes: Task 1 の `composePostText`, `countGraphemes`, `splitTagNames`, `POST_MAX_GRAPHEMES`。Task 4 のアクション入力（`postToBluesky`, `attachImage`, `includeLink`, `postText`）
- Produces: `Props` に `siteUrl: string` を追加

- [ ] **Step 1: `FileItem` に投稿設定を追加する**

追加する項目は `postToBluesky: boolean`（初期値 false）、`attachImage: boolean`（true）、`includeLink: boolean`（true）、`postText: string`、`postTextEdited: boolean`（false）

- [ ] **Step 2: 画像ごとの設定欄を作る**

`preview-fields` の下に設定欄を置く。設計書の「UI」の表と箇条書きのとおり。
- 「Blueskyに投稿する」が OFF のときは、他の3項目を `disabled` にする
- タイトル・タグ・リンク有無が変わったら、`postTextEdited` が false の項目だけ `composePostText` で文面を作り直す。テキストエリアを手で編集したら `postTextEdited = true` にする
- 文面の下に `countGraphemes(postText) / 300` を表示し、300 を超えたら警告色にする。送信は止めない

- [ ] **Step 3: 送信時の FormData**

`postToBluesky` が true の項目だけ、`postToBluesky='true'`、`attachImage` / `includeLink` を `'true'` か `'false'`、`postText` を送る。false の項目では投稿関連のフィールドを何も送らない

- [ ] **Step 4: 型チェックとビルド**

Run: `npx astro check && npx astro build`
Expected: 0 errors、ビルド成功

- [ ] **Step 5: ブラウザで確かめる**

`astro dev` で `/admin/upload` を開き（Basic 認証あり）、次の点を確かめる。
- 画像を1枚追加すると設定欄が出て、OFF のときは下の3項目を操作できない
- ON にしてタイトルやタグを入力すると文面が追従する
- 文面を手で編集すると、その後タイトルを変えても文面が上書きされない
- 300 を超えると残り文字数が警告色になる

アップロードはしない

- [ ] **Step 6: コミット**

```bash
git add src/components/UploadForm.tsx src/pages/admin/upload.astro
git commit -m "feat: アップロードフォームに Bluesky 投稿設定を追加"
```

---

### Task 6: 本番への反映と実投稿の確認（ユーザーとの共同作業）

外部に影響する操作なので、**各ステップの前にユーザーの了承を得る。**

- [ ] **Step 1:** ユーザーが Bluesky でアプリパスワードを発行し、本人が `npx wrangler secret put BLUESKY_IDENTIFIER` と `npx wrangler secret put BLUESKY_APP_PASSWORD` を実行する。値は会話に出さない。ローカルで試す場合は `.dev.vars` にも書いてもらう
- [ ] **Step 2:** `wrangler whoami` でアカウントID を確かめてから、本番 D1 にマイグレーションを適用する: `npm run cf:migrate`。Expected: `0001_*` が適用される
- [ ] **Step 3:** `npm run deploy`。そのあと、本番の `/admin` が認証なしでは 401 になることを確かめる
- [ ] **Step 4:** ユーザーが本番の管理画面から画像を1枚、投稿 ON（画像添付 ON、リンク ON）でアップロードする。Bluesky に画像付きで投稿され、本文のリンクとタグがクリックできること。`npx wrangler d1 execute misosuke-db --remote --command "select status, post_uri, error from bluesky_posts order by created_at desc limit 1"` で `success` と at:// URI が記録されていること
