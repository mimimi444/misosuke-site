import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../db/client';
import { decodeCursor, loadRailPage } from '../../lib/rail';
import { tagSlug } from '../../lib/tags';

/** 作品一覧（レール）の続き。?cursor=<前回の nextCursor>&tag=<タグ名または slug> */
export const RAIL_PAGE_SIZE = 40;

export const GET: APIRoute = async ({ url }) => {
  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return new Response('Bad cursor', { status: 400 });
  const tag = url.searchParams.get('tag');

  const page = await loadRailPage(getDb(env.DB), {
    cursor,
    tagSlug: tag ? tagSlug(tag) : undefined,
    limit: RAIL_PAGE_SIZE,
  });
  return Response.json(page, { headers: { 'Cache-Control': 'public, max-age=60' } });
};
