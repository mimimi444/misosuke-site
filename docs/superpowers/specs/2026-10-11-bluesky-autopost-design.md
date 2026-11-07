# Bluesky 自動ポスト設計書

**日付:** 2026-10-11
**対象:** 画像アップロード時の Bluesky 自動投稿
**スコープ外:** アルバム投稿・フィード表示・シェアボタン・Wick 連携（後述）

---

## 概要

管理画面から画像をアップロードしたとき、Bluesky へ自動で投稿する。投稿するかどうか・画像を添付するか・サイトへのリンクを含めるかは、アップロードフォームで投稿ごとに選択する。

投稿はアップロード処理とは切り離してバックグラウンドで実行し、結果を DB に記録する。Bluesky 側の障害がアップロードを巻き込まないようにするため。

---

## スコープ

### 含む

- 画像アップロード時の Bluesky 投稿（`uploadImage` アクション）
- アップロードフォームの投稿設定UI（投稿する / 画像添付 / リンク含める / 文面編集）
- 投稿結果の記録（`bluesky_posts` テーブル）
- 文面組み立てロジックとその単体テスト

### 含まない

- アルバム作成時の投稿
- Bluesky フィードのサイト内表示
- シェアボタン
- 失敗した投稿の再投稿UI（記録はするが、再投稿は次の課題）

### Wick について

