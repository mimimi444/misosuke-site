# 雑誌 UI リデザイン 計画 2/3: トップページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トップページ（と同じ構成のタグページ）を、流れる作品一覧（PC は左、スマホは上）と、ランダムに選んだ作品が空中の雑誌としてめくれる 3D 表示に作り替える。

**Architecture:** 紙の形・めくりの時間割・見開きの割り当て・ランダム選択は three.js に依存しない純粋関数にしてテストする。three.js はシーンを組み立てる 1 モジュールに閉じ込め、トップとタグページのクライアントスクリプトからだけ動的に読み込む。作品一覧は最初の数十件を HTML に含め、流れに合わせて API から読み足す。サムネイル用の小さい画像をアップロード時に作り、既存の画像には管理画面から一度だけ作成処理を流す。

**Tech Stack:** Astro 6（Cloudflare）、three.js 0.187（`three` / `@types/three`）、D1/Drizzle、R2、Cloudflare Images、vitest

**Spec:** `docs/superpowers/specs/2026-11-08-magazine-ui-design.md`（「トップページ」「作品一覧（レール）の範囲」「ランダムな選び方」「『見せる』ページめくり」「ページと画像の対応」「制約・品質」）
**参照試作:** `docs/superpowers/specs/assets/2026-11-08-magazine-prototype.html`（`shapePage()`・めくりの時間割・カメラ追従・幾何学アニメーションの基準）

**この計画の範囲外（計画 3）:** 同じ画面のまま開く作品詳細、URL の書き換え、「読む」モードとズーム、旧ライトボックス・旧ビューワーの削除。この計画では、作品一覧や雑誌を押したら既存のページ（アルバムは `/albums/<slug>?page=<n>`、それ以外は `/works/<ID>`）へ普通に移動する。

## Global Constraints

- カメラは注視点からの相対位置 `(1.34, 2.89, 0.94)`、焦点距離 44mm、BokehPass の aperture 0.006。ピントの合う右ページの重心が常に画面中央に来るよう、向きと距離を保ったまま平行移動で追従する
- 紙は背表紙で約 58° 立ち上がり、外側へ行くほど約 -14° まで垂れる（試作の `RISE` / `SAG` / `FALL = 0.32`）。めくり途中は外側が遅れる（`LAG = 0.55`）
- ページ同士の間隔は紙の面に垂直な方向に取り、めくっているページは束から浮かせる（下のページに埋まらない）
- めくりは約 2.5 秒ごとに 1 枚、最後まで行ったらパラパラと一気に戻る
- 画像 1 枚 = 紙の片面 1 ページ。最初の見開きの左は表紙の内側（無地）。奇数枚なら最後の見開きの右は裏表紙の内側（無地）
- 表紙の内側は紙の色、外側の縁だけオレンジ（`--accent`）。紙面は生成りの紙に作品を余白付きで配置し、下に小さく `JUNK JOURNAL JOURNEY`
- 雑誌の下にオレンジの細い円・破線の円・目盛りが傾いて重なり、ゆっくり回る
- トップの計器風パネル（NOW OPEN・状態ラベル・AUTO TURN ・ 02 / 06）は絵に重なってよい
- ランダムに選ぶのはブラウザ側。JavaScript 前の HTML には固定の内容（最新の 2 ページ以上のアルバム、なければ最新の数枚）
- 作品一覧は全画像を新しい順。ページ送りはなくす。件数が少なく画面を埋められないときはループさせない
- サムネイルは長辺 400px 程度の WebP を R2 に置く。公開用（長辺 2000px）は雑誌の紙面に使う
- three.js は トップ・タグページでだけ読み込む（管理画面・アルバム一覧・作品ページでは読み込まない）
- `prefers-reduced-motion` では自動めくり・漂い・回転・レールの自動の流れを止める。WebGL が使えなければ平面の表示に切り替える。タブが見えていないときは描画を止める。デバイスピクセル比は上限 2
- 色は `tokens.css` の変数から読む（three.js の色も `getComputedStyle` で変数から取る。一貫性テストを通す）

## Review Focus

