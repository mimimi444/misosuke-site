import { defineMiddleware } from 'astro:middleware';
import { getActionContext } from 'astro:actions';
import { env } from 'cloudflare:workers';
import { isUnder, validAdminPath } from './lib/adminPath';
import { isLoggedIn } from './lib/adminSession';

// 管理画面のページは src/pages/[admin]/ にある。先頭の [admin] が秘密の ADMIN_PATH と
// 一致するときだけ通し、それ以外（/admin や当て推量の文字列）は存在しないものとして扱う。
const ADMIN_ROUTE_PREFIX = '/[admin]';
const LOGIN_ROUTE = '/[admin]/login';

function noStore(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequest = defineMiddleware(async (context, next) => {
  // アクションは /_actions/* だけでなく、任意のページへの `?_action=名前` 付き
  // フォーム POST からも呼べる。どちらもログイン済みでなければ拒否する。
  const { action } = getActionContext(context);
  if (action || isUnder(context.url.pathname, '/_actions')) {
    if (!(await isLoggedIn(context.cookies))) return noStore(401, 'Unauthorized');
    return next();
  }

  if (!isUnder(context.routePattern, ADMIN_ROUTE_PREFIX)) return next();

  const adminPath = validAdminPath(env.ADMIN_PATH);
  if (!adminPath || context.params.admin !== adminPath) return noStore(404, 'Not Found');

  // ログインページだけはログイン前でも見られる
  if (context.routePattern !== LOGIN_ROUTE && !(await isLoggedIn(context.cookies))) {
    return context.redirect(`/${adminPath}/login`, 303);
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
