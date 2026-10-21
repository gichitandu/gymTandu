import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), username:text('username').unique(), role:text('role').notNull(), active:integer('active').notNull().default(1), salt:text('salt').notNull(), passwordHash:text('password_hash').notNull(), createdAt:integer('created_at').notNull()
});
export const sessions = sqliteTable('sessions', {tokenHash:text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),visitorId:text('visitor_id').notNull(),expiresAt:integer('expires_at').notNull()});
export const limits = sqliteTable('login_limits',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});
export const catalogExercises = sqliteTable('catalog_exercises',{id:text('id').primaryKey(),payload:text('payload').notNull(),active:integer('active').notNull(),updatedBy:text('updated_by').notNull().references(()=>users.id),updatedAt:integer('updated_at').notNull()});
export const catalogGroups = sqliteTable('catalog_groups',{id:text('id').primaryKey(),name:text('name').notNull()});
export const preferences = sqliteTable('user_preferences',{userId:text('user_id').primaryKey().references(()=>users.id),backgroundColor:text('background_color').notNull().default('#050b12')});
