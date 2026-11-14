// wrangler secret / .dev.vars で与える値。
// worker-configuration.d.ts が宣言する Env（グローバルと Cloudflare namespace の両方）に合流させる。
interface Env {
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  /** 管理画面の URL に使う推測しにくい文字列（16 文字以上の英数字・-・_） */
  ADMIN_PATH: string;
  /** ログイン状態のトークンに署名する秘密鍵 */
  SESSION_SECRET: string;
  BLUESKY_IDENTIFIER: string;
  BLUESKY_APP_PASSWORD: string;
}

declare namespace Cloudflare {
  interface Env {
    ADMIN_USER: string;
    ADMIN_PASSWORD: string;
    ADMIN_PATH: string;
    SESSION_SECRET: string;
    BLUESKY_IDENTIFIER: string;
    BLUESKY_APP_PASSWORD: string;
  }
}
