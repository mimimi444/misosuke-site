import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { getDb } from '../../db/client';
import { blueskyPosts, images as imagesTable } from '../../db/schema';
import { createBlueskyAgent, createPost, uploadBlob } from '../bluesky';
import { withDeadline } from '../timeout';

type Db = ReturnType<typeof getDb>;

/** Bluesky の画像1枚あたりの上限 */
const MAX_IMAGE_BYTES = 1_000_000;
const RESIZE_WIDTH = 1200;
const QUALITY_FIRST = 85;
const QUALITY_RETRY = 60;
/**
 * waitUntil はレスポンス後およそ 30 秒で打ち切られ、そうなると catch も走らず pending のまま残る。
 * その前に自分で打ち切って failed を書く。
 */
const PUBLISH_DEADLINE_MS = 25_000;

export interface PublishParams {
  db: Db;
  bucket: R2Bucket;
  images: ImagesBinding;
  imageId: string;
  text: string;
  attachImage: boolean;
  altText: string;
  env: { identifier: string; appPassword: string };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function resizeToJpeg(images: ImagesBinding, original: ArrayBuffer, quality: number): Promise<Uint8Array> {
  const result = await images
    .input(new Blob([original]).stream())
    .transform({ width: RESIZE_WIDTH, fit: 'scale-down' })
    .output({ format: 'image/jpeg', quality });
  return new Uint8Array(await result.response().arrayBuffer());
}

/** R2 から読んで、1MB 以下の JPEG にする。できなければ理由つきで例外を投げる */
async function prepareImage(params: PublishParams): Promise<Uint8Array> {
  const [image] = await params.db.select().from(imagesTable).where(eq(imagesTable.id, params.imageId));
  if (!image) throw new Error('画像が見つからない');
  const obj = await params.bucket.get(image.r2Key);
  if (!obj) throw new Error('R2 にオブジェクトがない');
  // ストリームは一度しか読めないので、再試行に備えてバイト列にしておく
  const original = await obj.arrayBuffer();

  let bytes = await resizeToJpeg(params.images, original, QUALITY_FIRST);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    bytes = await resizeToJpeg(params.images, original, QUALITY_RETRY);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`リサイズ後も ${bytes.byteLength} バイトで 1MB を超える`);
  }
  return bytes;
}

/**
 * 画像を Bluesky に投稿し、結果を bluesky_posts に記録する。
 * waitUntil の中で呼ばれ、投げた例外は誰も拾えないので、決して reject しない。
 */
export async function publishImageToBluesky(params: PublishParams): Promise<void> {
  const { db } = params;
  const id = nanoid();
  const now = () => new Date().toISOString();

  try {
    const createdAt = now();
    await db.insert(blueskyPosts).values({
      id,
      imageId: params.imageId,
      status: 'pending',
      text: params.text,
      createdAt,
      updatedAt: createdAt,
    });
  } catch (e) {
    console.error('bluesky_posts に記録できなかった', e);
    return;
  }

  const finish = async (values: Partial<typeof blueskyPosts.$inferInsert>) => {
    try {
      await db.update(blueskyPosts).set({ ...values, updatedAt: now() }).where(eq(blueskyPosts.id, id));
    } catch (e) {
      console.error('bluesky_posts を更新できなかった', e);
    }
  };

  try {
    if (!params.env.identifier || !params.env.appPassword) {
      await finish({ status: 'failed', error: '認証情報が未設定' });
      return;
    }

    const { identifier, appPassword } = params.env;
    const post = await withDeadline(
      (async () => {
        const agent = await createBlueskyAgent(identifier, appPassword);

        let image: { blob: Awaited<ReturnType<typeof uploadBlob>>; alt: string } | undefined;
        let attachError: string | null = null;
        if (params.attachImage) {
          try {
            const bytes = await prepareImage(params);
            image = { blob: await uploadBlob(agent, bytes, 'image/jpeg'), alt: params.altText };
          } catch (e) {
            // 画像なしでも投稿自体は成功させる
            attachError = `画像の添付に失敗: ${errorMessage(e)}`;
          }
        }

        return { ...(await createPost(agent, { text: params.text, image })), attachError };
      })(),
      PUBLISH_DEADLINE_MS,
      `Bluesky への投稿が ${PUBLISH_DEADLINE_MS / 1000} 秒以内に終わらなかった`,
    );
    await finish({ status: 'success', postUri: post.uri, postCid: post.cid, error: post.attachError });
  } catch (e) {
    await finish({ status: 'failed', error: errorMessage(e) });
  }
}
