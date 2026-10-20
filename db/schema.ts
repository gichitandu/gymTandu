import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), role:text('role').notNull(), active:integer('active').notNull().default(1), salt:text('salt').notNull(), passwordHash:text('password_hash').notNull(), createdAt:integer('created_at').notNull()
});
export const sessions = sqliteTable('sessions', {tokenHash:text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),visitorId:text('visitor_id').notNull(),expiresAt:integer('expires_at').notNull()});
export const limits = sqliteTable('login_limits',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});
