# 雑誌 UI リデザイン 計画 3/3: 作品詳細 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 作品一覧や雑誌から作品を開くと、ページを読み込み直さずに同じ画面のまま「読む」モードの作品詳細に切り替わり、URL が作品ごとに変わる。詳細では雑誌が正面を向いて平らになり、絵を本来の色と形で見せる。旧ビューワー（comimi）・旧ライトボックス・平面版の作品ページを置き換える。

**Architecture:** 詳細の状態（どの作品の何ページ目か）は URL で表し、`/albums/<slug>?page=<n>` と `/works/<ID>` はサーバー側でもトップと同じ構成（HomeLayout）に詳細を開いた状態で返す。ブラウザ側では作品一覧・雑誌・タグ・アルバム一覧のリンクを横取りし、`history.pushState` と `/api/detail` で詳細に切り替える。3D のシーンに「見せる」と「読む」の 2 つのモードを持たせ、カメラの移動・ページ送り・ズームを純粋関数で計算する。

**Tech Stack:** Astro 6（Cloudflare）、three.js 0.187、D1/Drizzle、vitest

**Spec:** `docs/superpowers/specs/2026-11-08-magazine-ui-design.md`（「作品詳細」「ページと画像の対応」「他の画面」「制約・品質」）

## Global Constraints

- 詳細では、カメラが斜めの寄りの位置から紙面の正面へ回り込む。表示中のページは平らにし、絵に照明の色の変化とピントのぼけを掛けない（本来の色と形）
- 雑誌らしさは、めくるときの紙のしなりと紙面の余白・縁で残す。漂いと手持ちの揺れは詳細中は止める
- パネル類は存在感を最小限にし、絵には重ねない（絵の外側の余白だけに置く）。ズーム中はパネルを隠す
- 詳細に出す情報: タイトル（無ければ「無題」）、作品説明、タグ（タグページへのリンク）、投稿日。アルバムならアルバムのタイトル・説明と「今のページ / 全ページ」
- 紙 1 枚に絵 1 枚。裏は同じ絵の透け（左右反転・薄く）。最初の見開きの左は表紙の内側
- URL: アルバムは `/albums/<slug>`、特定のページは `?page=<n>`（1 始まり）。1 枚もの（と 1 ページだけのアルバムの画像）は `/works/<画像ID>`。`/works/<ID>` はすべての画像で有効（アルバム内の画像なら、その 1 枚を紙として表示し所属アルバムへのリンクを添える）
- 開いた元の一覧に閉じる: トップから開いたら `/`、タグページから開いたら `/tags/<slug>`、URL を直接開いた人は `/`。履歴があれば「戻る」と同じ、なければ `history.replaceState`
- 操作: ←→ キー、紙面の左右端のクリック・タップ、スマホのスワイプでページ送り。ダブルクリック／ダブルタップ・ピンチ・Ctrl+ホイールでズーム、ズーム中はドラッグで移動。Esc・✕・ブラウザの戻るで閉じる
- 作品の URL を直接開いたとき、タイトル・説明・タグ・画像の `alt` が HTML に含まれる（JavaScript 実行前でも内容が分かる）
- WebGL が使えなければ、詳細は平面表示（絵と情報）。`prefers-reduced-motion` ではカメラの移動やめくりのアニメーションを省き、切り替えるだけにする
- 古い形式のアルバム slug の 301 リダイレクトは維持する
- 色はトークンから（一貫性テストを通す）

## Review Focus

1. **戻る・進むを繰り返す、詳細の中でページを送ってから戻る** → URL・表示・パネルが常に一致し、二重に開いたり閉じられなくなったりしない（Task 5 Step 6）
2. **詳細の URL を直接開く・再読み込みする・共有されたリンクから来る** → 同じ状態で開き、閉じるとトップへ（Task 5 Step 6）
3. **極端に縦長・横長の絵** → 画面内に収まり、パネルと重ならない（Task 2 のテスト）
4. **キーボードだけで操作する** → 詳細を開くとフォーカスが詳細に移り、Tab が詳細の中で循環し、閉じると開いた元のリンクに戻る（Task 4 Step 5）
5. **スマホでのピンチやスワイプがページ全体のスクロールやブラウザのズームと衝突する** → 詳細の上では詳細の操作だけが効く（Task 4 Step 5）

