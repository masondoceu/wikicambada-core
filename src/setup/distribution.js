import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import vendor from './vendor.cjs'
import { Project, genericConfig } from './project.js'
import { hash, walk, IGNORE, removeWithin } from './files.js'
import { releaseManifest, validateRelease } from './updater.js'

export async function buildPackage(destination, project = new Project()) {
  destination = path.resolve(destination)
  if (fs.existsSync(destination)) throw new Error('o pacote de destino já existe')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wikicambada-release-'))
  try {
    for (const folder of ['functions', 'src/scripts', 'src/styles', 'src/setup', 'src/tests', 'src/data/migrations']) {
      fs.mkdirSync(path.join(temporary, folder), { recursive: true })
      for (const source of walk(project.file(folder), IGNORE)) {
        if (/\.py[cod]?$|\.zip$/.test(source)) continue
        const relative = path.relative(project.root, source), target = path.join(temporary, relative)
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target)
      }
    }
    const files = ['index.html', '404.html', 'access-blocked.html', 'access-denied.html', 'access-blocked/index.html', 'access-denied/index.html', 'login-error/index.html', 'non-identity-blocked/index.html', 'setup.js', 'setup.cmd', 'setup.sh', 'setup.command', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.MD', 'CHANGELOG.MD', 'wikicambada-release.json', '.gitignore', '.dev.vars.example', 'LICENSE', 'src/media/images/core/cat-guard.png', 'src/media/images/core/wikicambada-core-white.png', 'src/media/images/core/wikicambada-core-readme.png', 'src/media/images/poweredby-wikicambada-core.png', 'src/media/images/protectedby-cloudflare.png', 'src/media/images/built-with-cloudflare.svg']
    for (const name of files) { const target = path.join(temporary, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(project.file(name), target) }
    for (const name of ['setup.sh', 'setup.command']) fs.chmodSync(path.join(temporary, name), 0o755)
    const stage = new Project(temporary), config = genericConfig()
    stage.write('src/data/wiki-icons.json', { icons: [], fallback: '/src/media/images/core/cat-guard.png' })
    stage.write('src/config/site.json', config)
    stage.write('src/config/installation.json', { formatVersion: 1, coreVersion: project.release().version, configSchema: 1, databaseSchema: null, requiredDatabaseSchema: 17, distribution: 'custom' })
    stage.generateWrangler(config, false); stage.generatePackage(config)
    const release = stage.release(); release.databaseSchema = 17; release.migrations = fs.readdirSync(stage.file('src/data/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => 'src/data/migrations/' + name)
    delete release.requirements.python; release.requirements.node = '>=22.13.0'
    stage.write('wikicambada-release.json', release)
    const filesManifest = releaseManifest(temporary); stage.write('wikicambada-files.json', { files: filesManifest }); validateRelease(project, temporary, release)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    const zip = new vendor.yazl.ZipFile()
    const output = pipeline(zip.outputStream, fs.createWriteStream(destination, { flags: 'wx' }))
    for (const file of walk(temporary)) zip.addFile(file, path.relative(temporary, file).replaceAll(path.sep, '/'), { mode: ['setup.sh', 'setup.command'].includes(path.basename(file)) ? 0o100755 : 0o100644 })
    zip.end(); await output
    return { path: destination, sha256: hash(destination), files: Object.keys(filesManifest).length, version: release.version }
  } finally { removeWithin(os.tmpdir(), temporary) }
}
