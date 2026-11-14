import { COMPRESS, THUMB, imageKeys, shouldCompress } from './imageFiles';
import { createThumbnail } from './thumbnails';

export interface StoredImage {
  /** 公開用（圧縮済み）のキー */
  r2Key: string;
  /** フルサイズの元画像のキー */
  originalR2Key: string;
  /** 作品一覧用の小さい画像のキー（作れなかったら null） */
  thumbR2Key: string | null;
  width: number | null;
  height: number | null;
}

interface Size {
  width: number | null;
  height: number | null;
}

// Workers のメモリは 128MB しかないので、大きな画像を arrayBuffer() や Blob で何度も複製しない。
// File はそのまま R2 に渡し、Images には stream() で流す。

async function measure(images: ImagesBinding, stream: ReadableStream<Uint8Array>): Promise<Size> {
  try {
    const info = await images.info(stream);
    return 'width' in info ? { width: info.width, height: info.height } : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}

async function compress(images: ImagesBinding, file: File, size: Size): Promise<ArrayBuffer> {
  let transformer = images.input(file.stream());
  // 長辺が上限を超えるときだけ縮小する（拡大はしない。開発環境では scale-down が効かないことがあるため自前で判定する）
  if (size.width === null || size.height === null) {
    transformer = transformer.transform({ width: COMPRESS.maxEdge, height: COMPRESS.maxEdge, fit: 'scale-down' });
  } else if (Math.max(size.width, size.height) > COMPRESS.maxEdge) {
    // 長辺だけを指定して縦横比を保つ
    transformer = transformer.transform(size.width >= size.height ? { width: COMPRESS.maxEdge } : { height: COMPRESS.maxEdge });
  }
  const result = await transformer.output({ format: COMPRESS.format, quality: COMPRESS.quality });
  return result.response().arrayBuffer();
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
  const { originalKey, displayKey, thumbKey } = imageKeys(id, file.name, now);
  const meta = { httpMetadata: { contentType: file.type } };

  await bucket.put(originalKey, file, meta);
  const originalSize = await measure(images, file.stream());

  if (shouldCompress(file.type)) {
    try {
      const compressed = await compress(images, file, originalSize);
      if (compressed.byteLength < file.size) {
        await bucket.put(displayKey, compressed, { httpMetadata: { contentType: COMPRESS.format } });
        const displaySize = await measure(images, new Blob([compressed]).stream());
        return {
          r2Key: displayKey,
          originalR2Key: originalKey,
          thumbR2Key: await storeThumbnail(bucket, images, thumbKey, compressed, displaySize),
          ...displaySize,
        };
      }
    } catch (e) {
      console.error('画像の圧縮に失敗したので元画像を公開用にする', e);
    }
  }

  const fallbackKey = originalKey.replace(/^originals\//, 'images/');
  await bucket.put(fallbackKey, file, meta);
  // GIF はアニメーションが消えるので、サムネイルも作らず元のまま使う
  const thumbR2Key = file.type === 'image/gif' ? null : await storeThumbnail(bucket, images, thumbKey, file.stream(), originalSize);
  return { r2Key: fallbackKey, originalR2Key: originalKey, thumbR2Key, ...originalSize };
}

/** サムネイルを作って保存し、キーを返す。作れなければ null */
export async function storeThumbnail(
  bucket: R2Bucket,
  images: ImagesBinding,
  thumbKey: string,
  source: ReadableStream<Uint8Array> | ArrayBuffer,
  size: Size,
): Promise<string | null> {
  const bytes = await createThumbnail(images, source, size);
  if (!bytes) return null;
  await bucket.put(thumbKey, bytes, { httpMetadata: { contentType: THUMB.format } });
  return thumbKey;
}
