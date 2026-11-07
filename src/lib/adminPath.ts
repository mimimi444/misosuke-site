// 管理画面は推測しにくい秘密のパス（ADMIN_PATH）でだけ公開する。
// ページは src/pages/[admin]/ にあり、ミドルウェアが先頭の [admin] と ADMIN_PATH の一致を確かめる。

/** 推測されにくさを担保する最低限の長さ */
const MIN_LENGTH = 16;

/** 設定値が秘密のパスとして使えるなら返す。使えなければ null（管理画面には誰も入れない） */
export function validAdminPath(value: string | undefined): string | null {
  if (!value || value.length < MIN_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return value;
}

/** pathname が base そのものか、その配下なら true */
export function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + '/');
}
