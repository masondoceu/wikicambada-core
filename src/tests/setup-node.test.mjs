import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { Project, genericConfig, validateConfig } from '../setup/project.js'
import { buildPackage } from '../setup/distribution.js'
import { extractZip, updateFromBase64, backupProject, recoverInterrupted, versionTuple, compareVersions, validateRelease, releaseManifest, installationAssets } from '../setup/updater.js'
import { backupLocal, restoreLocal, validateArchive, expectedSchema, initializeDatabase } from '../setup/recovery.js'
import { hash, writeJson, operationLock, safePath, removeWithin } from '../setup/files.js'
import vendor from '../setup/vendor.cjs'
import { spawn, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-node-tests-'))
const archive = path.join(directory, 'core.zip')
await buildPackage(archive)
const encoded = fs.readFileSync(archive).toString('base64')
test.after(() => removeWithin(os.tmpdir(), directory))
async function fixture() { const root = fs.mkdtempSync(path.join(directory, 'installation-')); await extractZip(archive, root); return new Project(root) }
function startProcess(command, args, options) {
  const child = spawn(command, args, { cwd: directory, windowsHide: true, ...options })
  let output = ''
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal, output })) })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('processo não iniciou: ' + output)), 15000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', () => { clearTimeout(timer); reject(new Error('processo encerrou antes de iniciar: ' + output)) })
    child.stdout.on('data', chunk => { output += chunk; if (/locked|WikiCambada Core setup: http/.test(output)) { clearTimeout(timer); resolve(output) } })
    child.stderr.on('data', chunk => { output += chunk })
  })
  return { child, ready, exited }
}

