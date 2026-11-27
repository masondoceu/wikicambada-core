import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { Project } from '../setup/project.js'
import { buildPackage } from '../setup/distribution.js'
import { extractZip, updateFromBase64 } from '../setup/updater.js'
import { inspectLegacy, migrateLegacy } from '../setup/legacy.js'
import { startServer } from '../setup/server.js'
import { hash, removeWithin, walk } from '../setup/files.js'
import vendor from '../setup/vendor.cjs'

const core = new Project()
const tmp = fs.realpathSync(os.tmpdir())
const work = fs.mkdtempSync(path.join(tmp, 'wiki-legacy-tests-'))
const coreZip = path.join(work, 'core.zip')
test.before(() => buildPackage(coreZip, core))
test.after(() => removeWithin(tmp, work))

const logo = 'src/media/images/core/cat-guard.png'
const collision = 'src/media/images/poweredby-wikicambada-core.png'
const stateFile = '.wrangler/state/d1/fixture.sqlite'
const customCode = 'functions/extra.ts'
const bindings = {
  name: 'legacy-fixture',
  compatibility_date: '2026-06-22',
  pages_build_output_dir: '.',
  vars: { WIKI_CORE_VERSION: 'v1.0.13', PUBLIC_BASE_URL: 'https://legacy.example.test', ACCESS_STRICT: 'true', ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'fixture-audience', CUSTOM: 'fixture-integration' },
  d1_databases: [{ binding: 'DB', database_name: 'legacy-fixture-db', database_id: '00000000-0000-0000-0000-000000000013', preview_database_id: '00000000-0000-0000-0000-000000000014', migrations_dir: 'src/data/migrations', migrations_table: 'd1_migrations' }],
  r2_buckets: [{ binding: 'WIKI_BUCKET', bucket_name: 'legacy-fixture-r2' }, { binding: 'OTHER', bucket_name: 'legacy-other-fixture' }]
}

function fixture() {
  const root = fs.mkdtempSync(path.join(work, 'source-'))
  const write = (name, data) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
  }
  write('package.json', '{"name":"legacy-fixture","version":"1.0.13"}')
  write('package-lock.json', 'invalid historical lock')
  write('wrangler.toml', vendor.toml.stringify(bindings))
  write('.dev.vars', 'DISCORD_EDIT_WEBHOOK_URL=https://example.invalid/fixture\n')
  write('.dev.vars.example', 'EXAMPLE=legacy\n')
  write('.dev.vars.preview', 'PREVIEW_ONLY=fixture\n')
  write('src/scripts/core/config.js', "export const APP_VERSION = 'v1.0.13'\nexport const SLOGAN = 'Fixture tagline'\nexport const HOME_SLUG = 'inicio'\nexport const DEFAULT_RANDOM_SLUGS = [HOME_SLUG, 'guia']")
  write('index.html', `<html lang="pt-BR"><title>Wiki de teste</title>
    <nav aria-label="Menu principal"><a href="/">Início</a><a href="/wiki/paginas-recentes">Recentes</a></nav>
    <nav aria-label="Comunidade"><a href="/wiki/sobre-o-teste">Sobre a Wiki</a><a href="/wiki/guia">Guia</a></nav>
    <nav aria-label="Ferramentas"><a href="/admin">Admin</a><a href="https://example.invalid/">Comunidade</a></nav>
    <nav data-account-links><a href="/wiki/guia">Guia</a></nav></html>`)
  write('src/styles/wiki.css', ":root { --sans: Arial; --serif: Georgia; --primary-bg: #336699; }")
  write('src/scripts/random-icon.js', "const manifestUrl = '/src/data/wiki-icons.json'\nconst fallbackIcon = '/" + logo + "'")
  write('src/data/wiki-icons.json', JSON.stringify({ icons: ['./' + logo], fallback: './' + logo }))
  write('src/scripts/renderers/wiki-renderer.js', '<img src="/' + logo + '" alt="Powered by WikiCambada Core">')
  write('functions/api/_lib/access.ts', "const SUPER_ADMIN_EMAIL = 'owner@example.invalid'")
  write('functions/api/_lib/d1.ts', "const FINAL_ALPHA_SUPER_ADMIN = 'owner@example.invalid'")
  write(customCode, 'throw new Error("never run this code")')
  for (const name of ['src/scripts/app.js', 'functions/_middleware.ts', 'functions/api/health.ts', 'functions/api/pages/[[slug]].ts', 'functions/api/upload/[[key]].ts']) write(name, fs.readFileSync(core.file(name)))
  write('src/data/extra.json', 'private fixture')
  write(stateFile, 'opaque local fixture')
  write(logo, fs.readFileSync(core.file(collision)))
  write(collision, fs.readFileSync(core.file(logo)))
  for (const name of core.release().migrations.slice(0, 14)) write(name, fs.readFileSync(core.file(name)))
  return root
}