1. **作品が 0 件・1 件・アルバムなし** → トップが空白やエラーにならず、0 件なら空の表示、1 件なら 1 枚の紙が浮かぶ（Task 2 のテスト、Task 6 の確認）
2. **WebGL が使えない・動きを減らす設定** → 平面表示・自動めくりなしで、作品一覧と作品へのリンクは使える（Task 6 Step 5）
3. **スマホ（タッチ）でホバーがない** → タップでサムネイルが拡大しメタ情報が出る。2 回目のタップ（またはメタ情報のリンク）で作品へ移動する（Task 5 Step 4）
4. **作品が多い（数百件）** → 作品一覧は読み足しで、最初の HTML が重くならない。サムネイルが無い古い画像は公開用画像で代用する（Task 3・4）
5. **タグページで該当が 1〜2 件** → ループせず並ぶだけ。雑誌はその作品で成り立つ（Task 2・6）

---

### Task 1: サムネイル画像（新規アップロード時と既存分の作成）

**Files:**
- Modify: `src/db/schema.ts`（`images.thumbR2Key: text('thumb_r2_key')` を追加）、`drizzle/migrations/0004_*.sql`（生成）
- Modify: `src/lib/imageFiles.ts`, `src/lib/imageFiles.test.ts`, `src/lib/imageStore.ts`, `src/actions/index.ts`（`uploadImage` で保存、`deleteImage` で削除）
- Create: `src/lib/thumbnails.ts`、`src/pages/[admin]/maintenance/thumbnails.ts`（POST）
- Modify: `src/pages/[admin]/index.astro`（「サムネイルを作成（残り N 件）」ボタン）

**Interfaces:**
- Produces:
  - `THUMB = { maxEdge: 400, format: 'image/webp', quality: 75 } as const`
  - `imageKeys(...)` の戻り値に `thumbKey: 'thumbs/<YYYY>/<MM>/<id>.webp'` を追加
  - `isPublicImageKey` は `thumbs/` を公開してよい
  - `StoredImage.thumbR2Key: string | null`
  - `createThumbnail(images: ImagesBinding, source: ReadableStream | ArrayBuffer, size: { width: number | null; height: number | null }): Promise<ArrayBuffer | null>`（`src/lib/thumbnails.ts`。失敗時は null）
  - `thumbSrc(row: { thumbR2Key: string | null; r2Key: string }): string` — サムネイルがあればそれ、なければ公開用画像の URL（`r2Url`）

- [ ] **Step 1: テスト**（`imageFiles.test.ts`）: `imageKeys('abc123','photo.JPG',NOW).thumbKey === 'thumbs/2026/11/abc123.webp'`、`isPublicImageKey('thumbs/2026/11/a.webp') === true`、`THUMB` の値。`thumbSrc({thumbR2Key:null, r2Key:'images/x.webp'}) === '/api/images/images/x.webp'`、サムネイルがあればそちら
- [ ] **Step 2**: `npm test` → FAIL を確認 → **Step 3**: 実装（縮小は imageStore の圧縮と同じく、長辺が上限を超えるときだけ長辺を指定）→ PASS
- [ ] **Step 4**: スキーマに列を追加し `npx drizzle-kit generate` → `0004_*.sql` が `ALTER TABLE images ADD thumb_r2_key text` だけであること。`npx wrangler d1 migrations apply misosuke-db --local`
- [ ] **Step 5: 既存分の作成**: `POST /<ADMIN_PATH>/maintenance/thumbnails` は `thumb_r2_key IS NULL` の画像を最大 20 件処理し `{ processed, remaining }` を JSON で返す（ログイン必須はミドルウェアで担保。CSRF は Astro の Origin 検査）。ダッシュボードに残り件数とボタンを出し、押すと `remaining` が 0 になるまで繰り返し呼ぶ
- [ ] **Step 6: 確かめる**: `astro dev` でアップロード → `thumb_r2_key` が入り `/api/images/thumbs/...` が 200・幅 400 以下。既存画像に対しボタン → 残り 0。削除で `thumbs/` も消える
- [ ] **Step 7: コミット** `feat: サムネイル画像を作成し、既存分を作る管理機能を追加`

---

### Task 2: 雑誌の中身と時間割（純粋関数）

**Files:**
- Create: `src/lib/magazine/spread.ts`, `src/lib/magazine/spread.test.ts`, `src/lib/magazine/schedule.ts`, `src/lib/magazine/schedule.test.ts`, `src/lib/showcase.ts`, `src/lib/showcase.test.ts`

