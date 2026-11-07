import { defineMiddleware } from 'astro:middleware';
import { getActionContext } from 'astro:actions';
import { env } from 'cloudflare:workers';
import { isUnder, toInternalAdminPath, validAdminPath } from './lib/adminPath';
import { isLoggedIn } from './lib/adminSession';

const LOGIN_PAGE = '/admin/login';

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  // 実体のパスへの直接アクセスは、存在しないものとして扱う
  if (isUnder(pathname, '/admin')) return notFound();

  // アクションは /_actions/* だけでなく、任意のページへの `?_action=名前` 付き
  // フォーム POST からも呼べる。どちらもログイン済みでなければ拒否する。
  const { action } = getActionContext(context);
  if (action || isUnder(pathname, '/_actions')) {
    if (!(await isLoggedIn(context.cookies))) {
      return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    return next();
  }

  const adminPath = validAdminPath(env.ADMIN_PATH);
  const internal = adminPath ? toInternalAdminPath(pathname, adminPath) : null;
  if (!internal) return next();

  // ログインページだけはログイン前でも見られる
  if (internal !== LOGIN_PAGE && !(await isLoggedIn(context.cookies))) {
    return context.redirect(`/${adminPath}/login`, 303);
  }

  const response = await next(internal + search);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
