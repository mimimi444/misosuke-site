import { test, expect, vi, afterEach } from 'vitest';
import { withDeadline, timeoutFetch } from './timeout';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('withDeadline: 期限内に終われば結果を返す', async () => {
  await expect(withDeadline(Promise.resolve(42), 1000, '時間切れ')).resolves.toBe(42);
});

test('withDeadline: 期限を過ぎたら指定のメッセージで reject する', async () => {
  vi.useFakeTimers();
  const never = new Promise<never>(() => {});
  const result = withDeadline(never, 1000, '時間切れ');
  vi.advanceTimersByTime(1000);
  await expect(result).rejects.toThrow('時間切れ');
});

test('timeoutFetch: 応答しない通信を期限で打ち切る', async () => {
  // signal が abort されたら reject する、応答しない fetch
  vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
  await expect(timeoutFetch(20)('https://example.invalid/')).rejects.toThrow();
});
