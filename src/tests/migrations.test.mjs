import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrations } from '../setup/recovery.js'

test('migrations posteriores preservam os dados editoriais e as proteções de recuperação', () => {
  const db = new DatabaseSync(':memory:'), sql = migrations()
  try {
    for (const migration of sql.slice(0, 14)) db.exec(migration)
    db.exec("INSERT INTO pages(id,slug,title,namespace,status,created_at,updated_at) VALUES ('page','alpha','Alpha','article','published','now','now'); INSERT INTO revisions(id,page_id,revision_number,author_email,content_markdown,created_at) VALUES ('revision','page',1,'editor@example.com','content','now'); UPDATE pages SET current_revision_id='revision'; INSERT INTO redirects(id,from_slug,to_slug,target_fragment,created_at) VALUES ('redirect','alias','alpha','section','now')")
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name)
    const snapshot = () => Object.fromEntries(tables.map(name => [name, db.prepare('SELECT * FROM "' + name + '"').all()]))
    const before = snapshot()
    for (const migration of sql.slice(14)) db.exec(migration)
    assert.deepEqual(snapshot(), before)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'recovery_%'").get().n, 54)
  } finally { db.close() }
})
