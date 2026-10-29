import { sqliteTable, text, integer, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
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

export const excelImportFiles=sqliteTable('excel_import_files',{
 userId:text('user_id').notNull().references(()=>users.id),id:text('id').notNull(),planId:text('plan_id').notNull(),sourceName:text('source_name').notNull(),contentHash:text('content_hash').notNull(),objectKey:text('object_key').notNull(),sizeBytes:integer('size_bytes').notNull(),startDate:text('start_date').notNull(),endDate:text('end_date').notNull(),weeks:integer('weeks').notNull(),planName:text('plan_name').notNull(),importedAt:integer('imported_at').notNull(),confirmedAt:integer('confirmed_at')
},table=>[primaryKey({columns:[table.userId,table.id]}),uniqueIndex('excel_import_files_account_hash_start').on(table.userId,table.contentHash,table.startDate)]);
export const appFeatures=sqliteTable('app_features',{
 id:text('id').primaryKey(),nutritionEnabled:integer('nutrition_enabled').notNull().default(0),revision:integer('revision').notNull().default(1),updatedBy:text('updated_by').references(()=>users.id),updatedAt:integer('updated_at')
});
export const accountArchiveResets=sqliteTable('account_archive_resets',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().unique().references(()=>users.id),scope:text('scope').notNull().unique(),resetId:text('reset_id').notNull(),completedAt:integer('completed_at'),recoveryKey:text('recovery_key'),retainUntil:integer('retain_until')
});
