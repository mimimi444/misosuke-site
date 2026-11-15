// テーマカラーの保存と読み込み（D1 の settings）
import { eq } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { settings } from '../db/schema';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './theme';

type Db = ReturnType<typeof getDb>;
const KEY = 'theme';

/** 保存されたテーマ。無い・読めない・知らない値なら既定（オレンジ） */
export async function loadTheme(db: Db): Promise<ThemeId> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
    return row && isThemeId(row.value) ? row.value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function saveTheme(db: Db, theme: ThemeId): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db.insert(settings).values({ key: KEY, value: theme, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value: theme, updatedAt } });
}
