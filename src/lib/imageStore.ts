import { COMPRESS, imageKeys, shouldCompress } from './imageFiles';

export interface StoredImage {
  /** 公開用（圧縮済み）のキー */
  r2Key: string;
  /** フルサイズの元画像のキー */
  originalR2Key: string;
  width: number | null;
  height: number | null;
}

async function compress(images: ImagesBinding, bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const { width, height } = await dimensions(images, bytes);
  let transformer = images.input(new Blob([bytes]).stream());
  // 長辺が上限を超えるときだけ縮小する（拡大はしない。開発環境では scale-down が効かないことがあるため自前で判定する）
  if (width === null || height === null) {
    transformer = transformer.transform({ width: COMPRESS.maxEdge, height: COMPRESS.maxEdge, fit: 'scale-down' });
  } else if (Math.max(width, height) > COMPRESS.maxEdge) {
    // 長辺だけを指定して縦横比を保つ
    transformer = transformer.transform(width >= height ? { width: COMPRESS.maxEdge } : { height: COMPRESS.maxEdge });
  }
  const result = await transformer.output({ format: COMPRESS.format, quality: COMPRESS.quality });
  return result.response().arrayBuffer();
}

async function dimensions(images: ImagesBinding, bytes: ArrayBuffer): Promise<{ width: number | null; height: number | null }> {
  try {
    const info = await images.info(new Blob([bytes]).stream());
    return 'width' in info ? { width: info.width, height: info.height } : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * 元画像をそのまま originals/ に保存し、公開用に圧縮したものを images/ に保存する。
 * 圧縮できない形式や、圧縮に失敗した・かえって大きくなった場合は、元画像の複製を公開用にする。
 */
export async function storeUploadedImage(params: {
  bucket: R2Bucket;
  images: ImagesBinding;
  id: string;
  file: File;
  now: Date;
}): Promise<StoredImage> {
  const { bucket, images, id, file, now } = params;
  const { originalKey, displayKey } = imageKeys(id, file.name, now);
  const original = await file.arrayBuffer();

  await bucket.put(originalKey, original, { httpMetadata: { contentType: file.type } });

  let display: { key: string; bytes: ArrayBuffer; type: string } | null = null;
  if (shouldCompress(file.type)) {
    try {
      const compressed = await compress(images, original);
      if (compressed.byteLength < original.byteLength) {
        display = { key: displayKey, bytes: compressed, type: COMPRESS.format };
      }
    } catch (e) {
      console.error('画像の圧縮に失敗したので元画像を公開用にする', e);
    }
  }
  display ??= { key: originalKey.replace(/^originals\//, 'images/'), bytes: original, type: file.type };

  await bucket.put(display.key, display.bytes, { httpMetadata: { contentType: display.type } });

  return { r2Key: display.key, originalR2Key: originalKey, ...(await dimensions(images, display.bytes)) };
}