**Interfaces:**
- Produces:
  - `type MagazinePage = { id: string; src: string; title: string }`
  - `buildLeaves(pages: MagazinePage[]): { front: MagazinePage | null; back: MagazinePage | null }[]` — 1 枚の紙（leaf）の表＝右ページ、裏＝次の見開きの左ページ。最初の見開きの左は表紙の内側なので、leaf[0].front = pages[0]、leaf[0].back = pages[1]、…。最後の裏が無ければ null（裏表紙の内側＝無地）
  - `leafProgress(i: number, t: number, leafCount: number): number` — 0（右）〜1（左）。試作と同じ値: `T_FLIP = 1.9`, `T_GAP = 2.5`, `T_RIFFLE = 0.12`, 戻り 0.8 秒、最後に 1.8 秒待つ。`cycleLength(leafCount): number`
  - `type ShowcaseCandidates = { albums: { slug: string; title: string; pages: MagazinePage[] }[]; singles: MagazinePage[] }`
  - `pickShowcase(c: ShowcaseCandidates, random: () => number): { kind: 'album'; slug: string; title: string; pages: MagazinePage[] } | { kind: 'singles'; title: string; pages: MagazinePage[] } | null` — アルバムと「1 枚ものを最大 6 枚束ねた仮の雑誌」を候補とし、`random` で 1 つ選ぶ。仮の雑誌の枚数は `min(6, singles.length)`、どの 1 枚ものを使うかも `random` で選ぶ。候補が無ければ null
  - `defaultShowcase(c: ShowcaseCandidates): 同じ型` — JavaScript 前の固定内容（最新のアルバム、なければ最新の 1 枚ものを最大 6 枚）

- [ ] **Step 1: テスト**
```ts
// spread
expect(buildLeaves([])).toEqual([]);
expect(buildLeaves([p1]).map(l => [l.front?.id ?? null, l.back?.id ?? null])).toEqual([['1', null]]);
expect(buildLeaves([p1,p2,p3]).map(l => [l.front?.id ?? null, l.back?.id ?? null])).toEqual([['1','2'],['3',null]]);
// schedule（leafCount = 3）
expect(leafProgress(0, 0, 3)).toBe(0);
expect(leafProgress(0, 1.9, 3)).toBe(1);            // 1 枚目は 1.9 秒でめくり終わる
expect(leafProgress(1, 2.5, 3)).toBe(0);            // 2 枚目は 2.5 秒後に始まる
expect(leafProgress(2, 3 * 2.5 + 1.2 + 0.8, 3)).toBe(0);            // 最後の紙から先に戻る
expect(leafProgress(0, 3 * 2.5 + 1.2 + 2 * 0.12 + 0.8, 3)).toBe(0); // 最初の紙は 2 枚分遅れて戻り終わる
expect(cycleLength(3)).toBeCloseTo(3 * 2.5 + 1.2 + 3 * 0.12 + 1.8);
// showcase
expect(pickShowcase({ albums: [], singles: [] }, () => 0)).toBeNull();
expect(pickShowcase({ albums: [], singles: [s1] }, () => 0)).toEqual({ kind: 'singles', title: s1.title, pages: [s1] });
expect(pickShowcase({ albums: [a1], singles: [s1, s2] }, () => 0)?.kind).toBe('album');
expect(pickShowcase({ albums: [a1], singles: [s1, s2] }, () => 0.99)?.kind).toBe('singles');
expect(pickShowcase({ albums: [], singles: Array.from({ length: 9 }, (_, i) => s(i)) }, Math.random)!.pages.length).toBe(6);
expect(defaultShowcase({ albums: [a1, a2], singles: [s1] })).toEqual({ kind: 'album', slug: a1.slug, title: a1.title, pages: a1.pages }); // a1 が最新
```
- [ ] **Step 2**: FAIL を確認 → **Step 3**: 実装 → **Step 4**: PASS
- [ ] **Step 5: コミット** `feat: 雑誌の見開き割り当て・めくりの時間割・ランダム選択を追加`

---

### Task 3: 紙の形（純粋関数）

**Files:**
- Create: `src/lib/magazine/pageShape.ts`, `src/lib/magazine/pageShape.test.ts`

**Interfaces:**
- Produces:
  - `PAPER = { width: 1.35, height: 1.8, segU: 60, segV: 6, rise: 58°（ラジアン）, sag: -14°, fall: 0.32, lag: 0.55, gap: 0.012 }`
  - `restAngle(s: number): number`
  - `shapePage(out: Float32Array, p: number, offRight: number, offLeft: number, air: number, flutter: number): void` — 試作の `shapePage()` と同じ計算で、`(segU+1)*(segV+1)` 頂点の xyz を `out` に書く（three.js に依存しない）
  - `leafOffsets(i: number, leafCount: number): { offRight: number; offLeft: number; air: number }` — 試作の `(n - i + 1) * gap`、`(i + 2) * gap`、`(n + 2) * gap`

