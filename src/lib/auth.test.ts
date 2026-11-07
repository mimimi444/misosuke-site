import { describe, test, expect } from 'vitest';
import { verifyBasicAuth } from './auth';

const USER = 'misosuke';
const PASS = 'correct-horse-battery-staple';

/** RFC 7617 形式の Authorization ヘッダを組み立てる（UTF-8 対応） */
function basicHeader(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return 'Basic ' + btoa(binary);
}

describe('verifyBasicAuth', () => {
  test('正しいユーザー名とパスワードを受け入れる', async () => {
    await expect(verifyBasicAuth(basicHeader(USER, PASS), USER, PASS)).resolves.toBe(true);
  });

  test('パスワードが違えば拒否する', async () => {
    await expect(verifyBasicAuth(basicHeader(USER, 'wrong'), USER, PASS)).resolves.toBe(false);
  });

  test('ユーザー名が違えば拒否する', async () => {
    await expect(verifyBasicAuth(basicHeader('intruder', PASS), USER, PASS)).resolves.toBe(false);
  });

  test('ヘッダが無ければ拒否する', async () => {
    await expect(verifyBasicAuth(null, USER, PASS)).resolves.toBe(false);
  });

  test('base64が壊れていれば拒否する', async () => {
    await expect(verifyBasicAuth('Basic ****', USER, PASS)).resolves.toBe(false);
  });

  test('Basic以外のスキームを拒否する', async () => {
    await expect(verifyBasicAuth(basicHeader(USER, PASS).replace('Basic', 'Bearer'), USER, PASS)).resolves.toBe(false);
  });

  test('パスワードにコロンが含まれていても受け入れる', async () => {
    const tricky = 'pa:ss:word';
    await expect(verifyBasicAuth(basicHeader(USER, tricky), USER, tricky)).resolves.toBe(true);
  });

  test('非ASCIIのパスワードを受け入れる', async () => {
    const japanese = 'みそすけの秘密';
    await expect(verifyBasicAuth(basicHeader(USER, japanese), USER, japanese)).resolves.toBe(true);
  });
});
