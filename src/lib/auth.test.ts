import { describe, test, expect } from 'vitest';
import { verifyCredentials } from './auth';

const USER = 'misosuke';
const PASS = 'correct-horse-battery-staple';

describe('verifyCredentials', () => {
  test('正しいユーザー名とパスワードを受け入れる', async () => {
    await expect(verifyCredentials(USER, PASS, USER, PASS)).resolves.toBe(true);
  });

  test('パスワードが違えば拒否する', async () => {
    await expect(verifyCredentials(USER, 'wrong', USER, PASS)).resolves.toBe(false);
  });

  test('ユーザー名が違えば拒否する', async () => {
    await expect(verifyCredentials('intruder', PASS, USER, PASS)).resolves.toBe(false);
  });

  test('入力が空なら拒否する', async () => {
    await expect(verifyCredentials('', '', USER, PASS)).resolves.toBe(false);
  });

  test('認証情報が未設定なら、空の入力でも誰も通さない（fail closed）', async () => {
    await expect(verifyCredentials('', '', '', '')).resolves.toBe(false);
    await expect(verifyCredentials(USER, PASS, USER, '')).resolves.toBe(false);
  });

  test('記号や非ASCIIを含むパスワードを受け入れる', async () => {
    for (const p of ['pa:ss\\word', 'みそすけの秘密']) {
      await expect(verifyCredentials(USER, p, USER, p)).resolves.toBe(true);
    }
  });
});
