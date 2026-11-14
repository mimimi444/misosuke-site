import { describe, test, expect } from 'vitest';
import { decideLoginAttempt, rateLimitKey, LOGIN_MAX_ATTEMPTS, LOGIN_GLOBAL_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './rateLimit';

const NOW = 1_800_000_000_000;
const ago = (ms: number) => NOW - ms;

describe('decideLoginAttempt', () => {
  test('上限は 5 分間に 10 回', () => {
    expect(LOGIN_MAX_ATTEMPTS).toBe(10);
    expect(LOGIN_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  test('直近 5 分の試行が 9 回までなら許可する', () => {
    const times = Array.from({ length: 9 }, (_, i) => ago(i * 1000));
    expect(decideLoginAttempt(times, NOW)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  test('直近 5 分に 10 回あれば拒否し、最も古い試行が窓を出るまでの秒数を返す', () => {
    const times = Array.from({ length: 10 }, (_, i) => ago(60_000 + i * 1000)); // 最古は 69 秒前
    expect(decideLoginAttempt(times, NOW)).toEqual({ allowed: false, retryAfterSeconds: 300 - 69 });
  });

  test('5 分より前の試行は数えない', () => {
    const old = Array.from({ length: 20 }, (_, i) => ago(LOGIN_WINDOW_MS + 1 + i));
    const recent = Array.from({ length: 9 }, (_, i) => ago(i));
    expect(decideLoginAttempt([...old, ...recent], NOW).allowed).toBe(true);
  });
});

describe('rateLimitKey', () => {
  test('IPv4 はアドレスごとに数える', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  test('IPv6 は先頭 /64 でまとめる（アドレスを替えて回避させない）', () => {
    expect(rateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:DB8:1:2::ffff')).toBe('2001:db8:1:2::/64');
  });

  test('省略表記の IPv6 も展開してから /64 を取る', () => {
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
  });

  test('空や不明はまとめて 1 つのキーにする', () => {
    expect(rateLimitKey('')).toBe('unknown');
  });
});

test('サイト全体でも 5 分間に 100 回まで', () => {
  expect(LOGIN_GLOBAL_MAX_ATTEMPTS).toBe(100);
});
