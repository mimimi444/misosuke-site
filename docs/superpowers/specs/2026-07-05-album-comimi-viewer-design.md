# アルバム漫画ビューワー設計書

**日付:** 2026-07-05  
**対象:** `/albums/[slug].astro`  
**スコープ外:** フィードページ・その他のページは変更しない

---

## 概要

アルバムページに `@yui540/comimi` を使った漫画ビューワーを追加する。既存のサムネイルグリッドは残し、「読む」ボタンで全画面オーバーレイのビューワーを起動する。

---

## ユーザー体験

1. `/albums/[slug]` を開く → 既存のサムネイルグリッドが表示される
2. 「読む」ボタンをクリック → 全画面オーバーレイが開き、comimi ビューワーが起動
3. キーボード（矢印キー / Space）またはUIでページをめくる
4. オーバーレイ右上の ✕ ボタン、またはEscキー → ビューワーを閉じてグリッドに戻る

---

## アーキテクチャ

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/pages/albums/[slug].astro` | 「読む」ボタン追加・モーダルHTML追加・comimi初期化スクリプト追加 |
| `package.json` | `@yui540/comimi` を追加 |

### データフロー

```
サーバーサイド（Astro）
  ↓ R2URLの配列をJSONとして<script>に埋め込む
クライアントサイド（バニラJS）
  ↓ 「読む」ボタンクリック
  ↓ createMangaViewer(container, options) で初期化
  ↓ ページ操作（comimi内部）
  ↓ ✕ / Esc → viewer.destroy() → モーダルを非表示
```

---

## 実装詳細

### ボタン配置

「読む」ボタンはアルバムタイトル行の右端（ヘッダー行）に配置する。

### モーダルHTML構造

```html
<!-- アルバムヘッダー行（タイトル右端に配置） -->
<div class="album-header-row">
  <h1 class="album-title">{album.title}</h1>
  <button id="openViewerBtn" class="btn btn-primary">読む</button>
</div>

<!-- 全画面オーバーレイ -->
<div id="viewerOverlay" class="viewer-overlay" hidden>
  <button id="closeViewerBtn" class="viewer-close" aria-label="閉じる">✕</button>
  <div id="viewerContainer" class="viewer-container"></div>
</div>
```

### スタイル

```css
.viewer-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.viewer-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1001;
  /* 既存のbtnスタイルを使用 */
}

.viewer-container {
  flex: 1;
  overflow: hidden;
}
```

### comimi 設定

```ts
createMangaViewer(container, {
  manga: {
    id: albumSlug,          // アルバムslugをIDに使用
    title: albumTitle,
    pages: imageRows.map((img, i) => ({
      id: String(img.id),
      type: 'image',
      src: r2Url(img.r2Key),
    })),
  },
  locale: 'ja',
  settings: {
    readingDirection: 'rtl',   // 右→左（漫画標準）
    pageTurnMode: 'single',    // 1ページ表示（設定UIで変更可）
    layoutMode: 'inline',      // モーダル内に収める
    backgroundColor: 'black',
  },
  storage: {
    enabled: true,             // IndexedDBで読了位置を記憶
  },
})
```

### 画像データの受け渡し

Astroのサーバーサイドで生成したURLをインライン `<script>` に埋め込む：

```astro
<script define:vars={{ pages: imageRows.map(img => ({ id: String(img.id), src: r2Url(img.r2Key) })), albumSlug: album.slug, albumTitle: album.title }}>
  // comimi初期化スクリプト
</script>
```

### 開閉ロジック

```ts
let viewer = null;

openBtn.addEventListener('click', () => {
  overlay.hidden = false;
  viewer = createMangaViewer(container, options);
});

function closeViewer() {
  if (viewer) { viewer.destroy(); viewer = null; }
  overlay.hidden = true;
}

closeBtn.addEventListener('click', closeViewer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) closeViewer();
});
```

---

## 非機能要件

- comimi は `@yui540/comimi` npm パッケージとして追加（CDNは使わない）
- React は使わない（バニラJS）
- 既存のグリッドレイアウト・CSS は変更しない
- フィードページは一切変更しない

---

## スコープ外（将来の課題）

- フィードのライトボックス
- タグページ・その他ページへのビューワー導入