test('Node setup creates and reconfigures installations while preserving settings, data and identity', async () => {
  const project = await fixture()
  let result = await project.save({ intent: 'new', preset: 'private', config: { site: { name: 'New Wiki' }, features: { cloudflareBadge: false } } })
  assert.equal(result.config.features.cloudflareBadge, false)
  assert.equal(result.config.access.mode, 'private')
  assert.equal(result.installation.databaseSchema, null)
  assert.ok(result.config.initialContent.id)
  const id = result.config.initialContent.id
  result = await project.save({ config: { site: { tagline: 'Changed' } } })
  assert.equal(result.config.initialContent.id, id)
  assert.equal(result.config.features.cloudflareBadge, false)
  assert.equal(project.verify().ok, true)
})
test('Node setup preserves unknown TOML settings and does not reuse bindings for a new wiki', async () => {
  const project = await fixture(), file = project.file('wrangler.toml')
  let toml = vendor.toml.parse(fs.readFileSync(file, 'utf8'))
  toml.vars.CUSTOM = 'retained'; toml.d1_databases[0].database_id = '11111111-1111-1111-1111-111111111111'
  toml.r2_buckets.push({ binding: 'OTHER', bucket_name: 'other' }); fs.writeFileSync(file, vendor.toml.stringify(toml))
  await project.save({ config: {} })
  toml = vendor.toml.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(toml.vars.CUSTOM, 'retained'); assert.equal(toml.r2_buckets.length, 2)
  await project.save({ intent: 'new', config: {} })
  toml = vendor.toml.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(toml.vars.CUSTOM, undefined); assert.equal(toml.d1_databases[0].database_id, '')
})
test('Interrupted configuration rolls back all files and assets', async () => {
  const project = await fixture(), names = ['src/config/site.json', 'src/config/installation.json', 'wrangler.toml', 'package.json', 'package-lock.json'], before = names.map(name => fs.readFileSync(project.file(name)))
  project.generatePackage = () => { throw new Error('injected failure') }
  await assert.rejects(project.save({ config: { site: { name: 'Changed' } } }), /injected failure/)
  names.forEach((name, index) => assert.deepEqual(fs.readFileSync(project.file(name)), before[index]))
  assert.equal(fs.existsSync(project.file('.wikicambada/configuration-journal.json')), false)
})
test('The Node updater preserves colliding assets, settings, data and secrets', async () => {
  const project = await fixture(), logo = 'src/media/images/core/cat-guard.png'
  await project.save({ config: { branding: { logo: '/' + logo }, features: { cloudflareBadge: false } } })
  fs.writeFileSync(project.file(logo), 'custom logo')
  fs.writeFileSync(project.file('.dev.vars'), 'SECRET=fixture')
  fs.mkdirSync(project.file('src/data/custom')); fs.writeFileSync(project.file('src/data/custom/data.txt'), 'retained')
  const before = fs.readFileSync(project.file('src/config/site.json'))
  const result = await updateFromBase64(project, encoded, 'core.zip', hash(archive))
  assert.equal(result.ok, true); assert.equal(project.verify().ok, true)
  assert.deepEqual(fs.readFileSync(project.file('src/config/site.json')), before)
  assert.equal(fs.readFileSync(project.file(logo), 'utf8'), 'custom logo')
  assert.equal(fs.readFileSync(project.file('.dev.vars'), 'utf8'), 'SECRET=fixture')
  assert.equal(fs.readFileSync(project.file('src/data/custom/data.txt'), 'utf8'), 'retained')
})
test('Local modifications and trusted hash mismatches are rejected before backup', async () => {
  const project = await fixture()
  await assert.rejects(updateFromBase64(project, encoded, 'core.zip', '0'.repeat(64)), /trusted hash/)
  fs.writeFileSync(project.file('src/scripts/app.js'), 'local work')
  await assert.rejects(updateFromBase64(project, encoded), /Local Core files have changed/)
  assert.equal(fs.existsSync(project.file('.wikicambada/backups')), false)
})
test('The updater renames the managed README and restores its original case on failure', async () => {
  const project = await fixture()
  const manifest = project.read('wikicambada-files.json')
  const oldName = 'README.MD'
  fs.renameSync(project.file('README.md'), project.file('README.tmp'))
  fs.renameSync(project.file('README.tmp'), project.file(oldName))
  manifest.files[oldName] = manifest.files['README.md']
  delete manifest.files['README.md']
  delete manifest.files['readmes/README.pt-BR.md']
  fs.unlinkSync(project.file('readmes/README.pt-BR.md'))
  project.write('wikicambada-files.json', manifest)

  const verify = project.verify
  project.verify = () => ({ ok: false })
  await assert.rejects(updateFromBase64(project, encoded), /Post-update verification failed/)
  assert.ok(fs.readdirSync(project.root).includes(oldName))
  assert.equal(hash(project.file(oldName)), manifest.files[oldName])

  project.verify = verify
  const result = await updateFromBase64(project, encoded, 'core.zip', hash(archive))
  assert.ok(result.verification.ok)
  assert.ok(fs.readdirSync(project.root).includes('README.md'))
  assert.ok(!fs.readdirSync(project.root).includes(oldName))
  assert.ok(fs.existsSync(path.join(result.backup, oldName)))
  const files = project.read('wikicambada-files.json').files
  for (const name of ['README.md', 'readmes/README.pt-BR.md']) assert.equal(hash(project.file(name)), files[name])
})
test('A failure after copying rolls back and preserves local state', async () => {
  const project = await fixture(), before = fs.readFileSync(project.file('src/scripts/app.js'))
  project.write('.wikicambada/state.json', { fixture: true })
  project.verify = () => ({ ok: false })
  await assert.rejects(updateFromBase64(project, encoded), /Post-update verification failed/)
  assert.deepEqual(fs.readFileSync(project.file('src/scripts/app.js')), before)
  assert.deepEqual(project.read('.wikicambada/state.json'), { fixture: true })
})
test('Node recovery reads legacy update and configuration journals', async () => {
  const project = await fixture(), backup = backupProject(project), before = fs.readFileSync(project.file('src/scripts/app.js'))
  fs.writeFileSync(project.file('src/scripts/app.js'), 'interrupted')
  project.write('.wikicambada/update-journal.json', { backup: path.relative(project.root, backup).replaceAll(path.sep, '/'), state: null })
  const result = await recoverInterrupted(project)
  assert.equal(result.recovered, true); assert.deepEqual(fs.readFileSync(project.file('src/scripts/app.js')), before)
  assert.equal(fs.readFileSync(path.join(result.savedCurrent, 'src/scripts/app.js'), 'utf8'), 'interrupted')
  project.write('.wikicambada/configuration-journal.json', { files: { 'src/config/site.json': fs.readFileSync(project.file('src/config/site.json')).toString('base64'), '.dev.vars': '' } })
  assert.equal((await recoverInterrupted(project)).recovered, true)
  assert.equal(fs.readFileSync(project.file('.dev.vars')).length, 0)
})
test('The operation lock rejects concurrent work and releases after a failure', async () => {
  const project = await fixture()
  await operationLock(project.root, () => assert.rejects(operationLock(project.root, () => {}), /Another local operation/))
  await assert.rejects(operationLock(project.root, () => { throw new Error('interrupted') }), /interrupted/)
  await operationLock(project.root, () => {})
})
test('Version, navigation and path validation work across platforms', () => {
  const versions = ['1.1.0-alpha.2', '1.1.0-beta', '1.1.0-beta.2', '1.1.0-rc.1', '1.1.0', '1.1.0-r1', '1.1.0-r2', '1.1.1-indev.1', '1.1.1-indev.2', '1.1.1']
  assert.deepEqual([...versions].reverse().sort(compareVersions), versions)
  assert.throws(() => versionTuple('1.1.0-unknown'))
  for (const value of ['../x', 'a\\b', 'CON.txt', 'folder/name.', 'file:stream', 'a/../b']) assert.throws(() => safePath(value), /[Pp]ath/)
  const config = genericConfig(); config.navigation.external = [{ label: 'unsafe', href: 'javascript:alert(1)' }]
  assert.throws(() => validateConfig(config), /invalid URL/)
  config.navigation.external = []; config.cloudflare = { projectName: 'My Project; touch injected', databaseName: 'db && command', bucketName: 'Bucket With Spaces' }
  assert.deepEqual(validateConfig(config).cloudflare, { projectName: 'my-project-touch-injected', databaseName: 'db-command', bucketName: 'bucket-with-spaces' })
})
test('ZIP validation rejects symbolic links, duplicates and unlisted files', async () => {
  const project = await fixture(), release = project.release()
  fs.writeFileSync(project.file('unregistered.js'), 'bad')
  assert.throws(() => validateRelease(project, project.root, release), /integrity/)
  const zip = new vendor.yazl.ZipFile(), file = path.join(directory, 'unsafe.zip')
  const completed = new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject))
  zip.addBuffer(Buffer.from('link'), 'link', { mode: 0o120777 }); zip.end(); await completed
  const target = fs.mkdtempSync(path.join(directory, 'unsafe-'))
  await assert.rejects(extractZip(file, target), /file types/)
  assert.deepEqual(fs.readdirSync(target), [])
})
test('Full recovery preserves SQLite, history, profiles, objects and configuration', async () => {
  const root = fs.mkdtempSync(path.join(directory, 'recovery-')), database = path.join(root, 'source.sqlite'), objects = path.join(root, 'objects')
  fs.mkdirSync(path.join(objects, 'uploads'), { recursive: true }); fs.writeFileSync(path.join(objects, 'uploads/image.png'), 'original media')
  const db = new DatabaseSync(database)
  initializeDatabase(db)
  db.exec("INSERT INTO pages(id,slug,title,namespace,status,created_at,updated_at) VALUES ('p','alpha','Alpha','article','published','now','now'); INSERT INTO editor_profiles(id,email,role,status,created_at,updated_at) VALUES ('e','editor@example.com','admin','disabled','now','now'); INSERT INTO global_settings VALUES ('templates','false','now','editor@example.com'); INSERT INTO redirects(id,from_slug,to_slug,target_fragment,created_at) VALUES ('d','alias','alpha','section','now'); CREATE TABLE _cf_METADATA(key TEXT PRIMARY KEY, value TEXT); INSERT INTO _cf_METADATA VALUES ('local','retained')")
  for (let number = 1; number <= 3; number++) db.prepare('INSERT INTO revisions(id,page_id,revision_number,author_email,content_markdown,created_at,categories_json) VALUES (?,?,?,?,?,?,?)').run('r' + number, 'p', number, 'editor@example.com', 'content ' + number, 'now', '[]')
  db.exec("UPDATE pages SET current_revision_id = 'r2'")
  db.prepare("INSERT INTO uploads(id,r2_key,filename,mime_type,size_bytes,sha256,created_at,file_slug,status) VALUES ('u','uploads/image.png','image.png','image/png',14,?,'now','image','deleted')").run(hash(path.join(objects, 'uploads/image.png')))
  db.close()
  assert.equal(expectedSchema(), 'f7d8f277b16486741c68c0181f700056e9bfafb3708a903fbe321f6568175cf7')
  const archive = path.join(root, 'backup'), target = path.join(root, 'restored')
  const configuration = path.join(root, 'configuration'); fs.mkdirSync(configuration); writeJson(path.join(configuration, 'site.json'), genericConfig())
  const manifest = await backupLocal(database, objects, archive, configuration)
  assert.deepEqual(await restoreLocal(archive, target), manifest)
  const restored = new DatabaseSync(path.join(target, 'database.sqlite'))
  assert.equal(restored.prepare('SELECT status FROM editor_profiles').get().status, 'disabled')
  assert.equal(restored.prepare('SELECT current_revision_id FROM pages').get().current_revision_id, 'r2')
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM revisions').get().n, 3)
  assert.equal(restored.prepare('SELECT target_fragment FROM redirects').get().target_fragment, 'section')
  assert.equal(restored.prepare('SELECT value FROM _cf_METADATA').get().value, 'retained'); restored.close()
  assert.deepEqual(fs.readFileSync(path.join(target, 'configuration/site.json')), fs.readFileSync(path.join(configuration, 'site.json')))
  await assert.rejects(restoreLocal(archive, objects), /new, empty destination/)
  fs.unlinkSync(path.join(objects, 'uploads/image.png'))
  await assert.rejects(backupLocal(database, objects, path.join(root, 'missing')), /Missing or invalid upload object/)
  assert.equal(fs.existsSync(path.join(root, 'missing')), false)
  const incompatible = new DatabaseSync(database); incompatible.exec('CREATE TABLE custom_data (id TEXT)'); incompatible.close()
  await assert.rejects(backupLocal(database, objects, path.join(root, 'incompatible')), /schema is incompatible/)
  assert.equal(fs.readFileSync(path.join(target, 'objects/uploads/image.png'), 'utf8'), 'original media')
  fs.writeFileSync(path.join(archive, 'objects/uploads/image.png'), 'corrupt')
  await assert.rejects(validateArchive(archive), /Corrupt file/)
  await assert.rejects(restoreLocal(archive, path.join(root, 'failed')), /Corrupt file/)
  assert.equal(fs.existsSync(path.join(root, 'failed')), false)
})