Wick には公開された開発者向け API が存在しない。アプリの内部エンドポイント（`prod.api.wick-service.com`）を叩く方法はあるが、[Wick 利用規約](https://wick-biz.com/TermsofService) 第8条(8) が「本サービスのソフトウェアその他のシステムに対するリバースエンジニアリングその他の解析行為」を禁止しており、これに該当する。

加えて、Wick の共有 URL は未ログインだとサインイン画面へリダイレクトされ（`prod.api.wick-service.com/sns/share/...` → `wick-sns.com/sns/signin`）、`robots.txt` も 403 を返す。仮に取得できてもサイト訪問者には表示できない。

**したがって Wick との自動連携は実装しない。** Wick 側はプロフィールへのリンクを置き、投稿は手動で行う。

---

## Bluesky API の制約

設計を縛る制約を先に挙げる。

| 制約 | 内容 | 本設計での扱い |
|---|---|---|
| embed は1つ | `app.bsky.embed.images` と `app.bsky.embed.external`（リンクカード）は排他 | 画像添付時、リンクは本文内の facet として貼る。リンクカードは出ない |
| 画像サイズ | 1枚あたり約 1MB 上限 | Cloudflare Images binding でリサイズしてから送る |
| 本文長 | 300 grapheme | `compose.ts` でトリムする |
| 認証 | アプリパスワード（取り消し可能） | 本体パスワードは使わない。Secrets に保管 |

---

## データモデル

`src/db/schema.ts` に追加する。

```ts
export const blueskyPosts = sqliteTable('bluesky_posts', {
  id: text('id').primaryKey(),
  imageId: text('image_id').notNull().references(() => images.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),        // 'pending' | 'success' | 'failed'
  text: text('text').notNull(),            // 実際に投稿した本文
  postUri: text('post_uri'),               // at:// URI（成功時）
  postCid: text('post_cid'),               // CID（成功時）
  error: text('error'),                    // エラー内容（失敗時）
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

投稿1回につき1行。`imageId` の画像が削除されたら投稿記録も消える（`cascade`）。

サービスを表すカラムは持たない。Bluesky 以外に投稿する予定が現時点でないため。増えたときにテーブルを足す。

マイグレーションは `drizzle-kit generate` で生成し、`drizzle/migrations/` に入れる。

---

## モジュール構成

### `src/lib/social/compose.ts`

文面を組み立てる純粋関数。外部依存なし。

```ts
interface ComposeInput {
  title?: string | null;
  description?: string | null;
  tagNames: string[];
  url?: string | null;   // リンクを含めない場合 null
}

export function composePostText(input: ComposeInput): string;
```

組み立て順は タイトル → 説明 → タグ → URL で、各ブロックを改行1つで繋ぐ。タグ同士は半角スペース区切りで1行にまとめる。

```
ジャンクジャーナル 1冊目
古い切符と包装紙で作った
#コラージュ #ジャンクジャーナル
https://misosuke-site.misosuke.workers.dev/albums/xxxx
```


- 全体が 300 grapheme を超える場合、**説明文**から削る（タイトル・タグ・URL は保持する）。説明を全部削ってもなお超える場合は、末尾から grapheme 単位でトリムし `…` を付す。
- grapheme 単位の数え方は `Intl.Segmenter` を使う。`String.length` は絵文字や結合文字で誤差が出るため。
- タグは `#` + タグ名。空白を含むタグ名は空白を除去する（Bluesky のタグは空白を含められない）。
- 空の項目は行ごと省く。

この関数だけを vitest で単体テストする。

### `src/lib/bluesky.ts`

`@atproto/api` の薄いラッパー。外部 API を知っている唯一の場所。

```ts
export async function createBlueskyAgent(identifier: string, appPassword: string): Promise<AtpAgent>;
export async function uploadBlob(agent: AtpAgent, bytes: Uint8Array, mimeType: string): Promise<BlobRef>;
export async function createPost(agent: AtpAgent, params: {
  text: string;
  image?: { blob: BlobRef; alt: string };
}): Promise<{ uri: string; cid: string }>;
```

本文内の URL とタグは `RichText` の `detectFacets()` でリンク/タグ facet に変換する。手で byte offset を計算しない。

### `src/lib/social/publish.ts`

オーケストレーション。

```ts
export async function publishImageToBluesky(params: {
  db: DrizzleD1Database;
  bucket: R2Bucket;
  images: ImagesBinding;
  imageId: string;
  text: string;
  attachImage: boolean;
  env: { identifier: string; appPassword: string };
}): Promise<void>;
```

処理順:

1. `bluesky_posts` に `status: 'pending'` で行を作る
2. `attachImage` なら R2 から画像を読み、Cloudflare Images でリサイズして blob をアップロード
3. post を作成
4. 成功なら `status: 'success'` と `postUri` / `postCid` を書き込む
5. 失敗なら `status: 'failed'` と `error` を書き込む。**例外は外に投げない**（`waitUntil` 内で投げても誰も拾わないため）

### 画像のリサイズ

Cloudflare Images binding を使う。

```ts
const resized = await env.IMAGES
  .input(r2Object.body)
  .transform({ width: 1200, fit: 'scale-down' })
  .output({ format: 'image/jpeg', quality: 85 });
```

1MB を超えた場合は quality を落として1度だけ再試行し、それでも超えるなら添付を諦めてテキストのみで投稿する（投稿自体は成功させる）。この場合 `error` に添付失敗の旨を残す。

---

## 実行フロー

```
管理画面でアップロード
  ↓ uploadImage アクション（既存）
  ↓ R2 put + D1 insert + タグ処理   ← ここまで今まで通り
  ↓ postToBluesky が true なら
  ↓ ctx.waitUntil(publishImageToBluesky(...))
  ↓ アクションは即座に { id } を返す      ← ユーザーを待たせない
       ↓（バックグラウンド）
       bluesky_posts に pending
       ↓ 画像リサイズ → blob upload → post
       ↓ success / failed を書き込む
```

`ctx.waitUntil` は Astro の Cloudflare アダプタ経由で `context.locals.runtime.ctx.waitUntil` から取得する。アクションの handler は第2引数に `ActionAPIContext` を受け取る。

---

## UI

`src/components/UploadForm.tsx` に投稿設定を追加する。

| 項目 | 形式 | 既定値 |
|---|---|---|
| Blueskyに投稿する | チェックボックス | OFF |
| 画像を添付 | チェックボックス | ON（投稿するときのみ有効） |
| サイトへのリンクを含める | チェックボックス | ON（投稿するときのみ有効） |
| 文面 | テキストエリア | タイトル・説明・タグから自動生成、編集可 |

- 「Blueskyに投稿する」が OFF のときは他3項目を無効化する
- 文面はタイトル・説明・タグの入力に追従して自動更新するが、**ユーザーが文面を手で編集したら以降は追従を止める**（編集内容を勝手に上書きしない）
- 文面の下に残り文字数を表示する。300 を超えたら警告色にする（送信は妨げない。サーバー側でトリムする）

`uploadImage` アクションの input に以下を追加する。

```ts
postToBluesky: z.coerce.boolean().optional(),
attachImage: z.coerce.boolean().optional(),
postText: z.string().optional(),
```

`postText` が空なら、サーバー側で `composePostText` を使って組み立てる。

---

## 設定

### `astro.config.mjs`

```js
site: 'https://misosuke-site.misosuke.workers.dev'
```

投稿に含めるリンクの絶対 URL を組み立てるために必要。

### `wrangler.jsonc`

```jsonc
"images": { "binding": "IMAGES" }
```

### Secrets

```sh
wrangler secret put BLUESKY_IDENTIFIER     # 例: misosuke.bsky.social
wrangler secret put BLUESKY_APP_PASSWORD   # Bluesky 設定画面で発行するアプリパスワード
```

ローカル開発では `.dev.vars` に書く。`.dev.vars` は `.gitignore` に未記載なので追加する（確認済み）。

**本体パスワードは使わない。** アプリパスワードは Bluesky の Settings → App Passwords から発行でき、いつでも失効させられる。

### 依存追加

- `@atproto/api`（dependencies）
- `vitest`（devDependencies）

---

## エラー処理

| 状況 | 挙動 |
|---|---|
| Secrets 未設定 | 投稿をスキップし `failed` に「認証情報が未設定」と記録。アップロードは成功 |
| Bluesky ログイン失敗 | `failed` に記録。アップロードは成功 |
| 画像リサイズ失敗 / 1MB 超 | テキストのみで投稿し、`error` に添付失敗を記録 |
| post 作成失敗 | `failed` に記録 |
| アップロード自体の失敗 | 従来通りアクションがエラーを返す。投稿は走らない |

共通方針: **投稿の失敗がアップロードを壊さない。** 失敗は握りつぶさず `bluesky_posts` に残す。

---

## テスト

vitest を導入し、`src/lib/social/compose.test.ts` のみ書く。

テストする振る舞い:

- タイトル・説明・タグ・URL が全部ある場合に期待する文面になる
- 各項目が欠けた場合に空行が残らない
- 300 grapheme を超えるとき説明文から削られ、タイトル・タグ・URL が残る
- 説明を削っても超える場合に末尾トリムされ `…` が付く
- 絵文字・結合文字を含む文字列で grapheme 数が正しく数えられる
- タグ名の空白が除去される
- `url` が null のときリンクが含まれない

Workers 環境の統合テスト（D1 / R2 / Images binding のモック）は行わない。実際の投稿確認は、アプリパスワードを設定したうえで手動で1枚アップロードして Bluesky 側を見る。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/db/schema.ts` | `blueskyPosts` テーブル追加 |
| `drizzle/migrations/` | マイグレーション追加（生成） |
| `src/lib/social/compose.ts` | 新規。文面組み立て |
| `src/lib/social/compose.test.ts` | 新規。単体テスト |
| `src/lib/bluesky.ts` | 新規。atproto ラッパー |
| `src/lib/social/publish.ts` | 新規。オーケストレーション |
| `src/actions/index.ts` | `uploadImage` に投稿パラメータと `waitUntil` 追加 |
| `src/components/UploadForm.tsx` | 投稿設定UI追加 |
| `astro.config.mjs` | `site` 追加 |
| `wrangler.jsonc` | `images` binding 追加 |
| `package.json` | `@atproto/api`・`vitest` 追加、`test` スクリプト追加 |
| `.gitignore` | `.dev.vars` 追加 |

---

## 別途対応が必要な事項（本スコープ外）

**管理画面に認証が無い。** `src/middleware.ts` が存在せず、`/admin` 配下のページと Astro Actions がどちらも保護されていない。現状でも第三者が画像をアップロード・削除できる状態に見える。Cloudflare Access などサイト外で保護されている可能性はあるため要確認。

本機能を入れると、そこに「Bluesky へ投稿する」経路が加わる。認証の確認を本機能のデプロイ前に行うこと。対応自体は別タスクとする。
