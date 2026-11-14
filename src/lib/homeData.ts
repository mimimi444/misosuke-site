// トップと同じ構成（HomeLayout）に渡す、作品一覧と雑誌の候補
import { loadRailPage } from './rail';
import { RAIL_PAGE_SIZE } from '../pages/api/rail';
import type { getDb } from '../db/client';

export async function loadHome(db: ReturnType<typeof getDb>) {
  const rail = await loadRailPage(db, { limit: RAIL_PAGE_SIZE });
  return { items: rail.items, nextCursor: rail.nextCursor };
}
