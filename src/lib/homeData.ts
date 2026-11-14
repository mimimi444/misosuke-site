// トップと同じ構成（HomeLayout）に渡す、作品一覧と雑誌の候補
import { loadRailPage } from './rail';
import { RAIL_PAGE_SIZE } from '../pages/api/rail';
import type { getDb } from '../db/client';
import { loadFreePageView } from './freePage/store';

export async function loadHome(db: ReturnType<typeof getDb>) {
  const [rail, free] = await Promise.all([loadRailPage(db, { limit: RAIL_PAGE_SIZE }), loadFreePageView(db)]);
  return { items: rail.items, nextCursor: rail.nextCursor, free };
}
