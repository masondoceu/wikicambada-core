import { copyFile, mkdir, mkdtemp, readFile, readdir, lstat, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function buildPublic(root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), output = resolve(root, '.wikicambada/public')) {
  root = resolve(root)
  output = resolve(output)
  if (relative(root, output).replaceAll('\\', '/') !== '.wikicambada/public') throw new Error('destino de publicação inválido')
  async function checkPath(path) {
    let current = root
    for (const part of relative(root, resolve(root, path)).split(/[\\/]/).filter(Boolean)) {
      current = resolve(current, part)
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`caminho simbólico: ${path}`) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  await checkPath(relative(root, output))
  await mkdir(dirname(output), { recursive: true })
  const stage = await mkdtemp(`${output}.stage-`)
  const previous = `${stage}.previous`
  async function copy(path) {
    await checkPath(path)
    const source = resolve(root, path)
    const stat = await lstat(source)
    if (stat.isSymbolicLink()) throw new Error(`asset simbólico: ${path}`)
    if (!stat.isFile()) throw new Error(`asset inválido: ${path}`)
    const destination = resolve(stage, path)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
  async function tree(path, extensions) {
    const stat = await lstat(resolve(root, path))
    if (stat.isSymbolicLink()) throw new Error(`diretório simbólico: ${path}`)
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`
      if (entry.isDirectory()) await tree(child, extensions)
      else if (extensions.has(extname(entry.name).toLowerCase())) await copy(child)
    }
  }
  try {
    for (const path of ['index.html', '404.html', 'access-blocked.html', 'access-denied.html', 'access-blocked/index.html', 'access-denied/index.html', 'login-error/index.html', 'non-identity-blocked/index.html']) await copy(path)
    const scripts = ['app.js', 'api.js', 'theme.js', 'media-viewer.js', 'random-icon.js', 'static-page.js']
    for (const script of scripts) await copy(`src/scripts/${script}`)
    for (const script of ['core/config.js', 'core/i18n.js', 'core/utils.js', 'renderers/wiki-markdown.js', 'renderers/wiki-renderer.js', 'routes/wiki-router.js', 'services/wiki-api.js']) await copy(`src/scripts/${script}`)
    await copy('src/styles/wiki.css')
    for (const folder of ['images', 'fonts', 'branding']) {
      try { await tree(`src/media/${folder}`, new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.otf'])) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    await checkPath('src/config/site.json')
    const config = JSON.parse(await readFile(resolve(root, 'src/config/site.json'), 'utf8'))
    const pick = (value, keys) => Object.fromEntries(keys.filter(key => value && Object.hasOwn(value, key)).map(key => [key, value[key]]))
    const publicIcons = manifest => ({ icons: Array.isArray(manifest.icons) ? manifest.icons.filter(icon => typeof icon === 'string') : [], fallback: typeof manifest.fallback === 'string' ? manifest.fallback : '' })
    await checkPath('src/data/wiki-icons.json')
    const icons = JSON.parse(await readFile(resolve(root, 'src/data/wiki-icons.json'), 'utf8'))
    await mkdir(resolve(stage, 'src/data'), { recursive: true })
    await writeFile(resolve(stage, 'src/data/wiki-icons.json'), JSON.stringify(publicIcons(icons)))
    const site = pick(config.site, ['name', 'shortName', 'tagline', 'description', 'language', 'interfaceLanguage', 'homeSlug', 'baseUrl', 'supportEmail', 'aboutSlug', 'editGuideSlug', 'defaultCategory'])
    if (Array.isArray(config.site?.randomFallbackSlugs)) site.randomFallbackSlugs = config.site.randomFallbackSlugs.filter(slug => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)).slice(0, 100)
    const branding = pick(config.branding, ['logo', 'logoMobile', 'logoDark', 'favicon', 'coreIcon', 'coreWordmark', 'poweredByBadge', 'randomIconManifest', 'randomIcons'])
    const appearance = { ...pick(config.appearance, ['accentColor', 'defaultTheme']), fonts: pick(config.appearance?.fonts, ['interface', 'content', 'monospace']) }
    const features = { ...pick(config.features, ['search', 'talkPages', 'userPages', 'publicSuggestions', 'pageHistory', 'mediaUploads', 'templates', 'categories', 'randomPage', 'coreBadge', 'cloudflareBadge', 'builtWithCloudflareBadge', 'activityLogging']), specialPages: pick(config.features?.specialPages, ['index', 'version', 'recentPages', 'allPages', 'categories', 'randomPage']) }
    const navigation = Object.fromEntries(['main', 'community', 'external'].map(section => [section, (config.navigation?.[section] || []).map(item => pick(item, ['label', 'href', 'kind', 'feature']))]))
    const schemaVersion = config.schemaVersion
    if (branding.randomIconManifest?.startsWith('/')) {
      const path = branding.randomIconManifest.slice(1)
      if (!/^src\/(data|media)\/[a-z0-9_./-]+\.json$/i.test(path) || path.split('/').includes('..')) throw new Error('manifesto público de ícones inválido')
      await checkPath(path)
      const stat = await lstat(resolve(root, path))
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('manifesto de ícones inválido')
      const manifest = JSON.parse(await readFile(resolve(root, path), 'utf8'))
      await mkdir(dirname(resolve(stage, path)), { recursive: true })
      await writeFile(resolve(stage, path), JSON.stringify(publicIcons(manifest)))
    }
    await mkdir(resolve(stage, 'src/config'), { recursive: true })
    await writeFile(resolve(stage, 'src/config/site.json'), JSON.stringify({ schemaVersion, site, branding, appearance, features, navigation, access: { mode: config.access?.mode } }))
    const release = JSON.parse(await readFile(resolve(root, 'wikicambada-release.json'), 'utf8'))
    await writeFile(resolve(stage, 'wikicambada-release.json'), JSON.stringify({ product: release.product, version: release.version, displayVersion: release.displayVersion, channel: release.channel, databaseSchema: release.databaseSchema }))
    let moved = false
    try { await rename(output, previous); moved = true } catch (error) { if (error.code !== 'ENOENT') throw error }
    try { await rename(stage, output) } catch (error) { if (moved) await rename(previous, output); throw error }
    if (moved) await rm(previous, { recursive: true })
    return output
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildPublic())