---

### Task 1: 詳細の URL と、詳細データの取得

**Files:**
- Create: `src/lib/detail.ts`, `src/lib/detail.test.ts`, `src/lib/detailData.ts`, `src/pages/api/detail.ts`

**Interfaces:**
- Produces:
  - `type DetailTarget = { kind: 'album'; slug: string; page: number | null } | { kind: 'work'; id: string }`
  - `parseDetailPath(pathname: string, search: string): DetailTarget | null` — `/albums/<slug>`（`?page`）・`/works/<id>` を解釈。それ以外は null
  - `detailPath(t: DetailTarget): string` — 逆変換（`albumHref`・`workPath` を使う）
  - `closeTarget(originPath: string | null): string` — 開いた元が `/` か `/tags/<slug>` ならそれ、それ以外・null なら `/`
  - `type DetailData = { kind: 'album' | 'work'; title: string; description: string | null; date: string; tags: string[]; album: { title: string; slug: string } | null; pages: (MagazinePage & { title: string; description: string | null; date: string; tags: string[]; alt: string; width: number | null; height: number | null })[]; startIndex: number }`
  - `loadDetail(db, t: DetailTarget): Promise<DetailData | null>`（`detailData.ts`）— アルバムは全ページ（雑誌の 12 ページ上限は詳細には掛けない）、1 ページだけのアルバムは null を返さず 1 枚として返す
  - `GET /api/detail?path=<pathname+search>` → `DetailData` または 404

- [ ] **Step 1: テスト**（`detail.test.ts`）: `parseDetailPath('/albums/%E3%81%82-abc123', '?page=3')` → `{ kind: 'album', slug: 'あ-abc123', page: 3 }`、`?page=x` は `page: null`、`/works/abc` → work、`/`・`/tags/x`・`/albums`・`/works/` は null、`detailPath` との往復、`closeTarget('/tags/%E6%98%A5')` はそのまま、`closeTarget('/albums/x')` と `closeTarget(null)` は `/`
- [ ] **Step 2**: FAIL → **Step 3**: 実装 → PASS
- [ ] **Step 4**: `loadDetail` と API を実装。`astro dev` で `/api/detail?path=/albums/<実在>?page=2` → `startIndex: 1`、`/works/<実在>`、存在しないものは 404、`path` が無い・不正は 400
- [ ] **Step 5: コミット** `feat: 作品詳細の URL の解釈と、詳細データの API を追加`

---

### Task 2: 「読む」モードの構図・ページ送り・ズームの計算（純粋関数）

**Files:**
- Create: `src/lib/magazine/reading.ts`, `src/lib/magazine/reading.test.ts`

**Interfaces:**
- Produces:
  - `type Insets = { top: number; right: number; bottom: number; left: number }`（px。パネルの領域）
  - `fitDistance(opts: { pageW: number; pageH: number; fovV: number; aspect: number; viewW: number; viewH: number; insets: Insets; margin: number }): number` — 正面から見た 1 ページ（紙面）が、インセットを除いた領域に余白付きで丁度収まるカメラ距離
  - `imageRect(img: { width: number; height: number }, box: { width: number; height: number }): { x: number; y: number; width: number; height: number }` — 紙面の余白の中に本来の縦横比で収めた絵の位置（テクスチャ描画と当たり判定で共用）
  - `type Zoom = { scale: number; x: number; y: number }`、`clampZoom(z: Zoom, bounds: { viewW: number; viewH: number; contentW: number; contentH: number }): Zoom` — 倍率 1〜4、絵が画面外へ逃げない範囲に移動量を収める
  - `nextPageIndex(current: number, delta: 1 | -1, count: number): number` — 範囲内で止まる（ループしない）
  - `edgeAction(x: number, viewW: number): 'prev' | 'next' | null` — 紙面の左 22%・右 22% のクリックでページ送り（右開きに合わせ、右端＝次）

