import { describe, test, expect } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from './session';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = 1_800_000_000_000;

describe('session token', () => {
  test('作ったトークンは有効期限内なら検証を通る', async () => {
    const token = await createSessionToken(SECRET, NOW);
    await expect(verifySessionToken(token, SECRET, NOW + 1000)).resolves.toBe(true);
  });

  test('有効期限を過ぎたら通らない', async () => {
    const token = await createSessionToken(SECRET, NOW);
    await expect(verifySessionToken(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000 + 1)).resolves.toBe(false);
  });

  test('別の秘密鍵で作ったトークンは通らない', async () => {
    const token = await createSessionToken('other-secret', NOW);
    await expect(verifySessionToken(token, SECRET, NOW)).resolves.toBe(false);
  });

  test('有効期限を書き換えたトークンは通らない', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [exp, sig] = token.split('.');
    const forged = `${Number(exp) + 999999}.${sig}`;
    await expect(verifySessionToken(forged, SECRET, NOW)).resolves.toBe(false);
  });

  test('壊れたトークンや空のトークンは通らない', async () => {
    for (const bad of [undefined, '', 'abc', '123.', '.sig', 'x.y.z', '123.!!!']) {
      await expect(verifySessionToken(bad, SECRET, NOW)).resolves.toBe(false);
    }
  });

  test('秘密鍵が未設定なら作れず、検証も通らない（fail closed）', async () => {
    await expect(createSessionToken('', NOW)).rejects.toThrow();
    const token = await createSessionToken(SECRET, NOW);
    await expect(verifySessionToken(token, '', NOW)).resolves.toBe(false);
  });
});