test('Release contracts are checked even when hashes are valid', async () => {
  for (const [filename, change, message] of [
    ['package-lock.json', data => { data.version = '1.1.0-r1' }, /Version mismatch/],
    ['package-lock.json', data => { data.packages[''].devDependencies = {} }, /lockfile/],
    ['wikicambada-release.json', data => { data.databaseSchema = 16 }, /schema/],
    ['wikicambada-release.json', data => { data.migrations.pop() }, /schema/]
  ]) {
    const project = await fixture(), data = project.read(filename); change(data); project.write(filename, data)
    project.write('wikicambada-files.json', { files: releaseManifest(project.root) })
    assert.throws(() => validateRelease(project, project.root), message)
  }
  const project = await fixture()
  const [major, minor, patch] = project.release().version.split('-')[0].split('.').map(Number)
  project.write('src/config/installation.json', { coreVersion: `${major}.${minor}.${patch + 1}` })
  project.write('wikicambada-files.json', { files: releaseManifest(project.root) })
  assert.throws(() => validateRelease(project, project.root), /older than the installed version/)
})

test('Branding validates file signatures, preserves referenced assets and escapes TOML', async () => {
  const project = await fixture()
  for (const [type, content] of [['image/png', '<html>'], ['image/svg+xml', '<svg/>']]) assert.throws(() => project.decodeAsset({ type, data: Buffer.from(content).toString('base64') }, 'logo'), /do not match|Unsupported branding file format/)
  assert.throws(() => project.decodeAsset({ type: 'image/png', data: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64') }, 'logo'), /exceeds/)
  const config = genericConfig(); config.branding.logo = 'https://user:password@example.com/logo.png'
  assert.equal(validateConfig(config).branding.logo, genericConfig().branding.logo)
  await project.save({ config: { site: { name: 'Wiki"\nINJECTED = "value' } } })
  const toml = vendor.toml.parse(fs.readFileSync(project.file('wrangler.toml'), 'utf8'))
  assert.equal(toml.vars.WIKI_SITE_NAME, 'Wiki"\nINJECTED = "value'); assert.equal(toml.INJECTED, undefined)
  project.write('src/data/custom-icons.json', { icons: ['./src/media/images/core/cat-guard.png'] })
  project.write('src/config/site.json', { branding: { randomIconManifest: '/src/data/custom-icons.json' } })
  assert.deepEqual([...installationAssets(project)].sort(), ['src/data/custom-icons.json', 'src/media/images/core/cat-guard.png'])
})

test('ZIP files without type bits are accepted and ambiguous paths are rejected before extraction', async () => {
  async function zipped(name, entryName, mode = 0o600) {
    const zip = new vendor.yazl.ZipFile(), file = path.join(directory, name)
    const completed = new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject))
    zip.addBuffer(Buffer.from('valid'), entryName, { mode }); zip.end(); await completed; return file
  }
  const regular = await zipped('regular.zip', 'regular.txt'), target = fs.mkdtempSync(path.join(directory, 'regular-'))
  await extractZip(regular, target); assert.equal(fs.readFileSync(path.join(target, 'regular.txt'), 'utf8'), 'valid')
  for (const name of ['CON.txt', 'folder/name.', 'folder/name:stream']) {
    const file = await zipped('invalid-' + Math.random() + '.zip', name), empty = fs.mkdtempSync(path.join(directory, 'invalid-'))
    await assert.rejects(extractZip(file, empty), /[Pp]ath/); assert.deepEqual(fs.readdirSync(empty), [])
  }
  const file = await zipped('backslash.zip', 'folder/file.txt')
  fs.writeFileSync(file, Buffer.from(fs.readFileSync(file).toString('latin1').replaceAll('folder/file.txt', 'folder\\file.txt'), 'latin1'))
  await assert.rejects(extractZip(file, fs.mkdtempSync(path.join(directory, 'backslash-'))), /invalid characters|[Pp]ath/)
})

test('Badges, generic distribution and safe builds survive configuration and updates', async () => {
  const project = await fixture()
  const pkg = project.read('package.json'), lock = project.read('package-lock.json')
  assert.equal(pkg.name, 'wikicambada-core')
  assert.equal(lock.name, pkg.name)
  assert.equal(lock.packages[''].name, pkg.name)
  assert.deepEqual(project.config(), genericConfig())
  assert.equal(project.installation().databaseSchema, null)
  const wrangler = vendor.toml.parse(fs.readFileSync(project.file('wrangler.toml'), 'utf8'))
  for (const key of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'PUBLIC_BASE_URL', 'WIKI_SUPER_ADMIN_EMAIL']) assert.equal(wrangler.vars[key], '')
  assert.equal(wrangler.d1_databases[0].database_id, '')
  assert.equal(wrangler.d1_databases[0].preview_database_id, '')
  assert.equal(fs.existsSync(project.file('.wikicambada/state.json')), false)
  assert.equal(hash(project.file('src/media/images/protectedby-cloudflare.png')), '3d7b109fb7cd683025818d8c6d5224c565b0b2278099e666c15f7d2d8325067e')
  assert.equal(hash(project.file('src/media/images/built-with-cloudflare.svg')), 'd2163cf80414fef294990af0543ae2dc0c4e24bfd7706f28a5e803d548178e93')
  assert.equal(project.config().features.builtWithCloudflareBadge, false)
  for (const value of [false, true]) for (const built of [false, true]) {
    await project.save({ config: { features: { cloudflareBadge: value, builtWithCloudflareBadge: built } } })
    assert.equal(project.config().features.cloudflareBadge, value)
    assert.equal(project.config().features.builtWithCloudflareBadge, built)
    const features = JSON.parse(vendor.toml.parse(fs.readFileSync(project.file('wrangler.toml'), 'utf8')).vars.WIKI_FEATURES_JSON)
    assert.equal(features.cloudflareBadge, value)
    assert.equal(features.builtWithCloudflareBadge, built)
  }
  const legacy = project.config(); delete legacy.features.cloudflareBadge; delete legacy.features.builtWithCloudflareBadge; project.write('src/config/site.json', legacy)
  const saved = await project.save({ config: {} })
  assert.equal(saved.config.features.cloudflareBadge, true)
  assert.equal(saved.config.features.builtWithCloudflareBadge, false)
  assert.throws(() => validateConfig({ ...genericConfig(), features: { builtWithCloudflareBadge: 'true' } }), /must be a boolean/)
  for (const file of ['wrangler.toml', 'src/config/site.json']) assert.doesNotMatch(fs.readFileSync(project.file(file), 'utf8').toLowerCase(), /cambada\.party|cloudflareaccess\.com|national\.shitposting|heartbeat/)
  assert.equal(fs.existsSync(project.file('setup.py')), false)
  assert.ok(fs.existsSync(project.file('src/setup/vendor.cjs')))
  assert.doesNotMatch(fs.readFileSync(project.file('index.html'), 'utf8'), /\/cambada/)
  const { buildPublic } = await import('../scripts/build-public.mjs')
  const output = await buildPublic(project.root)
  for (const name of fs.readdirSync(output, { recursive: true })) assert.doesNotMatch(name, /setup|\.py$|\.zip$|\.dev.vars|state\.json|installation\.json|backups|migrations/)
})