async function archive(source) {
  const file = path.join(work, path.basename(source) + '.zip')
  const zip = new vendor.yazl.ZipFile()
  const done = pipeline(zip.outputStream, fs.createWriteStream(file))
  for (const name of walk(source)) zip.addFile(name, 'legacy/' + path.relative(source, name).split(path.sep).join('/'))
  zip.end()
  await done
  return file
}

test('Directory migration preserves configuration and colliding assets during a regular update', async () => {
  const source = fixture(), destination = path.join(work, 'migrated-folder')
  const before = walk(source).map(file => [file, hash(file)])
  const result = await migrateLegacy(core, { source, destination })
  const migrated = new Project(destination)
  const saved = vendor.toml.parse(fs.readFileSync(migrated.file('wrangler.toml'), 'utf8'))
  assert.deepEqual(saved.d1_databases.map(item => ({ ...item })), bindings.d1_databases)
  assert.deepEqual(Object.fromEntries(saved.r2_buckets.map(item => [item.binding, item.bucket_name])), Object.fromEntries(bindings.r2_buckets.map(item => [item.binding, item.bucket_name])))
  assert.equal(saved.vars.ACCESS_AUD, bindings.vars.ACCESS_AUD)
  assert.equal(saved.vars.CUSTOM, bindings.vars.CUSTOM)
  assert.equal(saved.vars.WIKI_INITIAL_CONTENT, undefined)
  assert.equal(saved.pages_build_output_dir, '.wikicambada/public')
  assert.equal(migrated.config().site.name, 'Wiki de teste')
  assert.deepEqual(migrated.config().site.randomFallbackSlugs, ['inicio', 'guia'])
  assert.equal(migrated.config().site.aboutSlug, 'sobre-o-teste')
  assert.equal(migrated.config().access.superAdminEmail, 'owner@example.invalid')
  assert.equal(migrated.installation().databaseSchema, null)
  assert.equal(result.requiredDatabaseSchema, 17)
  assert.equal(result.hasLocalState, true)
  assert.ok(result.modifiedCode.includes(customCode))
  assert.ok(result.archivedFiles.includes('src/data/extra.json'))
  assert.ok(!fs.existsSync(migrated.file(customCode)))
  for (const name of ['.dev.vars', '.dev.vars.preview', logo, collision]) assert.equal(hash(migrated.file(name)), hash(path.join(source, name)))
  for (const name of [customCode, 'src/data/extra.json', stateFile, 'package-lock.json', '.dev.vars.example']) assert.equal(hash(migrated.file(result.backup + '/' + name)), hash(path.join(source, name)))
  assert.doesNotMatch(fs.readFileSync(migrated.file('.wikicambada/public/src/config/site.json'), 'utf8'), /owner@example|fixture-audience|local fixture/)
  for (const name of walk(migrated.file('.wikicambada/public'))) assert.doesNotMatch(path.relative(migrated.file('.wikicambada/public'), name), /\.dev\.vars|installation\.json|backups|extra\.json|legacy-migration/)
  assert.equal(migrated.verify().ok, true)
  assert.equal(migrated.read('wikicambada-files.json').files[collision], undefined)
  await migrated.save({ config: { site: { shortName: 'Wiki teste' } } })
  await updateFromBase64(migrated, fs.readFileSync(coreZip).toString('base64'), 'core.zip', hash(coreZip))
  assert.equal(migrated.verify().ok, true)
  assert.equal(hash(migrated.file(collision)), hash(path.join(source, collision)))
  assert.equal(migrated.read('wikicambada-files.json').files[collision], undefined)
  assert.deepEqual(walk(source).map(file => [file, hash(file)]), before)
})

