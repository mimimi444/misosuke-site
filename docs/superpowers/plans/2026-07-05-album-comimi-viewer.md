# アルバム漫画ビューワー 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アルバムページにcomimiを使った全画面漫画ビューワーをオーバーレイで追加する

**Architecture:** 既存のサムネイルグリッドは維持したまま「読む」ボタンを追加し、クリックで`position:fixed`オーバーレイを開いてcomimi初期化。Astroのサーバーサイドで生成したR2 URLを`<script type="application/json">`で渡し、バンドルされた`<script>`でcomimiを初期化する。

**Tech Stack:** `@yui540/comimi` 0.17.0, Astro 6 (SSR), Cloudflare Workers, バニラTS

---

## ファイル構成

| ファイル | 変更 |
|---|---|
| `package.json` | `@yui540/comimi` を追加 |
| `src/pages/albums/[slug].astro` | ヘッダー行・オーバーレイHTML・CSSスタイル・初期化スクリプトを追加 |

---

## Task 1: comimiをインストール

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: インストール実行**

```bash
cd /Users/mizuki/web/misosuke-site
npm install @yui540/comimi
```

期待出力: `added 1 package` 系のメッセージ、エラーなし

- [ ] **Step 2: インストール確認**

```bash
node -e "import('@yui540/comimi').then(m => console.log(Object.keys(m)))"
```

期待出力: `[ 'createMangaViewer' ]`（またはそれを含む配列）

- [ ] **Step 3: コミット**

```bash
git add package.json package-lock.json
git commit -m "feat: @yui540/comimi をインストール"
```

---

## Task 2: アルバムページのHTML・CSS・スクリプトを追加

**Files:**
- Modify: `src/pages/albums/[slug].astro`

### 変更内容の全体像

現在の `[slug].astro` を以下の構造に変更する。

**追加する要素:**
1. フロントマターで `pagesJson` を計算
2. アルバムヘッダー行（タイトル + 「読む」ボタン）
3. `<script type="application/json" id="viewer-pages">` でページデータを埋め込む
4. 全画面オーバーレイ div
5. `<style>` にオーバーレイ用CSSを追加
6. `<script>` でcomimi初期化

- [ ] **Step 1: `[slug].astro` のフロントマターを更新**

現在の `---` ブロック末尾（`function parseTagList` の後、2つ目の `---` の前）に以下を追加：

```astro
const pagesJson = JSON.stringify(
  imageRows.map(img => ({ id: String(img.id), src: r2Url(img.r2Key) }))
);
```

完成後のフロントマター末尾（`---` の直前）：
```ts
function parseTagList(tagList: string | null): string[] {
  if (!tagList) return [];
  return tagList.split(',').filter(Boolean);
}

const pagesJson = JSON.stringify(
  imageRows.map(img => ({ id: String(img.id), src: r2Url(img.r2Key) }))
);
```

- [ ] **Step 2: テンプレート部分を差し替え**

現在の `<BaseLayout title={album?.title ?? 'アルバム'}>` ブロック内を以下に差し替える。

> **注:** ページデータの受け渡しはdata属性を使う。`set:html` だとJSON内の `<` `>` が壊れる可能性があるため、Astroが自動エスケープする属性値で安全に渡す。

