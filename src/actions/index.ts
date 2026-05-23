import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { getDb } from '../db/client';
import { images, tags, imageTags, albums, albumImages } from '../db/schema';
import { nanoid } from 'nanoid';
import { eq, inArray } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const server = {
  uploadImage: defineAction({
    accept: 'form',
    input: z.object({
      file: z.instanceof(File),
      title: z.string().optional(),
      description: z.string().optional(),
      tagNames: z.string().optional(),
    }),
    handler: async (input) => {
      const { DB, BUCKET } = env;
      const db = getDb(DB);

      const id = nanoid();
      const ext = input.file.name.split('.').pop() ?? 'jpg';
      const now = new Date();
      const r2Key = `images/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${id}.${ext}`;

      await BUCKET.put(r2Key, await input.file.arrayBuffer(), {
        httpMetadata: { contentType: input.file.type },
      });

      await db.insert(images).values({
        id,
        title: input.title || null,
        description: input.description || null,
        r2Key,
        createdAt: now.toISOString(),
      });

      if (input.tagNames) {
        const names = input.tagNames.split(',').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
          const tagId = nanoid();
          await db.insert(tags).values({ id: tagId, name, slug }).onConflictDoNothing();
          const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
          if (tag) {
            await db.insert(imageTags).values({ imageId: id, tagId: tag.id }).onConflictDoNothing();
          }
        }
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

      await BUCKET.delete(image.r2Key);
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
        const names = input.tagNames.split(',').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
          const tagId = nanoid();
          await db.insert(tags).values({ id: tagId, name, slug }).onConflictDoNothing();
          const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
          if (tag) {
            await db.insert(imageTags).values({ imageId: input.id, tagId: tag.id }).onConflictDoNothing();
          }
        }
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
      const slug = input.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + id.slice(0, 6);

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
