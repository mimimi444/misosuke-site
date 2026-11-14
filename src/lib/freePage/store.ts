// フリーページの保存と読み込み（D1 の settings）
import { eq, inArray } from 'drizzle-orm';
import type { getDb } from '../../db/client';
import { images, settings } from '../../db/schema';
import { r2Url } from '../r2url';
import { pageHref, parseFreePage, widgetProblem, type FreePage, type FreePageView } from './model';

type Db = ReturnType<typeof getDb>;
const KEY = 'free_page';

export async function loadFreePage(db: Db): Promise<FreePage> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  if (!row) return { widgets: [] };
  try {
    return parseFreePage(JSON.parse(row.value));
  } catch {
    return { widgets: [] };
  }
}

export async function saveFreePage(db: Db, page: FreePage): Promise<void> {
  const value = JSON.stringify(page);
  const updatedAt = new Date().toISOString();
  await db.insert(settings).values({ key: KEY, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}

/** 表示用。問題のあるウィジェットと、消された画像は除く。何も残らなければ null（フリーページを出さない） */
export async function loadFreePageView(db: Db): Promise<FreePageView | null> {
  const page = await loadFreePage(db);
  const ids = page.widgets.flatMap((w) => (w.type === 'image' ? [w.imageId] : []));
  const rows = ids.length ? await db.select({ id: images.id, r2Key: images.r2Key, width: images.width, height: images.height }).from(images).where(inArray(images.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const widgets: FreePageView['widgets'] = [];
  for (const w of page.widgets) {
    if (widgetProblem(w)) continue;
    if (w.type === 'image') {
      const img = byId.get(w.imageId);
      if (!img) continue;
      widgets.push({ ...w, src: r2Url(img.r2Key), aspect: img.width && img.height ? img.width / img.height : undefined });
    } else widgets.push(w);
  }
  if (widgets.length === 0) return null;
  return { widgets, href: pageHref({ widgets }) };
}

/** 選べる画像が存在するか（保存前の確認） */
export async function missingImageIds(db: Db, page: FreePage): Promise<string[]> {
  const ids = page.widgets.flatMap((w) => (w.type === 'image' ? [w.imageId] : []));
  if (ids.length === 0) return [];
  const rows = await db.select({ id: images.id }).from(images).where(inArray(images.id, ids));
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !found.has(id));
}
