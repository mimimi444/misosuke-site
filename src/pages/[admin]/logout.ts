import type { APIRoute } from 'astro';
import { adminHref, endSession } from '../../lib/adminSession';

// ログアウトは状態を変えるので POST だけを受け付ける
export const POST: APIRoute = ({ cookies, redirect }) => {
  endSession(cookies);
  return redirect(adminHref('/login'), 303);
};