```astro
<BaseLayout title={album?.title ?? 'アルバム'}>
  {album ? (
    <>
      <div class="album-content">
        {/* ヘッダー行: タイトル + 「読む」ボタン */}
        <div class="album-header-row">
          <h1 class="album-title">{album.title}</h1>
          {imageRows.length > 0 && (
            <button id="openViewerBtn" class="btn btn-primary">読む</button>
          )}
        </div>

        {imageRows.length === 0 ? (
          <div class="empty-state" style="padding:4rem 0; text-align:center; color:var(--text-muted)">
            このアルバムにはまだ画像がありません。
          </div>
        ) : (
          <div class="image-grid">
            {imageRows.map((img, i) => {
              const tagList = parseTagList(img.tagList);
              return (
                <div class="image-card animate-in" style={`animation-delay:${i * 0.03}s`}>
                  <img src={r2Url(img.r2Key)} alt={img.title ?? ''} loading={i < 6 ? 'eager' : 'lazy'} />
                  <div class="image-card-overlay">
                    {img.title && <span class="image-card-title">{img.title}</span>}
                    {tagList.length > 0 && (
                      <div class="image-card-tags">
                        {tagList.map(t => (
                          <a href={`/tags/${t.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`} class="tag-pill">{t}</a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 全画面ビューワーオーバーレイ（data属性でページデータ・メタデータを渡す） */}
      <div
        id="viewerOverlay"
        class="viewer-overlay"
        data-album-slug={album.slug}
        data-album-title={album.title ?? ''}
        data-pages={pagesJson}
        hidden
      >
        <button id="closeViewerBtn" class="btn btn-ghost viewer-close" aria-label="閉じる">✕</button>
        <div id="viewerContainer" class="viewer-container"></div>
      </div>
    </>
  ) : (
    <div style="padding:4rem; text-align:center; color:var(--text-muted)">
      アルバムが見つかりません。
    </div>
  )}
</BaseLayout>
```

- [ ] **Step 3: `<style>` ブロックを更新**

既存の `<style>` ブロックに以下を追記する（`.back-link:hover` 等の後ろ）：

```css
  .album-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }

  .album-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text);
  }

  .viewer-overlay {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .viewer-overlay[hidden] { display: none; }

  .viewer-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1001;
  }

  .viewer-container {
    flex: 1;
    overflow: hidden;
  }
```

- [ ] **Step 4: `<script>` ブロックを追加**

`</style>` の直後に以下を追加する：

```astro
<script>
  import { createMangaViewer } from '@yui540/comimi';

  const overlay = document.getElementById('viewerOverlay') as HTMLDivElement | null;
  const openBtn = document.getElementById('openViewerBtn');
  const closeBtn = document.getElementById('closeViewerBtn');
  const container = document.getElementById('viewerContainer');

  if (!overlay || !openBtn || !closeBtn || !container) {
    // 画像なしの場合はボタンが存在しないので何もしない
  } else {
    const albumSlug = overlay.dataset.albumSlug ?? '';
    const albumTitle = overlay.dataset.albumTitle ?? '';
    const pages: Array<{ id: string; src: string }> = JSON.parse(overlay.dataset.pages ?? '[]');

    let viewer: ReturnType<typeof createMangaViewer> | null = null;

    openBtn.addEventListener('click', () => {
      overlay.hidden = false;
      viewer = createMangaViewer(container, {
        manga: {
          id: albumSlug,
          title: albumTitle,
          pages: pages.map(p => ({
            id: p.id,
            type: 'image' as const,
            src: p.src,
          })),
        },
        locale: 'ja',
        settings: {
          readingDirection: 'rtl',
          pageTurnMode: 'single',
          layoutMode: 'inline',
          backgroundColor: 'black',
        },
        storage: { enabled: true },
      });
    });

    function closeViewer() {
      if (viewer) { viewer.destroy(); viewer = null; }
      overlay!.hidden = true;
    }

    closeBtn.addEventListener('click', closeViewer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay!.hidden) closeViewer();
    });
  }
</script>
```

- [ ] **Step 5: TypeScript ビルドエラーがないか確認**

```bash
cd /Users/mizuki/web/misosuke-site
npx astro check
```

期待出力: エラー0件（警告は許容）

- [ ] **Step 6: コミット**

```bash
git add src/pages/albums/[slug].astro
git commit -m "feat: アルバムページにcomimiビューワーを追加"
```

---

## Task 3: 動作確認

**Files:** なし（確認のみ）

- [ ] **Step 1: ローカルdev起動**

```bash
cd /Users/mizuki/web/misosuke-site
npm run dev
```

別ターミナルまたはブラウザで `http://localhost:4321/albums/<任意のslug>` を開く。

- [ ] **Step 2: 動作確認チェックリスト**

以下を順番に確認する：

1. アルバムページに「読む」ボタンが表示される
2. 「読む」ボタンをクリックするとcomimiビューワーが全画面で開く
3. 矢印キー / Spaceでページがめくれる
4. ✕ボタンでビューワーが閉じてグリッドに戻る
5. Escキーでビューワーが閉じる
6. 2回目に「読む」を押すと前回の読了位置から再開する（IndexedDB記憶）
7. 画像が0枚のアルバムでは「読む」ボタンが表示されない