- [ ] **Step 1: テスト**
```ts
expect(restAngle(0)).toBeCloseTo(PAPER.rise);                    // 背表紙で立ち上がる
expect(restAngle(PAPER.width)).toBeLessThan(0);                  // 外側は垂れる
// 右に寝ている紙: 背の頂点は原点付近、外側の端は x > 0
// 左に寝ている紙（p = 1）: 右と鏡写し（x が反転、y は同じ）
// 重なり: 右の束で、上の紙（i 小）の各頂点は、下の紙（i 大）の同じ頂点より法線方向に gap 以上離れている
// めくり途中（p = 0.5）の紙は、右の束のいちばん上の紙より下に来る頂点がない（下のページに埋まらない）
```
（法線方向の距離は、隣り合う頂点から計算した単位法線への内積で測る。「埋まらない」は、同じ (i, j) の頂点について、めくり中の紙の高さ ≥ 束の紙の高さ を確かめる）
- [ ] **Step 2**: FAIL → **Step 3**: 試作から移植して実装 → **Step 4**: PASS
- [ ] **Step 5: コミット** `feat: 雑誌の紙の形（しなり・重なり）を純粋関数として追加`

---

### Task 4: 作品一覧のデータと API

**Files:**
- Create: `src/lib/rail.ts`, `src/lib/rail.test.ts`, `src/pages/api/rail.ts`
- Create: `src/lib/showcaseData.ts`（D1 から `ShowcaseCandidates` を作る）

**Interfaces:**
- Consumes: Task 1 の `thumbSrc`、Task 2 の型、計画 1 の `workPath`/`albumHref`/`displayTitle`/`formatPostedDate`/`altText`、既存の `loadImageAlbums`
- Produces:
  - `type RailItem = { id: string; thumb: string; title: string; date: string; tags: string[]; albumTitle: string | null; href: string; alt: string }`
  - `railHref(imageId: string, album: { slug: string; page: number } | null): string` — 2 ページ以上のアルバムに入っていれば `albumHref(slug) + '?page=' + page`、なければ `workPath(id)`
  - `loadRailPage(db, { cursor?: string; tag?: string; limit: number }): Promise<{ items: RailItem[]; nextCursor: string | null }>` — 新しい順。カーソルは `createdAt|id`
  - `GET /api/rail?cursor=&tag=` → `{ items, nextCursor }`（`limit` 40 固定、`Cache-Control: public, max-age=60`）
  - `loadShowcaseCandidates(db, { tag?: string }): Promise<ShowcaseCandidates>` — アルバムは 2 ページ以上のもの（タグ指定時はそのタグの画像を含むもの）、1 枚ものは 2 ページ以上のアルバムに入っていない画像。ページの `src` は公開用画像
- 補足: `loadImageAlbums` を、slug と並び順の位置（1 始まり）を返すように拡張する（`Map<string, { slug: string; page: number }>`）。既存の呼び出し側（フィード）は計画 2 で置き換わるので合わせて直す

- [ ] **Step 1: テスト**: `railHref('abc', null) === '/works/abc'`、`railHref('abc', { slug: 'アルバム-x', page: 3 }) === '/albums/%E3%82%A2%E3%83%AB%E3%83%90%E3%83%A0-x?page=3'`。カーソルの組み立て・分解（`encodeCursor`/`decodeCursor`）の往復と、不正なカーソルで null
- [ ] **Step 2**: FAIL → **Step 3**: 実装 → **Step 4**: PASS
- [ ] **Step 5: 確かめる**: `astro dev` で `/api/rail` → 新しい順、`nextCursor` で続きが取れ、最後は null。`?tag=<タグ>` で絞り込み。不正な `cursor` は 400
- [ ] **Step 6: コミット** `feat: 作品一覧の API と、雑誌に出す候補の取得を追加`

---

### Task 5: 作品一覧（レール）の表示

**Files:**
- Create: `src/components/Rail.astro`, `src/lib/railClient.ts`

**Interfaces:**
- Consumes: Task 4 の `RailItem`・`/api/rail`
- Produces: `<Rail items={RailItem[]} nextCursor={string | null} tag?={string} />`

