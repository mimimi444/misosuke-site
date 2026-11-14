// 3D の雑誌（showcaseClient が作る）を、作品詳細（detailClient）から使うための受け渡し口。
// three.js を読み込まないよう、型だけを参照する。
import type { ShowcaseApi } from './magazine/scene';

let settled = false;
let current: ShowcaseApi | null = null;
const waiters: ((api: ShowcaseApi | null) => void)[] = [];

/** 3D の準備ができた（api）か、使えないと分かった（null） */
export function setStage(api: ShowcaseApi | null): void {
  settled = true;
  current = api;
  waiters.splice(0).forEach((w) => w(api));
}

/** 3D の準備を待つ。使えなければ null */
export function whenStage(): Promise<ShowcaseApi | null> {
  return settled ? Promise.resolve(current) : new Promise((resolve) => waiters.push(resolve));
}