- [ ] **Step 1: テスト**: 縦長（1000×4000）・横長（4000×1000）・正方形で、`imageRect` が箱に収まり縦横比を保つ。`fitDistance` が、インセットを大きくすると距離が伸びる（＝紙面が小さくなりパネルに重ならない）。`clampZoom` が倍率 0.5→1、9→4 に収め、倍率 1 では移動量 0。`nextPageIndex(0,-1,3)===0`、`(2,1,3)===2`。`edgeAction(10,1000)==='prev'`、`(990,1000)==='next'`、`(500,1000)===null`
- [ ] **Step 2**: FAIL → **Step 3**: 実装 → PASS
- [ ] **Step 4: コミット** `feat: 読むモードの構図・ズーム・ページ送りの計算を追加`

---

### Task 3: 3D シーンの「読む」モード

**Files:**
- Modify: `src/lib/magazine/scene.ts`

**Interfaces:**
- Consumes: Task 2 の関数、既存の `shapePage`・`buildLeaves`
- Produces（`createShowcaseScene` の戻り値に追加）:
  - `read(opts: { pages: MagazinePage[]; startIndex: number; insets: Insets }): Promise<void>` — 雑誌の中身を差し替え、カメラを正面へ移し（reduced-motion では即時）、`startIndex` の絵を右ページに開く
  - `show(): void` — 「見せる」モードに戻す（カメラを斜めの構図へ、めくり・漂いを再開）
  - `turn(delta: 1 | -1): void` — 紙のしなり付きで 1 枚めくる（約 0.7 秒、reduced-motion では即時）
  - `setZoom(z: Zoom): void`、`setInsets(i: Insets): void`
  - `onPage?: (index: number) => void`（めくり終わったとき）

- [ ] **Step 1**: 読むモードでは、表示中の見開きの紙を `shapePage` の p=0／1 で、しなり（`rise`/`sag`）を 0 にした平らな形にする（`shapePage` に `flatten: number`（0〜1）引数を足し、0 で従来どおり・1 で平ら。既存テストはそのまま通ること。平らのとき紙が水平になることをテストに追加）
- [ ] **Step 2**: 紙面の絵は照明の影響を受けない描き方にする（読むモードの紙は `MeshBasicMaterial`。見せるモードに戻ったら元の材質）。読むモードでは BokehPass を無効にする
- [ ] **Step 3**: カメラは、見せるモードの構図から、右ページの真上（紙面の法線方向）・`fitDistance` の距離へ、約 0.9 秒で補間して移る。漂い・手持ちの揺れ・幾何学アニメーションの回転を止める。ズームはカメラの距離と平行移動で表す
- [ ] **Step 4: 確かめる**（一時ページ不要。Task 5 で組み込むまでは `astro dev` のトップで、開発者ツールから `read`・`turn`・`show` を呼べるよう `window.__showcase` を dev のときだけ出す）: 正面から見て紙面の四隅が長方形（歪みなし）、絵の色が元画像と一致（スクリーンショットの画素を元画像と比べ、色差が小さい）、めくりにしなりがある、`show()` で元に戻る
- [ ] **Step 5: コミット** `feat: 3D の雑誌に「読む」モード（正面・平ら・本来の色）を追加`

---

### Task 4: 詳細パネルと操作

**Files:**
- Create: `src/components/DetailPanel.astro`, `src/lib/detailClient.ts`
- Modify: `src/components/HomeLayout.astro`

**Interfaces:**
- Consumes: Task 1 の `DetailData`・`closeTarget`、Task 2・3
- Produces: `openDetail(data: DetailData, opts: { push: boolean; originPath: string | null; returnFocus: HTMLElement | null })`、`closeDetail()`