test('Local setup accepts a source ZIP and requires a token for migration', async () => {
  const source = fixture(), zip = await archive(source), destination = path.join(work, 'migrated-zip')
  const server = await startServer({ project: core, port: 0, openBrowser: false })
  try {
    const endpoint = server.origin + '/api/migrate-legacy'
    const headers = { 'content-type': 'application/json' }
    const body = JSON.stringify({ file: { data: fs.readFileSync(zip).toString('base64') }, destination })
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body })).status, 403)
    assert.ok(!fs.existsSync(destination))
    const response = await fetch(endpoint, { method: 'POST', headers: { ...headers, 'x-setup-token': server.token }, body })
    const result = await response.json()
    assert.equal(response.status, 200, result.error)
    assert.equal(result.sourceVersion, '1.0.13')
    assert.equal(new Project(destination).verify().ok, true)
    const spare = new Project(path.join(work, 'core-copy'))
    fs.mkdirSync(spare.root)
    await extractZip(coreZip, spare.root)
    await assert.rejects(updateFromBase64(spare, fs.readFileSync(zip).toString('base64')), /does not identify WikiCambada Core/)
  } finally {
    await server.shutdown()
    await server.closed
  }
})

test('Migration rejects invalid sources, nonempty destinations and overlapping paths', async () => {
  const source = fixture(), destination = path.join(work, 'not-created')
  await assert.rejects(migrateLegacy(core, { source, destination: path.join(source, 'unsafe') }), /outside both the Core and the source/)
  await assert.rejects(migrateLegacy(core, { source, destination: core.file('unsafe') }), /outside both the Core and the source/)
  await assert.rejects(migrateLegacy(core, { source, destination: work }), /outside both the Core and the source/)
  const occupied = path.join(work, 'occupied')
  fs.mkdirSync(occupied)
  fs.writeFileSync(path.join(occupied, 'keep.txt'), 'preserve')
  await assert.rejects(migrateLegacy(core, { source, destination: occupied }), /new directory/)
  assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'preserve')
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"1.0.12"}')
  assert.throws(() => inspectLegacy(source, core), /1\.0\.13/)
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"1.0.13"}')
  fs.unlinkSync(path.join(source, 'functions/api/health.ts'))
  assert.throws(() => inspectLegacy(source, core), /Incomplete legacy installation/)
  fs.copyFileSync(core.file('functions/api/health.ts'), path.join(source, 'functions/api/health.ts'))
  fs.appendFileSync(path.join(source, core.release().migrations[0]), '\nSELECT 1;')
  await assert.rejects(migrateLegacy(core, { source, destination }), /Legacy migration does not match/)
  await assert.rejects(migrateLegacy(core, { file: { data: Buffer.from('not a zip').toString('base64') }, destination }))
  assert.ok(!fs.existsSync(destination))
  assert.ok(!fs.readdirSync(path.join(work, '.wikicambada')).some(name => name.startsWith('legacy-migration-')))
})

test('A publication failure leaves no partial destination and allows retries', async t => {
  const source = fixture(), destination = path.join(work, 'retry')
  const rename = fs.renameSync
  const mock = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === destination) throw new Error('test interruption')
    return rename(from, to)
  })
  try { await assert.rejects(migrateLegacy(core, { source, destination }), /test interruption/) }
  finally { mock.mock.restore() }
  assert.ok(!fs.existsSync(destination))
  assert.ok(!fs.readdirSync(path.join(work, '.wikicambada')).some(name => name.startsWith('legacy-migration-')))
  assert.equal((await migrateLegacy(core, { source, destination })).ok, true)
})

test('Forced termination releases the lock and allows another migration', { timeout: 90000 }, async () => {
  const source = fixture(), destination = path.join(work, 'after-interruption')
  const script = `
    import fs from 'node:fs';
    import { Project } from './src/setup/project.js';
    import { migrateLegacy } from './src/setup/legacy.js';
    const [source, destination] = process.argv.slice(1);
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === destination) {
        fs.writeSync(1, 'ready');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      return rename(from, to);
    };
    await migrateLegacy(new Project(), { source, destination });
  `
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, source, destination], { stdio: ['ignore', 'pipe', 'ignore'] })
  const exited = once(child, 'exit')
  try {
    assert.equal(await Promise.race([once(child.stdout, 'data', { signal: AbortSignal.timeout(60000) }).then(([data]) => String(data)), exited.then(() => 'exited')]), 'ready')
  } finally {
    child.kill()
    await exited
  }
  assert.ok(!fs.existsSync(destination))
  assert.ok(fs.readdirSync(path.join(work, '.wikicambada')).some(name => name.startsWith('legacy-migration-')))
  assert.equal((await migrateLegacy(core, { source, destination })).ok, true)
})
