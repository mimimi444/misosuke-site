import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(obj.body, { headers });
};
