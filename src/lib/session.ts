// 管理画面のログイン状態を表す署名付きトークン。
// 形式は `<有効期限(秒)>.<HMAC-SHA256 署名(base64url)>`。サーバー側に状態を持たない。

export const SESSION_COOKIE = 'admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7日

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createSessionToken(secret: string, nowMs: number): Promise<string> {
  if (!secret) throw new Error('SESSION_SECRET が未設定');
  const exp = String(Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS);
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(exp));
  return `${exp}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, nowMs: number): Promise<boolean> {
  // 秘密鍵が未設定なら誰も通さない（fail closed）
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [exp, sigText] = parts as [string, string];
  if (!/^\d+$/.test(exp)) return false;
  const sig = fromBase64Url(sigText);
  if (!sig) return false;

  // crypto.subtle.verify は定数時間で比較する
  const valid = await crypto.subtle.verify('HMAC', await importKey(secret), sig, encoder.encode(exp));
  return valid && Number(exp) * 1000 > nowMs;
}
