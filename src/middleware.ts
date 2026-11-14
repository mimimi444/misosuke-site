import { defineMiddleware } from 'astro:middleware';
import { getActionContext } from 'astro:actions';
import { env } from 'cloudflare:workers';
import { isUnder, validAdminPath } from './lib/adminPath';
import { isLoggedIn } from './lib/adminSession';
import { SESSION_COOKIE } from './lib/session';

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

  if (!isUnder(context.routePattern, ADMIN_ROUTE_PREFIX)) {
    const response = await next();
    // ログイン中は公開ページにも管理画面へのリンク（秘密の URL）が入るので、共有キャッシュに載せない
    // （画像などはリンクを含まないので、HTML だけ）
    const isHtml = response.headers.get('Content-Type')?.startsWith('text/html');
    if (isHtml && context.cookies.has(SESSION_COOKIE)) response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  const adminPath = validAdminPath(env.ADMIN_PATH);
  if (!adminPath || context.params.admin !== adminPath) return noStore(404, 'Not Found');

  // ログインページだけはログイン前でも見られる
  if (context.routePattern !== LOGIN_ROUTE && !(await isLoggedIn(context.cookies))) {
    return context.redirect(`/${adminPath}/login`, 303);
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  // 管理画面の URL（秘密のパス）を外部サイトへの Referer で漏らさない。
  // no-referrer にするとブラウザが自サイトへの POST にも Origin: null を付け、
  // Astro の CSRF 対策に拒否されてログインやアップロードができなくなるので same-origin にする
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
});