- [ ] **Step 1: 表示**: PC（幅 769px 以上）は画面左の縦の列（幅 96px 程度）、スマホは画面上部の横の帯。サムネイルは正方形。各サムネイルは作品へのリンク（`href`）で、`alt` 付き
- [ ] **Step 2: 流れ**: `requestAnimationFrame` で一定速度で流し、内容を複製して切れ目なくループ。残りが少なくなったら `/api/rail` で読み足す。画面を埋めるのに足りない件数ならループせず並べるだけ。`prefers-reduced-motion` では自動で流さず、手でスクロールできる
- [ ] **Step 3: ホバー**（PC）: マウスが乗ると速度を指数的に 0 へ落とす（慣性で止まる）。乗っているサムネイルを 1.35 倍に拡大し、横にメタ情報のポップアップ（表示タイトル・投稿日・タグ・所属アルバム）を出して、上下にゆっくり漂わせる。離れると速度を戻す
- [ ] **Step 4: タッチ**（スマホ）: 1 回目のタップで流れを止め、拡大とポップアップ。2 回目のタップ（またはポップアップ内の「開く」）で作品へ移動。外側をタップで解除して流れを再開
- [ ] **Step 5: 確かめる**: `astro dev` のブラウザで PC 幅・375px 幅とも、流れる・止まる・拡大・ポップアップ・移動が動く。キーボードの Tab でサムネイルにフォーカスすると止まって拡大する
- [ ] **Step 6: コミット** `feat: 流れる作品一覧（レール）を追加`

---

### Task 6: 3D の雑誌（「見せる」ページめくり）とトップ・タグページの組み立て

**Files:**
- Create: `src/lib/magazine/scene.ts`（three.js）、`src/components/Showcase.astro`、`src/components/HomeLayout.astro`
- Modify: `src/pages/index.astro`、`src/pages/tags/[slug].astro`、`package.json`（`three`・`@types/three` 0.187）

**Interfaces:**
- Consumes: Task 2〜5 のすべて
- Produces:
  - `createShowcaseScene(canvas: HTMLCanvasElement, opts: { pages: MagazinePage[]; reducedMotion: boolean; onState?: (s: { state: 'TURNING' | 'HOLDING' | 'RIFFLE'; page: number; total: number }) => void }): { dispose(): void }`
  - `<HomeLayout items nextCursor candidates fallback tag? />` — 左（上）にレール、残りに Showcase。トップとタグページの両方が使う

- [ ] **Step 1: シーン**: 試作と同じ構成（紙・表紙・ぼんやりした影・幾何学アニメーション・BokehPass・カメラ追従）を、Task 2・3 の関数を使って組む。紙面のテクスチャは試作の `paperTexture()` と同じく生成りの紙に余白付きで作品を描く（画像は `crossOrigin` 不要の同一オリジン）。色は CSS 変数から読む
- [ ] **Step 2: 表示の切り替え**: HTML には `defaultShowcase` の最初の見開きを平面の画像として出しておき、three.js の準備ができたらキャンバスに切り替える。ブラウザ側で `pickShowcase(candidates, Math.random)` を選び直す。WebGL が無ければ平面のまま
- [ ] **Step 3: 計器風パネル**: `NOW OPEN`（タイトル・ページ数）、状態ラベル（`onState` の state）、`AUTO TURN ・ 02 / 06`。雑誌を押すと、開いている作品（アルバムなら今のページ、仮の雑誌なら右ページの作品）へ移動（`railHref` と同じ規則）
- [ ] **Step 4: トップとタグページ**: `index.astro` はフィードのグリッドとページ送りをやめ、`HomeLayout` を使う（候補と最初の 40 件はサーバーで取得）。`tags/[slug].astro` は同じく、タグで絞った候補と一覧を渡す。0 件なら「まだ作品がありません」の空表示
- [ ] **Step 5: 確かめる**（`astro dev`、ブラウザ）
  - PC 幅・375px 幅で、雑誌がめくれ、右ページの重心が中央に来る。めくっているページが下のページに埋まらない
  - 作品 1 件だけのとき 1 枚の紙が浮かぶ。0 件で空表示
  - `prefers-reduced-motion: reduce` をエミュレートすると自動めくり・漂い・回転・レールの自動の流れが止まる
  - WebGL を無効化（`--disable-webgl` 相当、または `getContext` を null にする）すると平面表示になり、リンクは使える
  - 管理画面・アルバム一覧・作品ページの読み込みに three.js のチャンクが含まれない（ビルドの出力と、各ページの `<script>` を確認）
  - タブを切り替えると描画が止まる（`document.hidden` で rAF を止める）
- [ ] **Step 6**: `npm test` → PASS、`npx astro check` → 0 errors、`npx astro build` 成功
- [ ] **Step 7: コミット** `feat: トップとタグページを、流れる作品一覧と空中の雑誌に作り替える`
