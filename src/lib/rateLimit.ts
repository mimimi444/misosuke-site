import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { getDb } from '../db/client';
import { loginAttempts } from '../db/schema';

/** ログイン試行の上限: 5 分間に 10 回まで（IP アドレスごと） */
export const LOGIN_MAX_ATTEMPTS = 10;
/** IP を次々に替えられても総当たりできないよう、サイト全体にも上限を置く */
export const LOGIN_GLOBAL_MAX_ATTEMPTS = 100;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000;

/**
 * 回数を数える単位。IPv6 は 1 契約で /64 単位のアドレスを自由に使えることが多いので、
 * 先頭 64 ビットでまとめる。IPv4 はアドレスごと。
 */
export function rateLimitKey(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (!value) return 'unknown';
  if (!value.includes(':')) return value;
  // IPv4 射影アドレス（::ffff:1.2.3.4）は IPv4 として扱う
  if (value.includes('.')) return value.slice(value.lastIndexOf(':') + 1);

  const [head = '', tail] = value.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const groups =
    tail === undefined ? headParts : [...headParts, ...Array(8 - headParts.length - tailParts.length).fill('0'), ...tailParts];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export interface AttemptDecision {
  allowed: boolean;
  /** 拒否したとき、次に試せるまでの秒数 */
  retryAfterSeconds: number;
}

/** 過去の試行時刻（ミリ秒）から、今回の試行を許すかを決める */
export function decideLoginAttempt(attemptTimes: number[], nowMs: number, max = LOGIN_MAX_ATTEMPTS): AttemptDecision {
  const recent = attemptTimes.filter((t) => t > nowMs - LOGIN_WINDOW_MS).sort((a, b) => a - b);
  if (recent.length < max) return { allowed: true, retryAfterSeconds: 0 };
  // 窓の中の最古の試行が抜ければ、1 回分の枠が空く
  const oldest = recent[recent.length - max]!;
  return { allowed: false, retryAfterSeconds: Math.ceil((oldest + LOGIN_WINDOW_MS - nowMs) / 1000) };
}

/**
 * 試行を 1 回分消費する。許可した場合だけ記録する（拒否した試行は数えない）。
 * 成功・失敗にかかわらず、パスワードを照合する前に呼ぶ。
 *
 * 数えることと記録することを 1 つの SQL 文で行う。別々に行うと、同時に大量に送られたとき
 * どれも「まだ上限未満」と判定されてすり抜けるため。D1 は 1 文ずつ直列に実行する。
 */
export async function consumeLoginAttempt(
  db: ReturnType<typeof getDb>,
  ip: string,
  nowMs: number,
): Promise<AttemptDecision> {
  const key = rateLimitKey(ip);
  const since = nowMs - LOGIN_WINDOW_MS;

  const result = await db.run(sql`
    INSERT INTO login_attempts (id, ip, attempted_at)
    SELECT ${nanoid()}, ${key}, ${nowMs}
    WHERE (SELECT count(*) FROM login_attempts WHERE ip = ${key} AND attempted_at > ${since}) < ${LOGIN_MAX_ATTEMPTS}
      AND (SELECT count(*) FROM login_attempts WHERE attempted_at > ${since}) < ${LOGIN_GLOBAL_MAX_ATTEMPTS}
  `);

  // 古い記録は数える必要がないので消しておく
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, since));

  if (result.meta.changes > 0) return { allowed: true, retryAfterSeconds: 0 };

  // 拒否した理由（IP ごと・全体）のうち、待ち時間が長いほうを案内する
  const [own, all] = await Promise.all([
    db.select({ at: loginAttempts.attemptedAt }).from(loginAttempts)
      .where(and(eq(loginAttempts.ip, key), gt(loginAttempts.attemptedAt, since))),
    db.select({ at: loginAttempts.attemptedAt }).from(loginAttempts).where(gt(loginAttempts.attemptedAt, since)),
  ]);
  const wait = Math.max(
    decideLoginAttempt(own.map((r) => r.at), nowMs).retryAfterSeconds,
    decideLoginAttempt(all.map((r) => r.at), nowMs, LOGIN_GLOBAL_MAX_ATTEMPTS).retryAfterSeconds,
    1,
  );
  return { allowed: false, retryAfterSeconds: wait };
}
