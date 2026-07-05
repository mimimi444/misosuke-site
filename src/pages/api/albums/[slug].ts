import type { APIRoute } from 'astro';
import { getDb } from '../../../db/client';
import { albums, albumImages, images } from '../../../db/schema';
import { eq, asc } from 'drizzle-orm';
import { r2Url } from '../../../lib/r2url';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  try {
    const db = getDb(env.DB);
    const [album] = await db.select().from(albums).where(eq(albums.slug, params.slug!));
    if (!album) return new Response('Not Found', { status: 404 });

    const rows = await db
      .select({ id: images.id, r2Key: images.r2Key })
      .from(albumImages)
      .innerJoin(images, eq(images.id, albumImages.imageId))
      .where(eq(albumImages.albumId, album.id))
      .orderBy(asc(albumImages.sortOrder));

    return new Response(JSON.stringify({
      id: String(album.id),
      title: album.title,
      slug: album.slug,
      pages: rows.map(img => ({ id: String(img.id), src: r2Url(img.r2Key) })),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
};
