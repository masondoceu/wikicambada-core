import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { hash, readJson, writeJson, safePath, inside, walk, copyTree, checkAncestors, removeWithin, operationLock } from './files.js'
import { ROOT } from './project.js'
import { installationAssets } from './updater.js'

export const TABLES = ['editor_profiles', 'pages', 'revisions', 'redirects', 'categories', 'page_categories', 'page_links', 'uploads', 'system_settings', 'page_search', 'edit_proposals', 'page_aliases', 'ip_rules', 'activity_events', 'content_templates', 'global_settings', 'core_write_guards', 'proposal_rate_limits', 'r2_cleanup']
export const EMPTY_ORDER = ['page_search', 'page_links', 'page_aliases', 'page_categories', 'revisions', 'redirects', 'pages', ...TABLES.filter(name => !['page_search', 'page_links', 'page_aliases', 'page_categories', 'revisions', 'redirects', 'pages'].includes(name))]
export const quote = name => '"' + name.replaceAll('"', '""') + '"'
export const pythonJson = value => Array.isArray(value) ? '[' + value.map(pythonJson).join(', ') + ']' : value && typeof value === 'object' ? '{' + Object.entries(value).map(([key, entry]) => JSON.stringify(key) + ': ' + pythonJson(entry)).join(', ') + '}' : JSON.stringify(value)
export function migrations(root = ROOT) { return fs.readdirSync(path.join(root, 'src/data/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => fs.readFileSync(path.join(root, 'src/data/migrations', name), 'utf8').replace(/\r\n?/g, '\n')) }
export function initializeDatabase(database, root = ROOT) { for (const sql of migrations(root)) database.exec(sql) }
export function schemaHash(database) {
  const rows = database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name NOT IN ('d1_migrations', '_cf_METADATA', '_cf_KV') ORDER BY type, name").all().map(row => Object.values(row).map(value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value))
  return createHash('sha256').update(pythonJson(rows)).digest('hex')
}
let expected
export function expectedSchema() { if (!expected) { const db = new DatabaseSync(':memory:'); try { initializeDatabase(db); expected = schemaHash(db) } finally { db.close() } } return expected }
export const columns = db => Object.fromEntries(TABLES.map(table => [table, db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(row => row.name)]))
export async function* jsonLines(file) { const stream = fs.createReadStream(file, { encoding: 'utf8' }), lines = createInterface({ input: stream, crlfDelay: Infinity }); try { for await (const line of lines) if (line.trim()) yield JSON.parse(line) } finally { lines.close(); stream.destroy() } }
export function checkDatabase(file, objects) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok') || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database integrity check failed')
    if (schemaHash(db) !== expectedSchema()) throw new Error('The schema is incompatible with this Core version')
    if (db.prepare('SELECT pages.id FROM pages LEFT JOIN revisions ON revisions.id = pages.current_revision_id WHERE pages.current_revision_id IS NOT NULL AND (revisions.id IS NULL OR revisions.page_id != pages.id) LIMIT 1').get()) throw new Error('Invalid revision reference')
    for (const row of db.prepare('SELECT r2_key, size_bytes, sha256 FROM uploads').iterate()) {
      const object = path.join(objects, safePath(row.r2_key)); checkAncestors(object)
      if (!fs.existsSync(object) || !fs.statSync(object).isFile() || fs.statSync(object).size !== row.size_bytes) throw new Error(`Missing or invalid upload object: ${row.r2_key}`)
      if (row.sha256 && hash(object) !== row.sha256) throw new Error(`Upload hash mismatch: ${row.r2_key}`)
    }
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS total FROM ${quote(name)}`).get().total]))
  } finally { db.close() }
}
export function snapshotConfiguration(project, destination) {
  if (fs.existsSync(destination)) throw new Error('The configuration destination already exists')
  fs.mkdirSync(destination, { recursive: true })
  for (const name of ['src/config', 'src/media', 'src/data/wiki-icons.json', '.wikicambada/state.json', '.dev.vars', 'wrangler.toml', 'package.json', 'package-lock.json', ...installationAssets(project)]) {
    const source = project.file(name), target = path.join(destination, name)
    if (!fs.existsSync(source) || fs.existsSync(target)) continue
    checkAncestors(source); fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.statSync(source).isDirectory()) { fs.mkdirSync(target); copyTree(source, target) } else fs.copyFileSync(source, target)
  }
  return destination
}
export async function backupLocal(database, objects, destination, configuration, metadata = {}) {
  database = path.resolve(database); objects = path.resolve(objects); destination = path.resolve(destination)
  if (fs.existsSync(destination) || !fs.statSync(database).isFile() || !fs.statSync(objects).isDirectory() || inside(objects, destination) || destination === objects || configuration && (inside(configuration, destination) || configuration === destination)) throw new Error('Invalid backup source or destination')
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  return operationLock(path.dirname(destination), async () => {
    const directory = fs.mkdtempSync(path.join(path.dirname(destination), '.wiki-backup-')), stage = path.join(directory, 'archive')
    try {
      checkAncestors(database); fs.mkdirSync(stage)
      const source = new DatabaseSync(database, { readOnly: true })
      try { source.exec(`VACUUM INTO '${path.join(stage, 'database.sqlite').replaceAll("'", "''")}'`) } finally { source.close() }
      const target = new DatabaseSync(path.join(stage, 'database.sqlite'))
      try { for (const table of ['core_recovery_objects', 'core_recovery_chunks', 'core_recovery_lock']) target.exec('DELETE FROM ' + table) } finally { target.close() }
      fs.mkdirSync(path.join(stage, 'objects'))
      const index = fs.openSync(path.join(stage, 'objects.jsonl'), 'wx')
      try {
        for (const file of walk(objects)) {
          const key = safePath(path.relative(objects, file).replaceAll(path.sep, '/')), output = path.join(stage, 'objects', key)
          fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(file, output)
          const sha256 = hash(output)
          if (hash(file) !== sha256) throw new Error('An object changed during backup')
          fs.writeSync(index, JSON.stringify({ key, size: fs.statSync(output).size, sha256, ...Object.fromEntries(Object.entries(metadata[key] || {}).filter(([key]) => ['httpMetadata', 'customMetadata'].includes(key))) }) + '\n')
        }
      } finally { fs.closeSync(index) }
      if (configuration) { fs.mkdirSync(path.join(stage, 'configuration')); copyTree(path.resolve(configuration), path.join(stage, 'configuration')) }
      const tables = checkDatabase(path.join(stage, 'database.sqlite'), path.join(stage, 'objects')), files = {}
      for (const file of walk(stage)) files[path.relative(stage, file).replaceAll(path.sep, '/')] = { size: fs.statSync(file).size, sha256: hash(file) }
      const manifest = { format: 'WikiCambada Core recovery', formatVersion: 1, databaseSchema: 17, schemaHash: expectedSchema(), tables, files }
      writeJson(path.join(stage, 'manifest.json'), manifest)
      fs.renameSync(stage, destination)
      return manifest
    } finally { removeWithin(path.dirname(destination), directory) }
  })
}
export async function validateArchive(archive) {
  archive = path.resolve(archive); checkAncestors(archive)
  const manifest = readJson(path.join(archive, 'manifest.json')), files = manifest.files
  if (manifest.format !== 'WikiCambada Core recovery' || manifest.formatVersion !== 1 || manifest.schemaHash !== expectedSchema() || manifest.databaseSchema !== 17) throw new Error('Incompatible backup format or schema')
  if (!files || !Object.hasOwn(files, 'database.sqlite') || !Object.hasOwn(files, 'objects.jsonl') || new Set(Object.keys(files).map(name => name.toLowerCase())).size !== Object.keys(files).length) throw new Error('Incomplete or conflicting recovery manifest')
  const actual = walk(archive).map(file => path.relative(archive, file).replaceAll(path.sep, '/')).filter(name => name !== 'manifest.json')
  if (actual.length !== Object.keys(files).length || actual.some(name => !Object.hasOwn(files, name))) throw new Error('Missing or unlisted files in the backup')
  for (const [name, record] of Object.entries(files)) { const file = path.join(archive, safePath(name)); if (fs.statSync(file).size !== record.size || hash(file) !== record.sha256) throw new Error(`Corrupt file: ${name}`) }
  const indexed = new Set()
  for await (const item of jsonLines(path.join(archive, 'objects.jsonl'))) {
    safePath(item.key)
    const registered = files['objects/' + item.key]
    if (indexed.has(item.key) || !registered || registered.size !== item.size || registered.sha256 !== item.sha256) throw new Error('Inconsistent object inventory')
    indexed.add(item.key)
  }
  if (indexed.size !== Object.keys(files).filter(name => name.startsWith('objects/')).length) throw new Error('Incomplete object inventory')
  const tables = checkDatabase(path.join(archive, 'database.sqlite'), path.join(archive, 'objects'))
  if (Object.keys(tables).length !== Object.keys(manifest.tables || {}).length || Object.entries(tables).some(([key, value]) => manifest.tables[key] !== value)) throw new Error('Inconsistent database counts')
  return manifest
}
export async function restoreLocal(archive, destination) {
  archive = path.resolve(archive); destination = path.resolve(destination)
  if (fs.existsSync(destination) || destination === archive || inside(archive, destination)) throw new Error('Restore requires a new, empty destination')
  const manifest = await validateArchive(archive)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  return operationLock(path.dirname(destination), async () => {
    const directory = fs.mkdtempSync(path.join(path.dirname(destination), '.wiki-restore-')), stage = path.join(directory, 'installation')
    try { fs.mkdirSync(stage); copyTree(archive, stage); await validateArchive(stage); fs.renameSync(stage, destination); return manifest } finally { removeWithin(path.dirname(destination), directory) }
  })
}
