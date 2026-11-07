import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  title: text('title'),
  description: text('description'),
  r2Key: text('r2_key').notNull(),
  // フルサイズの元画像。r2Key は公開用に圧縮したもの。圧縮導入前の画像は両方同じキー
  originalR2Key: text('original_r2_key'),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
});

export const imageTags = sqliteTable('image_tags', {
  imageId: text('image_id').notNull().references(() => images.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.imageId, t.tagId] })]);

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  coverImageId: text('cover_image_id').references(() => images.id),
  createdAt: text('created_at').notNull(),
});

export const albumImages = sqliteTable('album_images', {
  albumId: text('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  imageId: text('image_id').notNull().references(() => images.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.albumId, t.imageId] })]);

export const blueskyPosts = sqliteTable('bluesky_posts', {
  id: text('id').primaryKey(),
  imageId: text('image_id').notNull().references(() => images.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'pending' | 'success' | 'failed'
  text: text('text').notNull(), // 実際に投稿した本文
  postUri: text('post_uri'), // at:// URI（成功時）
  postCid: text('post_cid'), // CID（成功時）
  error: text('error'), // エラー内容（失敗時）
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** 管理画面へのログイン試行。回数制限のために IP ごとの時刻を記録する */
export const loginAttempts = sqliteTable('login_attempts', {
  id: text('id').primaryKey(),
  ip: text('ip').notNull(),
  attemptedAt: integer('attempted_at').notNull(), // ミリ秒
}, (t) => [index('login_attempts_ip_at').on(t.ip, t.attemptedAt)]);
