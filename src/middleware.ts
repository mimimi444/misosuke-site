import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyBasicAuth } from './lib/auth';

/** 管理画面と、フォームが POST する Astro Actions のエンドポイント */
const PROTECTED_PREFIXES = ['/admin', '/_actions'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isProtected(context.url.pathname)) return next();

  const authorized = await verifyBasicAuth(
    context.request.headers.get('authorization'),
    env.ADMIN_USER,
    env.ADMIN_PASSWORD,
  );

  if (!authorized) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="JJJ Admin", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    });
  }

  return next();
});