test('The operating system releases the lock when the process crashes', async () => {
  const project = await fixture(), module = pathToFileURL(project.file('src/setup/files.js')).href
  const process = startProcess(globalThis.process.execPath, ['--input-type=module', '-e', `import { operationLock } from ${JSON.stringify(module)}; await operationLock(${JSON.stringify(project.root)}, async () => { console.log('locked'); await new Promise(() => setInterval(() => {}, 1000)) })`])
  try { await process.ready; await assert.rejects(operationLock(project.root, () => {}), /Another local operation/) }
  finally { process.child.kill(); await process.exited }
  await operationLock(project.root, () => {})
})

test('Node and launchers start outside the project directory and exit without installed dependencies', async () => {
  const project = new Project(path.join(directory, 'wiki com espaços ü')); fs.mkdirSync(project.root); await extractZip(archive, project.root)
  assert.equal(fs.existsSync(project.file('node_modules')), false)
  const verify = spawnSync(process.execPath, [project.file('setup.js'), 'verify'], { cwd: directory, encoding: 'utf8' })
  assert.equal(verify.status, 0, verify.stderr + verify.stdout)
  const launchers = [[process.execPath, [project.file('setup.js')]]]
  if (process.platform === 'win32') {
    launchers.push([process.env.ComSpec, ['/d', '/s', '/c', `""${project.file('setup.cmd')}" --no-browser --port 0"`], { windowsVerbatimArguments: true }])
    const bash = 'C:/Program Files/Git/bin/bash.exe'
    if (fs.existsSync(bash)) launchers.push([bash, [project.file('setup.sh')]])
  } else launchers.push(['sh', [project.file('setup.sh')]])
  for (const [command, initial, options] of launchers) {
    const args = command === process.env.ComSpec ? initial : [...initial, '--no-browser', '--port', '0']
    const running = startProcess(command, args, options)
    try {
      const output = await running.ready, origin = output.match(/WikiCambada Core setup: (http:\/\/[^\s]+)/)[1]
      const html = await (await fetch(origin)).text(), token = html.match(/name="setup-token" content="([a-f0-9]+)"/)[1]
      const response = await fetch(origin + '/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json', 'x-setup-token': token, origin }, body: '{}' })
      assert.equal(response.status, 200)
      const result = await Promise.race([running.exited, new Promise((_, reject) => setTimeout(() => reject(new Error('processo não encerrou')), 5000).unref())])
      assert.equal(result.code, 0, result.output)
      await assert.rejects(fetch(origin))
    } finally { if (running.child.exitCode === null) running.child.kill() }
  }
})
