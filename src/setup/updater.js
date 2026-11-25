import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { isDeepStrictEqual } from 'node:util'
import vendor from './vendor.cjs'
import { readJson, writeJson, hash, safePath, inside, checkAncestors, walk, copyTree, removeWithin, operationLock, IGNORE, decodeBase64 } from './files.js'

export const PRESERVE = ['src/config', 'src/media/branding', 'src/media/fonts', 'src/data/wiki-icons.json', '.dev.vars', 'wrangler.toml']
export const isPreserved = name => [...PRESERVE, 'package.json', 'package-lock.json'].some(item => name === item || name.startsWith(item + '/'))
export function installationAssets(project) {
  const branding = project.config().branding || {}, output = new Set()
  function add(value) {
    if (typeof value !== 'string' || /^[a-z]+:|^\/\//i.test(value)) return
    const relative = value.replace(/^\//, '').replace(/^\.\//, '')
    try { safePath(relative); if (fs.statSync(project.file(relative)).isFile()) output.add(relative) } catch {}
  }
  for (const key of ['logo', 'logoMobile', 'logoDark', 'favicon', 'coreIcon', 'coreWordmark', 'poweredByBadge', 'randomIconManifest']) add(branding[key])
  const relative = String(branding.randomIconManifest || '').replace(/^\//, '').replace(/^\.\//, '')
  if (output.has(relative)) { const manifest = project.read(relative); add(manifest.fallback); for (const icon of Array.isArray(manifest.icons) ? manifest.icons : []) add(icon) }
  for (const name of legacyAssets(project)) add(name)
  return output
}
function legacyAssets(project) {
  const assets = project.installation().legacyMigration?.preservedAssets
  return Array.isArray(assets) ? assets.filter(name => typeof name === 'string' && /^src\/media\/(?:images|fonts|branding)\//.test(name)) : []
}
export function versionTuple(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc|r)(?:[.-]?(\d+))?)?$/.exec(String(value || ''))
  if (!match) throw new Error('versão não suportada')
  return [+match[1], +match[2], +match[3], { alpha: 0, beta: 1, rc: 2, r: 4 }[match[4]] ?? 3, +(match[5] || 0)]
}
export function compareVersions(a, b) { const first = versionTuple(a), second = versionTuple(b); for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return first[i] - second[i]; return 0 }
export async function extractZip(archive, target) {
  const bundle = await new Promise((resolve, reject) => vendor.yauzl.open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => error ? reject(error) : resolve(zip)))
  const entries = [], seen = new Set(); let size = 0
  try {
    await new Promise((resolve, reject) => {
      bundle.on('error', reject); bundle.on('end', resolve)
      bundle.on('entry', entry => {
        try {
          const name = safePath(entry.fileName.replace(/\/$/, '')), key = name.toLowerCase(), mode = entry.externalFileAttributes >>> 16, type = mode & 0o170000
          if (seen.has(key) || (type && ![0o100000, 0o040000].includes(type))) throw new Error('o ZIP contém caminhos duplicados ou tipos de arquivo não permitidos')
          seen.add(key); entries.push(entry)
          size += entry.uncompressedSize
          if (entries.length > 5000 || size > 256 * 1024 * 1024) throw new Error('o ZIP excede os limites permitidos')
          bundle.readEntry()
        } catch (error) { reject(error) }
      })
      bundle.readEntry()
    })
  } finally { bundle.close() }
  const zip = await new Promise((resolve, reject) => vendor.yauzl.open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, value) => error ? reject(error) : resolve(value)))
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve)
      zip.on('entry', async entry => {
        try {
          const name = safePath(entry.fileName.replace(/\/$/, '')), file = path.join(target, name)
          if (!inside(target, file)) throw new Error('caminho inválido')
          checkAncestors(file)
          if (entry.fileName.endsWith('/')) fs.mkdirSync(file, { recursive: true })
          else {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value)))
            let bytes = 0
            await pipeline(stream, new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > entry.uncompressedSize ? new Error('tamanho ZIP inválido') : null, chunk) } }), fs.createWriteStream(file, { flags: 'wx', mode: (entry.externalFileAttributes >>> 16 & 0o777) || 0o600 }))
          }
          zip.readEntry()
        } catch (error) { reject(error) }
      }); zip.readEntry()
    })
  } finally { zip.close() }
}
export function releaseManifest(root) { return Object.fromEntries(walk(root, new Set([...IGNORE, '.wikicambada'])).filter(file => path.relative(root, file) !== 'wikicambada-files.json').map(file => [path.relative(root, file).replaceAll(path.sep, '/'), hash(file)])) }
export function validateRelease(project, source, release = readJson(path.join(source, 'wikicambada-release.json'))) {
  if (release.product !== 'WikiCambada Core' || !release.version) throw new Error('o manifesto não pertence ao WikiCambada Core ou não informa a versão')
  versionTuple(release.version)
  const current = project.installation().coreVersion
  if (current && release.minimumUpgradeableVersion && compareVersions(current, release.minimumUpgradeableVersion) < 0) throw new Error('esta atualização exige WikiCambada Core ' + release.minimumUpgradeableVersion + ' ou superior')
  if (current && compareVersions(release.version, current) < 0) throw new Error('o pacote selecionado é anterior à versão instalada')
  const manifestName = safePath(release.filesManifest), manifest = readJson(path.join(source, manifestName)), files = manifest.files || manifest, actual = Object.fromEntries(walk(source).filter(file => path.relative(source, file).replaceAll(path.sep, '/') !== manifestName).map(file => [path.relative(source, file).replaceAll(path.sep, '/'), hash(file)]))
  if (Object.keys(actual).some(name => name.split('/').some(part => IGNORE.has(part) || part === '.wikicambada'))) throw new Error('o pacote contém arquivos fora da distribuição')
  delete actual[manifestName]
  if (!Object.keys(files).length || Object.keys(actual).length !== Object.keys(files).length || Object.entries(files).some(([name, digest]) => { safePath(name); return actual[name] !== digest })) throw new Error('o pacote falhou na verificação de integridade: arquivos ausentes, não registrados ou hashes diferentes')
  const pkg = readJson(path.join(source, 'package.json')), lock = readJson(path.join(source, 'package-lock.json')), locked = lock.packages?.[''] || {}
  if ([pkg, lock, locked].some(record => record.version !== release.version)) throw new Error('versões divergentes entre a release, o pacote e o lockfile')
  if ([lock, locked].some(record => record.name !== pkg.name) || !isDeepStrictEqual(locked.devDependencies || {}, pkg.devDependencies || {}) || !isDeepStrictEqual(locked.engines || {}, pkg.engines || {})) throw new Error('o lockfile não corresponde ao pacote')
  const migrations = fs.readdirSync(path.join(source, 'src/data/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => 'src/data/migrations/' + name)
  if (!Number.isInteger(release.databaseSchema) || release.databaseSchema < 1 || migrations.length !== release.databaseSchema || JSON.stringify(migrations) !== JSON.stringify(release.migrations) || migrations.some((name, index) => !path.basename(name).startsWith(String(index + 1).padStart(4, '0') + '_'))) throw new Error('o schema não corresponde ao inventário de migrations')
  return release
}
export function modifiedCoreFiles(project) {
  const manifest = project.read('wikicambada-files.json'), protectedAssets = installationAssets(project)
  return Object.entries(manifest.files || manifest).filter(([name, expected]) => { safePath(name); return !isPreserved(name) && !protectedAssets.has(name) && (!fs.existsSync(project.file(name)) || hash(project.file(name)) !== expected) }).map(([name]) => name)
}
export function backupProject(project, target = project.file('.wikicambada/backups/' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID())) {
  checkAncestors(target)
  const files = walk(project.root, new Set([...IGNORE, '.wikicambada']))
  fs.mkdirSync(target, { recursive: true })
  for (const source of files) { const destination = path.join(target, path.relative(project.root, source)); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); fs.chmodSync(destination, fs.statSync(source).mode & 0o777) }
  return target
}
export function restoreBackup(project, source) {
  const backups = project.file('.wikicambada/backups')
  if (!inside(backups, source) || !fs.statSync(source).isDirectory()) throw new Error('backup fora do diretório de recuperação')
  walk(source); walk(project.root, new Set([...IGNORE, '.wikicambada']))
  for (const name of fs.readdirSync(project.root)) if (!IGNORE.has(name) && name !== '.wikicambada') removeWithin(project.root, project.file(name))
  copyTree(source, project.root)
}
export async function updateFromBase64(project, data, filename = 'update.zip', expectedSha256) {
  return operationLock(project.root, async () => {
    if (['update', 'configuration'].some(kind => fs.existsSync(project.file(`.wikicambada/${kind}-journal.json`)))) throw new Error('há uma operação interrompida; execute setup.js recover-local antes de continuar')
    const bytes = decodeBase64(data, 64 * 1024 * 1024)
    if (expectedSha256 !== undefined && (!/^[a-f0-9]{64}$/i.test(expectedSha256) || createHash('sha256').update(bytes).digest('hex') !== expectedSha256.toLowerCase())) throw new Error('o ZIP não corresponde ao hash confiável informado')
    const modifications = modifiedCoreFiles(project)
    if (modifications.length) throw new Error('há alterações locais no Core; resolva os conflitos antes de atualizar: ' + modifications.slice(0, 20).join(', '))
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wikicambada-update-'))
    try {
      const archive = path.join(temporary, 'update.zip'), extracted = path.join(temporary, 'extracted')
      fs.writeFileSync(archive, bytes); fs.mkdirSync(extracted); await extractZip(archive, extracted)
      const children = fs.readdirSync(extracted).filter(name => !IGNORE.has(name)); let source = extracted
      if (children.length === 1 && fs.statSync(path.join(extracted, children[0])).isDirectory() && fs.existsSync(path.join(extracted, children[0], 'index.html'))) source = path.join(extracted, children[0])
      const release = validateRelease(project, source), previousManifest = project.read('wikicambada-files.json'), previousFiles = previousManifest.files || previousManifest, protectedAssets = installationAssets(project), localPackage = project.read('package.json'), config = project.config()
      for (const file of walk(source)) {
        const relative = path.relative(source, file).replaceAll(path.sep, '/')
        if (fs.existsSync(project.file(relative)) && !isPreserved(relative) && !protectedAssets.has(relative) && !Object.hasOwn(previousFiles, relative) && !['wikicambada-files.json', 'wikicambada-release.json'].includes(relative)) throw new Error('arquivo da instalação em conflito com o pacote: ' + relative)
      }
      const backup = backupProject(project), stateFile = project.file('.wikicambada/state.json'), state = fs.existsSync(stateFile) ? fs.readFileSync(stateFile).toString('base64') : null
      project.write('.wikicambada/update-journal.json', { backup: path.relative(project.root, backup).replaceAll(path.sep, '/'), state })
      try {
        for (const file of walk(source)) {
          const relative = path.relative(source, file).replaceAll(path.sep, '/')
          if (isPreserved(relative) || protectedAssets.has(relative)) continue
          const destination = project.file(relative); checkAncestors(destination); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination); fs.chmodSync(destination, fs.statSync(file).mode & 0o777)
        }
        const nextManifest = project.read('wikicambada-files.json').files || {}
        const retained = legacyAssets(project).filter(name => protectedAssets.has(name))
        if (retained.some(name => Object.hasOwn(nextManifest, name))) {
          for (const name of retained) delete nextManifest[name]
          project.write('wikicambada-files.json', { files: nextManifest })
        }
        for (const name of Object.keys(previousFiles)) {
          const obsolete = name === 'setup.py' || /^src\/(?:__init__\.py|setup\/(?:__init__\.py|backend\/(?:__init__|app|project|updater|locking|recovery|remote_recovery|distribution)\.py)|tests\/(?:__init__|test_setup|test_stabilization|test_migrations|test_recovery)\.py)$/.test(name)
          if (obsolete && !Object.hasOwn(nextManifest, name) && fs.existsSync(project.file(name))) { checkAncestors(project.file(name)); fs.unlinkSync(project.file(name)) }
        }
        const pkg = readJson(path.join(source, 'package.json')), lock = readJson(path.join(source, 'package-lock.json'))
        pkg.name = localPackage.name || pkg.name; pkg.private = localPackage.private ?? pkg.private
        for (const name of ['deploy', 'db:migrations:apply:local', 'db:migrations:apply:remote']) if (localPackage.scripts?.[name]) pkg.scripts[name] = localPackage.scripts[name]
        pkg.scripts.deploy = pkg.scripts.deploy.replace(/pages deploy \.(?:\/)?(?=\s|$)/g, 'pages deploy .wikicambada/public')
        Object.assign(lock, { name: pkg.name, version: pkg.version }); Object.assign(lock.packages[''], { name: pkg.name, version: pkg.version })
        project.write('package.json', pkg); project.write('package-lock.json', lock)
        const installation = { ...project.installation(), coreVersion: release.version, configSchema: release.configSchema, requiredDatabaseSchema: release.databaseSchema, lastUpdatedAt: new Date().toISOString() }
        project.write('src/config/installation.json', installation)
        project.generateWrangler(config)
        const verification = project.verify()
        if (!verification.ok) throw new Error('a verificação pós-atualização falhou')
        project.write('.wikicambada/state.json', { managedBy: 'WikiCambada Core setup', coreVersion: release.version, configSchema: installation.configSchema, databaseSchema: installation.databaseSchema, lastUpdatedAt: installation.lastUpdatedAt })
        fs.unlinkSync(project.file('.wikicambada/update-journal.json'))
        return { ok: true, version: release.version, backup, verification, release, modifiedFilesBeforeUpdate: modifications }
      } catch (error) {
        restoreBackup(project, backup)
        if (state === null) fs.rmSync(stateFile, { force: true }); else fs.writeFileSync(stateFile, Buffer.from(state, 'base64'))
        fs.unlinkSync(project.file('.wikicambada/update-journal.json')); throw error
      }
    } finally { removeWithin(os.tmpdir(), temporary) }
  })
}
export async function recoverInterrupted(project) {
  return operationLock(project.root, async () => {
    const update = project.file('.wikicambada/update-journal.json'), configure = project.file('.wikicambada/configuration-journal.json')
    if (!fs.existsSync(update) && !fs.existsSync(configure)) return { ok: true, recovered: false }
    const savedCurrent = backupProject(project)
    if (fs.existsSync(update)) {
      const record = readJson(update), backup = project.file(safePath(record.backup))
      const state = record.state === null ? null : record.state === '' ? Buffer.alloc(0) : decodeBase64(record.state, 1024 * 1024)
      checkAncestors(project.file('.wikicambada/state.json'))
      if (backup === savedCurrent) throw new Error('backup de recuperação inválido')
      restoreBackup(project, backup)
      if (state === null) fs.rmSync(project.file('.wikicambada/state.json'), { force: true }); else fs.writeFileSync(project.file('.wikicambada/state.json'), state)
      fs.unlinkSync(update)
    }
    if (fs.existsSync(configure)) {
      const record = readJson(configure), values = Object.entries(record.files || {}).map(([name, content]) => {
        safePath(name)
        if (!isPreserved(name) && name !== '.wikicambada/state.json') throw new Error('arquivo fora do escopo de configuração')
        checkAncestors(project.file(name)); return [project.file(name), content === null ? null : content === '' ? Buffer.alloc(0) : decodeBase64(content, 16 * 1024 * 1024)]
      })
      if (!values.length) throw new Error('registro de recuperação inválido')
      for (const [file, content] of values) { if (content === null) fs.rmSync(file, { force: true }); else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) } }
      fs.unlinkSync(configure)
    }
    return { ok: true, recovered: true, savedCurrent }
  })
}
