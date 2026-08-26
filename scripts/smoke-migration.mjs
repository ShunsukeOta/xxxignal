import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const migrations = [
  new URL('../migrations/0000_core_foundation.sql', import.meta.url),
  new URL('../migrations/0001_research_x_viewer.sql', import.meta.url),
]
const db = new DatabaseSync(':memory:')
for (const file of migrations) db.exec(readFileSync(file, 'utf8'))

const expectedTables = [
  'account_strategies','audit_logs','research_items','research_sources','research_targets','settings','users','voice_profiles','workspace_members','workspaces','x_accounts',
]
const actualTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((row)=>row.name)
if (JSON.stringify(actualTables) !== JSON.stringify([...expectedTables].sort())) throw new Error(`Unexpected tables: ${JSON.stringify(actualTables)}`)

const timestamp = new Date().toISOString()
db.prepare('INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)').run('usr_test','owner@example.test','Owner',timestamp,timestamp)
db.prepare('INSERT INTO workspaces (id,name,slug,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('ws_test','Test','test','usr_test',timestamp,timestamp)
db.prepare('INSERT INTO x_accounts (id,workspace_id,handle,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('xac_a','ws_test','account_a','Account A','active',timestamp,timestamp)

let duplicateAccountBlocked=false
try{db.prepare('INSERT INTO x_accounts (id,workspace_id,handle,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('xac_b','ws_test','account_a','Account B','active',timestamp,timestamp)}catch{duplicateAccountBlocked=true}
if(!duplicateAccountBlocked)throw new Error('workspace + handle unique constraint is not enforced')

db.prepare('INSERT INTO research_sources (id,workspace_id,name,kind,url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('src_a','ws_test','Feed','rss','https://example.com/feed.xml',timestamp,timestamp)
let duplicateSourceBlocked=false
try{db.prepare('INSERT INTO research_sources (id,workspace_id,name,kind,url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('src_b','ws_test','Feed2','rss','https://example.com/feed.xml',timestamp,timestamp)}catch{duplicateSourceBlocked=true}
if(!duplicateSourceBlocked)throw new Error('research source URL unique constraint is not enforced')

db.prepare('INSERT INTO research_targets (id,workspace_id,handle,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('tgt_a','ws_test','target_a','Target A','competitor',timestamp,timestamp)
db.prepare('INSERT INTO research_items (id,workspace_id,source_id,title,url,kind,external_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('rsi_a','ws_test','src_a','Item','https://example.com/a','rss','hash-a',timestamp,timestamp)
let duplicateItemBlocked=false
try{db.prepare('INSERT INTO research_items (id,workspace_id,source_id,title,url,kind,external_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('rsi_b','ws_test','src_a','Item2','https://example.com/b','rss','hash-a',timestamp,timestamp)}catch{duplicateItemBlocked=true}
if(!duplicateItemBlocked)throw new Error('RSS duplicate key constraint is not enforced')

db.close()
console.log('Migration smoke test passed (2 migrations).')
