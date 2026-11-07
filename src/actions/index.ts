import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { getDb } from '../db/client';
import { images, tags, imageTags, albums, albumImages } from '../db/schema';
import { nanoid } from 'nanoid';
import { eq, inArray } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { formBoolean } from '../lib/form';
import { clampPostText, composePostText, splitTagNames } from '../lib/social/compose';
import { publishImageToBluesky } from '../lib/social/publish';
import { storeUploadedImage } from '../lib/imageStore';
import { isAllowedUploadType } from '../lib/imageFiles';
import { tagSlug } from '../lib/tags';
import { albumSlug } from '../lib/albumSlug';

/**
 * カンマ区切りのタグ名を画像に結び付ける。タグがなければ作る。
 * slug は tagSlug() で作る（日本語のタグも別々の slug になる）。記号だけのタグ名は捨てる。
 */
async function attachTags(db: ReturnType<typeof getDb>, imageId: string, rawTagNames: string) {
  for (const name of splitTagNames(rawTagNames)) {
    const slug = tagSlug(name);
    if (!slug) continue;
    await db.insert(tags).values({ id: nanoid(), name, slug }).onConflictDoNothing();
    const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
    if (tag) await db.insert(imageTags).values({ imageId, tagId: tag.id }).onConflictDoNothing();
  }
}

export const server = {
  uploadImage: defineAction({
    accept: 'form',
    input: z.object({
      file: z.instanceof(File),
      title: z.string().optional(),
      description: z.string().optional(),
      tagNames: z.string().optional(),
      postToBluesky: formBoolean,
      attachImage: formBoolean,
      includeLink: formBoolean,
      postText: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { DB, BUCKET } = env;
      const db = getDb(DB);

      if (!isAllowedUploadType(input.file.type)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: `対応していない形式です: ${input.file.type || '不明'}` });
      }

      const id = nanoid();
      const now = new Date();
      // 元画像はそのまま保管し、公開用には圧縮したものを使う
      const stored = await storeUploadedImage({ bucket: BUCKET, images: env.IMAGES, id, file: input.file, now });

      await db.insert(images).values({
        id,
        title: input.title || null,
        description: input.description || null,
        r2Key: stored.r2Key,
        originalR2Key: stored.originalR2Key,
        width: stored.width,
        height: stored.height,
        createdAt: now.toISOString(),
      });

      if (input.tagNames) await attachTags(db, id, input.tagNames);

      if (input.postToBluesky) {
        const edited = input.postText?.trim();
        const text = edited
          ? clampPostText(edited)
          : composePostText({
              title: input.title,
              description: input.description,
              tagNames: splitTagNames(input.tagNames),
              url: input.includeLink ? context.site?.href ?? null : null,
            });
        // 投稿の完了は待たずに返す。失敗は bluesky_posts に記録される
        context.locals.cfContext.waitUntil(
          publishImageToBluesky({
            db,
            bucket: BUCKET,
            images: env.IMAGES,
            imageId: id,
            text,
            attachImage: input.attachImage,
            altText: input.title ?? '',
            env: {
              identifier: env.BLUESKY_IDENTIFIER ?? '',
              appPassword: env.BLUESKY_APP_PASSWORD ?? '',
            },
          }),
        );
      }

      return { id };
    },
  }),

  deleteImage: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input) => {
      const { DB, BUCKET } = env;
      const db = getDb(DB);

      const [image] = await db.select().from(images).where(eq(images.id, input.id));
      if (!image) throw new Error('Image not found');

      // 公開用と元画像（圧縮導入前の画像は同じキー）の両方を消す
      await BUCKET.delete([...new Set([image.r2Key, image.originalR2Key ?? image.r2Key])]);
      await db.delete(images).where(eq(images.id, input.id));
    },
  }),

  updateImage: defineAction({
    input: z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      tagNames: z.string().optional(),
    }),
    handler: async (input) => {
      const { DB } = env;
      const db = getDb(DB);

      await db.update(images).set({
        title: input.title ?? null,
        description: input.description ?? null,
      }).where(eq(images.id, input.id));

      if (input.tagNames !== undefined) {
        await db.delete(imageTags).where(eq(imageTags.imageId, input.id));
        await attachTags(db, input.id, input.tagNames);
      }
    },
  }),

  createAlbum: defineAction({
    input: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      imageIds: z.string().optional(),
      coverImageId: z.string().optional(),
    }),
    handler: async (input) => {
      const { DB } = env;
      const db = getDb(DB);

      const id = nanoid();
      const slug = albumSlug(input.title, id);

      await db.insert(albums).values({
        id,
        title: input.title,
        slug,
        description: input.description ?? null,
        coverImageId: input.coverImageId ?? null,
        createdAt: new Date().toISOString(),
      });

      if (input.imageIds) {
        const ids = input.imageIds.split(',').filter(Boolean);
        for (let i = 0; i < ids.length; i++) {
          await db.insert(albumImages).values({ albumId: id, imageId: ids[i]!, sortOrder: i }).onConflictDoNothing();
        }
      }

      return { id, slug };
    },
  }),

  deleteAlbum: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input) => {
      const { DB } = env;
      const db = getDb(DB);
      await db.delete(albums).where(eq(albums.id, input.id));
    },
  }),

  updateAlbum: defineAction({
    input: z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      coverImageId: z.string().optional(),
      imageIds: z.string().optional(),
    }),
    handler: async (input) => {
      const { DB } = env;
      const db = getDb(DB);

      const updates: Partial<typeof albums.$inferInsert> = {};
      if (input.title) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.coverImageId !== undefined) updates.coverImageId = input.coverImageId;

      if (Object.keys(updates).length > 0) {
        await db.update(albums).set(updates).where(eq(albums.id, input.id));
      }

      if (input.imageIds !== undefined) {
        await db.delete(albumImages).where(eq(albumImages.albumId, input.id));
        const ids = input.imageIds.split(',').filter(Boolean);
        for (let i = 0; i < ids.length; i++) {
          await db.insert(albumImages).values({ albumId: input.id, imageId: ids[i]!, sortOrder: i });
        }
      }
    },
  }),
};
