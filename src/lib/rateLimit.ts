import { and, eq, gt, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { getDb } from '../db/client';
import { loginAttempts } from '../db/schema';

/** ログイン試行の上限: 5 分間に 10 回まで（IP アドレスごと） */
export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export interface AttemptDecision {
  allowed: boolean;
  /** 拒否したとき、次に試せるまでの秒数 */
  retryAfterSeconds: number;
}

/** 過去の試行時刻（ミリ秒）から、今回の試行を許すかを決める */
export function decideLoginAttempt(attemptTimes: number[], nowMs: number): AttemptDecision {
  const recent = attemptTimes.filter((t) => t > nowMs - LOGIN_WINDOW_MS).sort((a, b) => a - b);
  if (recent.length < LOGIN_MAX_ATTEMPTS) return { allowed: true, retryAfterSeconds: 0 };
  // 窓の中の最古の試行が抜ければ、1 回分の枠が空く
  const oldest = recent[recent.length - LOGIN_MAX_ATTEMPTS]!;
  return { allowed: false, retryAfterSeconds: Math.ceil((oldest + LOGIN_WINDOW_MS - nowMs) / 1000) };
}

/**
 * 試行を 1 回分消費する。許可した場合だけ記録する（拒否した試行は数えない）。
 * 成功・失敗にかかわらず、パスワードを照合する前に呼ぶ。
 */
export async function consumeLoginAttempt(
  db: ReturnType<typeof getDb>,
  ip: string,
  nowMs: number,
): Promise<AttemptDecision> {
  const since = nowMs - LOGIN_WINDOW_MS;
  const rows = await db
    .select({ at: loginAttempts.attemptedAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.attemptedAt, since)));

  const decision = decideLoginAttempt(
    rows.map((r) => r.at),
    nowMs,
  );
  if (decision.allowed) {
    await db.insert(loginAttempts).values({ id: nanoid(), ip, attemptedAt: nowMs });
  }
  // 古い記録は数える必要がないので消しておく
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, since));
  return decision;
}
