import { z } from 'zod';

/**
 * フォームの真偽値。'true' だけを true とし、'false' や未指定は false にする。
 * z.coerce.boolean() は文字列 'false' を true にしてしまうので使わない。
 * Astro Actions はフォームにない項目を null で渡すので、null も受け付ける。
 */
export const formBoolean = z
  .enum(['true', 'false'])
  .nullish()
  .transform((v) => v === 'true');
