// アップロード画像の保存先と配布に関する決まりごと（純粋関数）

/** 公開用に圧縮するときの設定 */
export const COMPRESS = { maxEdge: 2000, format: 'image/webp', quality: 80 } as const;

const ORIGINALS_PREFIX = 'originals/';

/** R2 のキー。元画像は originals/ に置き、公開 URL からは取得させない */
export function imageKeys(id: string, fileName: string, now: Date): { originalKey: string; displayKey: string } {
  const ym = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const rawExt = fileName.includes('.') ? fileName.split('.').pop()! : '';
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return {
    originalKey: `${ORIGINALS_PREFIX}${ym}/${id}.${ext}`,
    displayKey: `images/${ym}/${id}.webp`,
  };
}

/**
 * アップロードを受け付ける形式。SVG や HTML は自サイトのドメインで配るとスクリプトが動きうるので拒否する。
 */
export function isAllowedUploadType(mimeType: string): boolean {
  return /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(mimeType);
}

/** 圧縮してよい形式か。GIF はアニメーションが消え、SVG はベクターなので元のまま使う */
export function shouldCompress(mimeType: string): boolean {
  return /^image\/(jpeg|png|webp|avif|heic|heif)$/.test(mimeType);
}

/** 公開 URL（/api/images/...）で配ってよいキーか */
export function isPublicImageKey(key: string): boolean {
  if (key.split('/').some((seg) => seg === '..' || seg === '.')) return false;
  return !key.startsWith(ORIGINALS_PREFIX);
}

/** ダウンロード用の Content-Disposition。日本語のファイル名は filename* で渡す */
export function contentDisposition(title: string | null | undefined, id: string, originalKey: string): string {
  // 圧縮導入前の画像のキーは拡張子が未加工なので、ここでも英数字だけにする
  const ext = (originalKey.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = (title?.trim() || id).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  const encoded = encodeURIComponent(`${base}.${ext}`).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${id}.${ext}"; filename*=UTF-8''${encoded}`;
}
