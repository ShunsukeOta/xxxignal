import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const migration = readFileSync(new URL('../migrations/0000_core_foundation.sql', import.meta.url), 'utf8')
const db = new DatabaseSync(':memory:')
db.exec(migration)

const expectedTables = [
  'account_strategies',
  'audit_logs',
  'settings',
  'users',
  'voice_profiles',
  'workspace_members',
  'workspaces',
  'x_accounts',
]

const actualTables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all().map((row) => row.name)

if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
  throw new Error(`Unexpected tables: ${JSON.stringify(actualTables)}`)
}

const timestamp = new Date().toISOString()
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  .run('usr_test', 'owner@example.test', 'Owner', timestamp, timestamp)
db.prepare('INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run('ws_test', 'Test', 'test', 'usr_test', timestamp, timestamp)
db.prepare(`
  INSERT INTO x_accounts (
    id, workspace_id, handle, display_name, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('xac_a', 'ws_test', 'account_a', 'Account A', 'active', timestamp, timestamp)

let duplicateBlocked = false
try {
  db.prepare(`
    INSERT INTO x_accounts (
      id, workspace_id, handle, display_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('xac_b', 'ws_test', 'account_a', 'Account B', 'active', timestamp, timestamp)
} catch {
  duplicateBlocked = true
}

if (!duplicateBlocked) throw new Error('workspace + handle unique constraint is not enforced')

let invalidStatusBlocked = false
try {
  db.prepare(`
    INSERT INTO x_accounts (
      id, workspace_id, handle, display_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('xac_c', 'ws_test', 'account_c', 'Account C', 'invalid', timestamp, timestamp)
} catch {
  invalidStatusBlocked = true
}

if (!invalidStatusBlocked) throw new Error('account status CHECK constraint is not enforced')

db.close()
console.log('Migration smoke test passed.')
