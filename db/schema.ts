import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), username:text('username').unique(), role:text('role').notNull(), active:integer('active').notNull().default(1), salt:text('salt').notNull(), passwordHash:text('password_hash').notNull(), createdAt:integer('created_at').notNull()
});
export const sessions = sqliteTable('sessions', {tokenHash:text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),visitorId:text('visitor_id').notNull(),expiresAt:integer('expires_at').notNull()});
export const limits = sqliteTable('login_limits',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});
export const catalogExercises = sqliteTable('catalog_exercises',{id:text('id').primaryKey(),payload:text('payload').notNull(),active:integer('active').notNull(),updatedBy:text('updated_by').notNull().references(()=>users.id),updatedAt:integer('updated_at').notNull()});
export const catalogGroups = sqliteTable('catalog_groups',{id:text('id').primaryKey(),name:text('name').notNull()});
export const preferences = sqliteTable('user_preferences',{userId:text('user_id').primaryKey().references(()=>users.id),backgroundColor:text('background_color').notNull().default('#050b12')});
export const archiveHeads = sqliteTable('archive_heads', {
 scope:text('scope').primaryKey(),revision:integer('revision').notNull(),objectKey:text('object_key').notNull(),updatedAt:integer('updated_at').notNull(),sizeBytes:integer('size_bytes').notNull(),contentHash:text('content_hash').notNull()
});
export const archiveVersions = sqliteTable('archive_versions', {
 id:text('id').primaryKey(),scope:text('scope').notNull(),revision:integer('revision').notNull(),objectKey:text('object_key').notNull(),updatedAt:integer('updated_at').notNull(),sizeBytes:integer('size_bytes').notNull(),contentHash:text('content_hash').notNull()
},table=>[uniqueIndex('archive_versions_scope_revision').on(table.scope,table.revision)]);
export const appReleases = sqliteTable('app_releases', {
 id:text('id').primaryKey(),buildId:text('build_id').notNull(),generation:integer('generation').notNull().default(1),requestedAt:integer('requested_at').notNull(),requestedBy:text('requested_by').references(()=>users.id)
});

// Server-only integration secret, never part of personal archives or API reads.
export const calendarServiceConfig=sqliteTable('calendar_service_config',{id:text('id').primaryKey(),secret:text('secret').notNull(),configuredBy:text('configured_by').notNull(),configuredAt:integer('configured_at').notNull()});
