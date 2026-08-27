import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '../migrations')
const migrationFiles = readdirSync(migrationsDir).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()

if (migrationFiles.length !== 3) throw new Error(`Expected 3 migrations, found ${migrationFiles.length}: ${migrationFiles.join(', ')}`)

const db = new DatabaseSync(':memory:')
for (const file of migrationFiles) db.exec(readFileSync(resolve(migrationsDir, file), 'utf8'))

const expectedTables = [
  'account_strategies',
  'audit_logs',
  'content_drafts',
  'draft_feedback',
  'draft_versions',
  'research_items',
  'research_sources',
  'research_targets',
  'settings',
  'users',
  'voice_memories',
  'voice_profiles',
  'workspace_members',
  'workspaces',
  'x_accounts',
].sort()

const actualTables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all().map((row) => row.name)

if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
  throw new Error(`Unexpected tables: ${JSON.stringify(actualTables)}`)
}

const timestamp = new Date().toISOString()
db.prepare('INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)').run('usr_test', 'owner@example.test', 'Owner', timestamp, timestamp)
db.prepare('INSERT INTO workspaces (id,name,slug,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('ws_test', 'Test', 'test', 'usr_test', timestamp, timestamp)
db.prepare('INSERT INTO x_accounts (id,workspace_id,handle,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('xac_a', 'ws_test', 'account_a', 'Account A', 'active', timestamp, timestamp)
db.prepare('INSERT INTO research_sources (id,workspace_id,name,kind,url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('src_a', 'ws_test', 'Feed', 'rss', 'https://example.com/feed.xml', timestamp, timestamp)
db.prepare('INSERT INTO research_items (id,workspace_id,source_id,title,url,kind,external_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('rsi_a', 'ws_test', 'src_a', 'Research A', 'https://example.com/a', 'rss', 'hash-a', timestamp, timestamp)

db.prepare(`
  INSERT INTO content_drafts (
    id,workspace_id,account_id,research_item_id,title,target_action,status,current_version,
    current_hook,current_body,current_angle,content_hash,duplicate_score,created_by_user_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`).run('drf_a', 'ws_test', 'xac_a', 'rsi_a', 'Draft A', 'engagement', 'draft', 1, 'Hook', 'Draft body', 'Angle', 'hash-draft-a', 0, 'usr_test', timestamp, timestamp)

db.prepare(`
  INSERT INTO draft_versions (
    id,workspace_id,draft_id,version_number,hook,body,angle,source,created_by_user_id,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)
`).run('drv_a1', 'ws_test', 'drf_a', 1, 'Hook', 'Draft body', 'Angle', 'manual', 'usr_test', timestamp)

let duplicateVersionBlocked = false
try {
  db.prepare(`
    INSERT INTO draft_versions (
      id,workspace_id,draft_id,version_number,hook,body,angle,source,created_by_user_id,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run('drv_a2', 'ws_test', 'drf_a', 1, 'Hook2', 'Draft body2', 'Angle2', 'edit', 'usr_test', timestamp)
} catch {
  duplicateVersionBlocked = true
}
if (!duplicateVersionBlocked) throw new Error('draft version unique constraint is not enforced')

let invalidDraftStatusBlocked = false
try {
  db.prepare(`
    INSERT INTO content_drafts (
      id,workspace_id,account_id,title,target_action,status,current_version,current_body,content_hash,created_by_user_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run('drf_invalid', 'ws_test', 'xac_a', 'Invalid', 'engagement', 'invalid', 1, 'Body', 'hash-invalid', 'usr_test', timestamp, timestamp)
} catch {
  invalidDraftStatusBlocked = true
}
if (!invalidDraftStatusBlocked) throw new Error('draft status CHECK constraint is not enforced')

let invalidFeedbackBlocked = false
try {
  db.prepare('INSERT INTO draft_feedback (id,workspace_id,draft_id,user_id,decision,created_at) VALUES (?,?,?,?,?,?)').run('dfb_bad', 'ws_test', 'drf_a', 'usr_test', 'invalid', timestamp)
} catch {
  invalidFeedbackBlocked = true
}
if (!invalidFeedbackBlocked) throw new Error('draft feedback decision CHECK constraint is not enforced')

db.prepare(`
  INSERT INTO voice_memories (
    id,workspace_id,account_id,kind,content,source,created_by_user_id,active,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)
`).run('vmm_a', 'ws_test', 'xac_a', 'avoidance', 'Do not use this phrase', 'feedback', 'usr_test', 1, timestamp, timestamp)

let invalidMemoryActiveBlocked = false
try {
  db.prepare(`
    INSERT INTO voice_memories (
      id,workspace_id,account_id,kind,content,source,created_by_user_id,active,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run('vmm_bad', 'ws_test', 'xac_a', 'preference', 'Invalid active', 'manual', 'usr_test', 2, timestamp, timestamp)
} catch {
  invalidMemoryActiveBlocked = true
}
if (!invalidMemoryActiveBlocked) throw new Error('voice memory active CHECK constraint is not enforced')

db.close()
console.log(`Migration smoke test passed (${migrationFiles.length} migrations / ${expectedTables.length} tables).`)
