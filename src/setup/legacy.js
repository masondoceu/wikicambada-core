import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { buildPublic } from '../scripts/build-public.mjs'
import { buildPackage } from './distribution.js'
import { checkAncestors, copyTree, decodeBase64, inside, operationLock, removeWithin, safePath, walk, IGNORE } from './files.js'
import { genericConfig, Project, validateConfig } from './project.js'
import { backupProject, extractZip, validateRelease } from './updater.js'
import vendor from './vendor.cjs'

const profile = JSON.parse(fs.readFileSync(new URL('./presets/legacy-1.0.13.json', import.meta.url), 'utf8'))
const version = '1.0.13'
const excluded = new Set([...IGNORE, '.wikicambada'])
const mediaPath = /^src\/media\/(?:images|fonts|branding)\/.+\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i
const ownerPatterns = {
  'functions/api/_lib/access.ts': /const SUPER_ADMIN_EMAIL\s*=\s*(['"])([^'"\r\n]+)\1/,
  'functions/api/_lib/d1.ts': /const FINAL_ALPHA_SUPER_ADMIN\s*=\s*(['"])([^'"\r\n]+)\1/
}
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/')
const digest = value => createHash('sha256').update(value).digest('hex')
const normalize = value => value.replace(/\r\n/g, '\n')
const overlaps = (a, b) => !path.relative(a, b) || inside(a, b) || inside(b, a)
const capture = (source, pattern) => source.match(pattern)?.[1] || ''

function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /^[/\\]{2}/.test(value)) throw new Error('informe um caminho local absoluto')
  const result = path.resolve(value)
  checkAncestors(result)
  return result
}

function inventory(root, ignored = excluded) {
  const files = walk(root, ignored)
  const lowerPaths = new Map()
  let bytes = 0
  for (const file of files) {
    bytes += fs.statSync(file).size
    const parts = safePath(relative(root, file)).split('/')
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0, i).join('/')
      const key = name.toLowerCase()
      if (lowerPaths.has(key) && lowerPaths.get(key) !== name) throw new Error('a origem contém caminhos que diferem apenas por maiúsculas')
      lowerPaths.set(key, name)
    }
  }
  if (files.length > 5000 || bytes > 256 * 1024 * 1024) throw new Error('a origem excede os limites da migração')
  return files.map(file => relative(root, file))
}

function htmlText(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
  return value.trim().replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, key) => entities[key])
}

function attribute(tag, name) {
  return capture(tag, new RegExp('\\s' + name + '="([^"]*)"','i')) || capture(tag, new RegExp("\\s" + name + "='([^']*)'",'i'))
}

function navigation(html) {
  const sections = {}
  const features = new Map([
    ['/wiki/todas-as-paginas', 'allPages'], ['/wiki/paginas-recentes', 'recentPages'],
    ['/wiki/categorias', 'categories'], ['/wiki/especial/versao', 'version']
  ])
  for (const [, attrs, content] of html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/gi)) {
    const section = { 'Menu principal': 'main', Comunidade: 'community', Ferramentas: 'external', 'Main navigation': 'main', Community: 'community', Tools: 'external' }[attribute(attrs, 'aria-label')]
    if (!section) continue
    sections[section] = []
    for (const [, link, label] of content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = htmlText(attribute(link, 'href'))
      if (section === 'external' && (attribute(link, 'data-chrome-link') || href === '/admin')) continue
      if (!label.trim() || /[<>]/.test(label) || !/^(?:\/(?!\/)|https?:\/\/)/i.test(href) || /[\\\x00-\x1f]/.test(href)) throw new Error('a navegação legada precisa de revisão')
      const special = features.get(href)
      const kind = /^https?:/i.test(href) ? 'external' : href === '/' ? 'home' : attribute(link, 'data-link') === 'random' ? 'random' : 'page'
      sections[section].push({ label: htmlText(label), href, kind, ...(kind === 'random' ? { feature: 'randomPage' } : special ? { feature: 'specialPages.' + special } : {}) })
    }
  }
  if (!sections.main?.some(link => link.kind === 'home') || !sections.community?.length) throw new Error('o menu da instalação legada está incompleto ou não é reconhecido')
  return { external: [], ...sections }
}

