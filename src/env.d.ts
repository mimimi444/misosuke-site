/// <reference types="astro/client" />

declare module 'cloudflare:workers' {
  const env: Env;
  export { env };
}

type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
  interface Locals extends Runtime {}
}
