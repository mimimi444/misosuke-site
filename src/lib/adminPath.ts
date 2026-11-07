// 管理画面は推測しにくい秘密のパス（ADMIN_PATH）でだけ公開する。
// ページの実体は src/pages/admin/ にあり、ミドルウェアが `/<ADMIN_PATH>/...` を `/admin/...` に読み替える。
// `/admin/...` への直接アクセスは 404 にする。

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

/** `/<adminPath>/x` を `/admin/x` に読み替える。対象外なら null */
export function toInternalAdminPath(pathname: string, adminPath: string): string | null {
  const base = `/${adminPath}`;
  if (!isUnder(pathname, base)) return null;
  return '/admin' + pathname.slice(base.length);
}
