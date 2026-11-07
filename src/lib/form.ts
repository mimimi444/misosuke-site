import { z } from 'zod';

/**
 * フォームの真偽値。'true' だけを true とし、'false' や未指定は false にする。
 * z.coerce.boolean() は文字列 'false' を true にしてしまうので使わない。
 */
export const formBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');