export function inspectLegacy(source, base) {
  const files = new Set(inventory(source))
  const requireFile = file => {
    if (!files.has(file)) throw new Error('a instalação legada está incompleta: ' + file)
    if (fs.statSync(path.join(source, file)).size > 4 * 1024 * 1024) throw new Error('um arquivo de configuração ou código excede o limite')
    return normalize(fs.readFileSync(path.join(source, file), 'utf8'))
  }
  if (['wikicambada-release.json', 'wikicambada-files.json', 'src/config/site.json', 'src/config/installation.json'].some(file => files.has(file))) throw new Error('esta instalação já usa configuração do Core; use o atualizador')
  for (const file of ['src/scripts/app.js', 'functions/_middleware.ts', 'functions/api/health.ts', 'functions/api/pages/[[slug]].ts', 'functions/api/upload/[[key]].ts']) {
    if (!files.has(file)) throw new Error('a instalação legada está incompleta: ' + file)
  }
  let pkg, wrangler
  try {
    pkg = JSON.parse(requireFile('package.json'))
    wrangler = vendor.toml.parse(requireFile('wrangler.toml'))
  } catch { throw new Error('arquivos de configuração da origem ausentes ou inválidos') }
  const constants = requireFile('src/scripts/core/config.js')
  if (pkg?.version !== version ||
      capture(constants, /export const APP_VERSION\s*=\s*['"]v([^'"]+)['"]/) !== version ||
      !['1.0.13', 'v1.0.13'].includes(wrangler.vars?.WIKI_CORE_VERSION)) throw new Error('apenas instalações legadas verificáveis da versão ' + version + ' são suportadas')

  const schema = base.release().migrations
  const names = [...files].filter(name => /^src\/data\/migrations\/.*\.sql$/i.test(name))
  if (!Array.isArray(schema) || names.length !== 14 || !schema.slice(0, 14).every(name => files.has(name))) throw new Error('inventário de migrations legadas incompatível')
  for (const name of schema.slice(0, 14)) {
    const sql = requireFile(name), hash = digest(sql)
    if (hash !== digest(normalize(fs.readFileSync(base.file(name), 'utf8'))) &&
      !(name.endsWith('/0009_template_system_v2.sql') && hash === profile.templateMigration)) throw new Error('migration legada divergente: ' + name)
  }

  const db = wrangler.d1_databases?.filter?.(item => item?.binding === 'DB')
  const bucket = wrangler.r2_buckets?.filter?.(item => item?.binding === 'WIKI_BUCKET')
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
  if (db?.length !== 1 || bucket?.length !== 1 || !uuid.test(db[0].database_id) ||
      db[0].preview_database_id && !uuid.test(db[0].preview_database_id) ||
      db[0].migrations_dir !== 'src/data/migrations' || db[0].migrations_table !== 'd1_migrations') throw new Error('bindings ou registro de migrations incompatíveis')
  if (Object.keys(wrangler).some(key => ['env', 'build', 'site', 'assets', 'main'].includes(key))) throw new Error('o Wrangler legado possui configuração de build ou ambientes que exigem revisão manual')
  let issuer
  try { issuer = new URL(wrangler.vars.ACCESS_TEAM_DOMAIN) } catch { throw new Error('configure o issuer e o audience do Access na origem da migração') }
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/' ||
      typeof wrangler.vars.ACCESS_AUD !== 'string' || !wrangler.vars.ACCESS_AUD.trim()) throw new Error('configure o issuer e o audience do Access na origem da migração')

  const html = requireFile('index.html'), stylesheet = requireFile('src/styles/wiki.css')
  const language = capture(html, /<html\b[^>]*\blang=["'](pt-BR|en)["']/i)
  const name = htmlText(capture(html, /<title>([^<>]+)<\/title>/i))
  const homeSlug = capture(constants, /export const HOME_SLUG\s*=\s*['"]([a-z0-9-]+)['"]/)
  const randomFallback = capture(constants, /export const DEFAULT_RANDOM_SLUGS\s*=\s*\[([^\]\r\n]+)\]/)
  const randomFallbackSlugs = randomFallback.split(',').map(part => part.trim()).filter(Boolean)
    .map(part => part === 'HOME_SLUG' ? homeSlug : capture(part, /^['"]([a-z0-9-]+)['"]$/))
  const tagline = capture(constants, /export const SLOGAN\s*=\s*['"]([^'"\r\n]+)['"]/)
  const menus = navigation(html)
  const guide = capture(html, /<nav\b[^>]*data-account-links[^>]*>\s*<a href="\/wiki\/([a-z0-9-]+)"/i)
  const about = menus.community.find(item => /^(sobre|about)(?:\s|$)/i.test(item.label))?.href.match(/^\/wiki\/([a-z0-9-]+)$/)?.[1]
  const owners = Object.entries(ownerPatterns).map(([file, pattern]) => requireFile(file).match(pattern)?.[2]?.toLowerCase())
  if (!language || !name || !tagline || !homeSlug || !about || !guide || !owners[0] || owners[0] !== owners[1]) throw new Error('a identidade ou o superadministrador da origem precisam de revisão')

  const iconCode = requireFile('src/scripts/random-icon.js')
  const publicAsset = value => {
    if (typeof value !== 'string') throw new Error('referência de mídia legada inválida')
    const file = safePath(value.replace(/^\.\//, '').replace(/^\//, ''))
    if (!mediaPath.test(file) || !files.has(file)) throw new Error('uma imagem referenciada pela instalação legada está ausente ou usa formato incompatível')
    return '/' + file
  }
  const manifestFile = capture(iconCode, /const manifestUrl\s*=\s*['"]\/(src\/data\/[a-z0-9_-]+\.json)['"]/)
  let icons
  try { icons = JSON.parse(requireFile(manifestFile)) } catch { throw new Error('o manifesto legado de ícones é inválido') }
  if (!Array.isArray(icons?.icons)) throw new Error('o manifesto legado de ícones é inválido')
  const logo = publicAsset(capture(iconCode, /const fallbackIcon\s*=\s*['"]([^'"]+)['"]/))
  icons = { icons: icons.icons.map(publicAsset), fallback: publicAsset(icons.fallback || logo) }
  const badge = publicAsset(capture(requireFile('src/scripts/renderers/wiki-renderer.js'), /<img src="([^"]+)" alt="Powered by WikiCambada Core"/))

  const config = genericConfig(language)
  Object.assign(config.site, { name, shortName: name, tagline, description: tagline, language, interfaceLanguage: language, homeSlug, aboutSlug: about, editGuideSlug: guide, defaultCategory: name, baseUrl: wrangler.vars.PUBLIC_BASE_URL || '' })
  if (randomFallbackSlugs.length && randomFallbackSlugs.every(Boolean)) config.site.randomFallbackSlugs = randomFallbackSlugs
  Object.assign(config.branding, { logo, logoMobile: logo, favicon: logo, poweredByBadge: badge, randomIconManifest: '/src/data/wiki-icons.json', randomIcons: true })
  config.features.cloudflareBadge = false
  config.navigation = menus
  const fonts = config.appearance.fonts
  fonts.interface = capture(stylesheet, /--sans:\s*([^;\r\n]+);/) || fonts.interface
  fonts.content = capture(stylesheet, /--serif:\s*([^;\r\n]+);/) || fonts.content
  config.appearance.accentColor = capture(stylesheet, /--primary-bg:\s*(#[a-f0-9]{6});/i) || config.appearance.accentColor
  config.access.superAdminEmail = owners[0]
  config.cloudflare = { projectName: wrangler.name, databaseName: db[0].database_name, bucketName: bucket[0].bucket_name }
  const cloudflare = { ...config.cloudflare }
  try { validateConfig(config) } catch { throw new Error('uma configuração da origem é incompatível com o Core') }
  if (Object.keys(cloudflare).some(key => !cloudflare[key] || config.cloudflare[key] !== cloudflare[key])) throw new Error('os nomes dos recursos Cloudflare não podem ser preservados com segurança')

  const modifiedCode = []
  for (const file of [...new Set([...Object.keys(profile.engine), ...[...files].filter(file => /^(?:functions\/|src\/(?:scripts|styles)\/)/.test(file))])].sort()) {
    let source
    if (files.has(file)) {
      source = requireFile(file)
      const pattern = ownerPatterns[file]
      if (pattern) source = source.replace(pattern, match => match.slice(0, match.indexOf('=') + 1).trimEnd() + ' [owner]')
    }
    if (source === undefined || digest(source) !== profile.engine[file]) modifiedCode.push(file)
  }
  const preservedAssets = [...files].filter(file => mediaPath.test(file))
  const localSecrets = [...files].filter(file => file !== '.dev.vars.example' && /^\.dev\.vars(?:\.[a-zA-Z0-9_-]+)?$/.test(file))
  const converted = new Set([...Object.keys(profile.engine), ...preservedAssets, ...localSecrets, ...names, manifestFile, 'wrangler.toml', '.dev.vars.example', 'README.md', 'LICENSE', '.gitignore', 'src/data/migrations/README.md'])
  return { config, icons, wrangler, preservedAssets, localSecrets, modifiedCode, archivedFiles: [...files].filter(file => !converted.has(file) && !modifiedCode.includes(file)) }
}

export async function migrateLegacy(base, { source, file, destination }) {
  if (Boolean(source) === Boolean(file)) throw new Error('selecione uma pasta ou um ZIP de origem')
  destination = localPath(destination)
  const basename = safePath(path.basename(destination))
  if (/[<>"|?*]/.test(basename)) throw new Error('caminho de destino inválido')
  if (source) source = fs.realpathSync.native(localPath(source))
  const parent = fs.realpathSync.native(path.dirname(destination))
  destination = path.join(parent, basename)
  if (overlaps(fs.realpathSync.native(base.root), destination) || source && overlaps(source, destination)) throw new Error('o destino deve ficar fora do Core e da origem')
  if (!fs.statSync(parent).isDirectory()) throw new Error('a pasta que contém o destino não existe')
  function checkDestination() {
    try { fs.lstatSync(destination) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    throw new Error('o destino da migração precisa ser uma pasta nova')
  }
  checkDestination()
  if (source && !fs.statSync(source).isDirectory() && (!fs.statSync(source).isFile() || path.extname(source).toLowerCase() !== '.zip')) throw new Error('a origem precisa ser uma pasta ou um ZIP')
  return operationLock(parent, async () => {
    checkDestination()
    const staging = fs.mkdtempSync(path.join(parent, '.wikicambada', 'legacy-migration-'))
    fs.chmodSync(staging, 0o700)
    try {
      let root = source
      if (file || fs.statSync(source).isFile()) {
        const archive = path.join(staging, 'legacy.zip')
        if (file) fs.writeFileSync(archive, decodeBase64(file.data, 64 * 1024 * 1024), { mode: 0o600 })
        else {
          if (fs.statSync(source).size > 64 * 1024 * 1024) throw new Error('o ZIP de origem excede o limite da migração')
          fs.copyFileSync(source, archive)
        }
        root = path.join(staging, 'source')
        fs.mkdirSync(root)
        await extractZip(archive, root)
        const entries = fs.readdirSync(root).filter(name => !IGNORE.has(name))
        if (entries.length === 1 && fs.statSync(path.join(root, entries[0])).isDirectory()) root = path.join(root, entries[0])
      }
      inventory(root)
      const snapshot = backupProject(new Project(root), path.join(staging, 'legacy-backup'))
      fs.chmodSync(snapshot, 0o700)
      const localState = path.join(root, '.wrangler', 'state')
      const hasLocalState = fs.existsSync(localState)
      if (hasLocalState) {
        inventory(localState, new Set())
        copyTree(localState, path.join(snapshot, '.wrangler', 'state'))
      }
      const { config, icons, wrangler, preservedAssets, localSecrets, modifiedCode, archivedFiles } = inspectLegacy(snapshot, base)
      const coreZip = path.join(staging, 'core.zip')
      await buildPackage(coreZip, base)
      const migrated = new Project(path.join(staging, 'wiki'))
      fs.mkdirSync(migrated.root)
      await extractZip(coreZip, migrated.root)
      const release = validateRelease(migrated, migrated.root)
      const files = migrated.read(release.filesManifest).files
      const managedNames = new Map(Object.keys(files).map(name => [name.toLowerCase(), name]))
      for (const name of preservedAssets) {
        if (managedNames.has(name.toLowerCase()) && managedNames.get(name.toLowerCase()) !== name) throw new Error('uma mídia legada colide com a grafia de um arquivo do Core')
        delete files[name]
      }
      const backup = '.wikicambada/backups/legacy-' + version
      fs.mkdirSync(path.dirname(migrated.file(backup)), { recursive: true })
      fs.renameSync(snapshot, migrated.file(backup))
      for (const name of [...preservedAssets, ...localSecrets]) {
        const target = migrated.file(name)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(migrated.file(backup + '/' + name), target)
        if (localSecrets.includes(name)) fs.chmodSync(target, 0o600)
      }
      delete wrangler.vars.WIKI_INITIAL_CONTENT
      delete wrangler.vars.WIKI_DEV_AUTH
      delete wrangler.vars.DEV_BYPASS_AUTH
      delete wrangler.vars.WIKI_LOCAL_AUTH_SECRET
      fs.writeFileSync(migrated.file('wrangler.toml'), vendor.toml.stringify(wrangler), { mode: 0o600 })
      fs.chmodSync(migrated.file('wrangler.toml'), 0o600)
      migrated.write('src/data/wiki-icons.json', icons)
      await migrated.save({ config })
      const legacyMigration = { sourceVersion: version, preservedAssets }
      migrated.write('src/config/installation.json', { ...migrated.installation(), legacyMigration })
      migrated.write('.wikicambada/state.json', { ...migrated.read('.wikicambada/state.json'), legacyMigration })
      migrated.write(release.filesManifest, { files })
      const result = {
        ok: true, destination, backup, sourceVersion: version, coreVersion: release.version,
        databaseSchema: null, requiredDatabaseSchema: release.databaseSchema, modifiedCode, archivedFiles,
        hasLocalState, accessReview: wrangler.vars.ACCESS_STRICT !== 'true'
      }
      const verification = migrated.verify()
      if (!verification.ok) throw new Error('a instalação migrada falhou na verificação: ' + verification.checks.filter(check => !check.ok).map(check => check.name === 'integridade dos arquivos do Core' ? check.message : check.name).join(', '))
      await buildPublic(migrated.root)
      migrated.write('.wikicambada/legacy-migration.json', result)
      checkDestination()
      fs.renameSync(migrated.root, destination)
      return result
    } finally { removeWithin(path.join(parent, '.wikicambada'), staging) }
  })
}
