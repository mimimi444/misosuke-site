// Workers の環境変数に依存する、管理画面まわりのヘルパー（テスト対象外の薄い層）
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { validAdminPath } from './adminPath';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from './session';

/** 管理画面内のリンクを組み立てる。例: adminHref('/images') → '/<ADMIN_PATH>/images' */
export function adminHref(path = ''): string {
  // ADMIN_PATH が不正なら管理画面には入れないので、存在しないパスを返しておく
  const base = validAdminPath(env.ADMIN_PATH);
  return base ? `/${base}${path}` : '/404';
}

export function isLoggedIn(cookies: AstroCookies): Promise<boolean> {
  return verifySessionToken(cookies.get(SESSION_COOKIE)?.value, env.SESSION_SECRET ?? '', Date.now());
}

export async function startSession(cookies: AstroCookies): Promise<void> {
  const token = await createSessionToken(env.SESSION_SECRET ?? '', Date.now());
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function endSession(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
