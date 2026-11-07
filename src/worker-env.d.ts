// wrangler secret / .dev.vars で与える値。
// worker-configuration.d.ts が宣言する Env（グローバルと Cloudflare namespace の両方）に合流させる。
interface Env {
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
}

declare namespace Cloudflare {
  interface Env {
    ADMIN_USER: string;
    ADMIN_PASSWORD: string;
  }
}
