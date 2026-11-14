import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../db/client';
import { parseDetailPath } from '../../lib/detail';
import { loadDetail } from '../../lib/detailData';

/** 作品詳細のデータ。?path=<詳細の URL のパスと検索部分>（例: /albums/xxx?page=2） */
export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get('path');
  if (!raw || !raw.startsWith('/')) return new Response('Bad path', { status: 400 });
  const target = (() => {
    try {
      const u = new URL(raw, 'https://local.invalid');
      return parseDetailPath(u.pathname, u.search);
    } catch {
      return null;
    }
  })();
  if (!target) return new Response('Bad path', { status: 400 });

  const data = await loadDetail(getDb(env.DB), target);
  if (!data) return new Response('Not Found', { status: 404 });
  return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=60' } });
};
