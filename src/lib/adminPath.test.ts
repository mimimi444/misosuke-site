import { describe, test, expect } from 'vitest';
import { validAdminPath, toInternalAdminPath, isUnder } from './adminPath';

const SECRET = 'k3J9xQ2mP7vR4tW8yZ1a';

describe('validAdminPath', () => {
  test('16 文字以上の英数字・-・_ だけを受け付ける', () => {
    expect(validAdminPath(SECRET)).toBe(SECRET);
    expect(validAdminPath('abc-def_ghi-jkl_m')).toBe('abc-def_ghi-jkl_m');
  });

  test('未設定・短すぎる・使えない文字・既存のパスと紛らわしいものは null（管理画面に入れない）', () => {
    for (const bad of [undefined, '', 'short', 'admin', 'has/slash/inside-xx', 'スペースを含む 秘密の文字列です', 'albums'])
      expect(validAdminPath(bad)).toBeNull();
  });
});

describe('toInternalAdminPath', () => {
  test('秘密のパス配下を /admin 配下に読み替える', () => {
    expect(toInternalAdminPath(`/${SECRET}`, SECRET)).toBe('/admin');
    expect(toInternalAdminPath(`/${SECRET}/`, SECRET)).toBe('/admin/');
    expect(toInternalAdminPath(`/${SECRET}/images`, SECRET)).toBe('/admin/images');
    expect(toInternalAdminPath(`/${SECRET}/albums/edit/x1`, SECRET)).toBe('/admin/albums/edit/x1');
  });

  test('前方一致しても区切りが違えば読み替えない', () => {
    expect(toInternalAdminPath(`/${SECRET}x/images`, SECRET)).toBeNull();
    expect(toInternalAdminPath('/albums', SECRET)).toBeNull();
    expect(toInternalAdminPath('/admin', SECRET)).toBeNull();
  });
});

describe('isUnder', () => {
  test('パスの区切り単位で判定する', () => {
    expect(isUnder('/admin', '/admin')).toBe(true);
    expect(isUnder('/admin/images', '/admin')).toBe(true);
    expect(isUnder('/administrator', '/admin')).toBe(false);
  });
});