- [ ] **Step 1: パネル**: PC は画面右の細い列（絵に重ならない幅を insets として scene に渡す）、スマホは画面下の帯（たためる）。タイトル・投稿日・説明（改行を保つ）・タグ（`a.chip`）・アルバム名とページ数（`03 / 12`）・✕。作品一覧（レール）は詳細中も表示したまま（押すと別の作品に切り替わる）
- [ ] **Step 2: 操作**: ←→ キー、`edgeAction` による左右端のクリック・タップ、横スワイプ（30px 以上）でページ送り。ダブルクリック／ダブルタップで 2 倍⇔1 倍、ピンチ・Ctrl+ホイールで拡大縮小、拡大中はドラッグで移動（`clampZoom`）。拡大中はパネルとレール以外の計器表示を隠し、倍率 1 に戻すと出す。詳細の上では `touch-action: none` でブラウザのスクロール・ズームと衝突させない
- [ ] **Step 3: 閉じる**: Esc・✕・ブラウザの戻る。閉じたらフォーカスを開いた元のリンクに戻す
- [ ] **Step 4: アクセシビリティ**: 詳細は `role="dialog"` `aria-modal="true"`・見出しにタイトル、開いたら見出しにフォーカス、Tab は詳細の中で循環、ページ送りの結果を `aria-live` で 1 回だけ知らせる（「3 / 12 ページ」）
- [ ] **Step 5: 確かめる**（ブラウザ）: キーボードだけで開く→送る→閉じる→元のリンクにフォーカス。スマホ幅でスワイプ・ピンチ・ダブルタップが効き、ページ全体がスクロールしたりズームしたりしない。極端に縦長・横長の絵がパネルに重ならない
- [ ] **Step 6: コミット** `feat: 作品詳細のパネルと操作を追加`

---

### Task 5: 画面遷移（URL・履歴・直接アクセス）と旧部品の置き換え

**Files:**
- Modify: `src/pages/albums/[slug].astro`、`src/pages/works/[id].astro`（どちらも HomeLayout ＋詳細を開いた状態に作り替える）、`src/components/HomeLayout.astro`、`src/components/Showcase.astro`、`src/lib/railClient.ts`、`src/lib/showcaseClient.ts`、`src/pages/albums/index.astro`
- Delete: `src/components/AlbumViewer.astro`、`src/lib/albumViewer.ts`、`src/components/Lightbox.astro`、`src/lib/lightbox.ts`、`package.json` の `@yui540/comimi`

- [ ] **Step 1: サーバー**: `/albums/<slug>` と `/works/<id>` は `loadDetail` の結果を HomeLayout に渡し、詳細を開いた状態の HTML を返す（タイトル・説明・タグ・`alt` を含む `<title>` と本文）。古い slug の 301 と、見つからないときの 404 は維持
- [ ] **Step 2: リンクの横取り**: 作品一覧・雑誌・アルバム一覧のカード・詳細内の「アルバムで見る」リンクのクリック（修飾キーなしの左クリック）で、`parseDetailPath` に当たるものは `history.pushState` ＋ `/api/detail` で詳細を開く。開いた元のパス（`/` や `/tags/<slug>`）を `history.state` に持つ。当たらないリンクは通常の遷移
- [ ] **Step 3: ページ送りと URL**: アルバムでページを送ったら `history.replaceState` で `?page=` を更新（履歴を増やさない）
- [ ] **Step 4: 戻る・進む**: `popstate` で URL を `parseDetailPath` し、詳細なら開く／切り替え、そうでなければ閉じて「見せる」モードへ。二重に開かない
- [ ] **Step 5: アルバム一覧**: カードを押すと、アルバム一覧ページから `/albums/<slug>` へ普通に遷移する（その先では詳細が開いた状態で表示され、閉じると `/`）。旧ビューワー・旧ライトボックスと comimi を削除
- [ ] **Step 6: 確かめる**（ブラウザ）
  - トップ → 作品一覧のサムネイル → 詳細（URL が変わる）→ →キーで送る（`?page` が変わる）→ 戻るで閉じてトップ（URL `/`）→ 進むで再び詳細
  - タグページから開いて ✕ → `/tags/<slug>` に戻る
  - 詳細の URL を直接開く・再読み込み → 同じ状態。✕ → `/`。JavaScript 無効で開いても、タイトル・説明・タグ・絵が読める
  - WebGL 無効で詳細が平面表示になり、送る・閉じるが使える
  - `prefers-reduced-motion` でカメラの移動・めくりのアニメーションなしに切り替わる
  - 存在しない作品・アルバム → 404、古い slug → 301
- [ ] **Step 7**: `npm test` → PASS、`npx astro check` → 0 errors、`npx astro build` 成功、comimi がビルド出力に含まれない
- [ ] **Step 8: コミット** `feat: 作品詳細を同じ画面で開き、URL・履歴・直接アクセスに対応する（旧ビューワーを置き換え）`
