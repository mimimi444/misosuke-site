import { THUMB } from './imageFiles';

/**
 * 作品一覧用の小さい画像（長辺 400px の WebP）を作る。失敗したら null（一覧では公開用画像で代用する）。
 * 長辺が上限を超えるときだけ縮小する（開発環境の Images では scale-down が効かないことがあるため自前で判定）。
 */
export async function createThumbnail(
  images: ImagesBinding,
  source: ReadableStream<Uint8Array> | ArrayBuffer,
  size: { width: number | null; height: number | null },
): Promise<ArrayBuffer | null> {
  try {
    const stream = source instanceof ArrayBuffer ? new Blob([source]).stream() : source;
    let transformer = images.input(stream);
    const { width, height } = size;
    if (width === null || height === null) {
      transformer = transformer.transform({ width: THUMB.maxEdge, height: THUMB.maxEdge, fit: 'scale-down' });
    } else if (Math.max(width, height) > THUMB.maxEdge) {
      transformer = transformer.transform(width >= height ? { width: THUMB.maxEdge } : { height: THUMB.maxEdge });
    }
    const result = await transformer.output({ format: THUMB.format, quality: THUMB.quality });
    return await result.response().arrayBuffer();
  } catch (e) {
    console.error('サムネイルを作れなかった', e);
    return null;
  }
}
