import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, cp, writeFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPublic } from '../scripts/build-public.mjs'
import { unstable_generateASSETSBinding } from 'wrangler'
import { loadFunction } from './helpers.mjs'

test('publicação contém somente assets e configuração pública', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wiki-public-'))
  try {
    for (const path of ['src', 'index.html', '404.html', 'access-blocked.html', 'access-denied.html', 'access-blocked', 'access-denied', 'login-error', 'non-identity-blocked', 'wikicambada-release.json', 'README.md', 'readmes/README.pt-BR.md']) await cp(path, join(root, path), { recursive: true })
    await mkdir(join(root, '.wikicambada/backups'), { recursive: true })
    await writeFile(join(root, '.dev.vars'), 'secret')
    await writeFile(join(root, '.wikicambada/state.json'), 'secret')
    await writeFile(join(root, '.wikicambada/backups/secret.zip'), 'secret')
    await writeFile(join(root, 'src/config/local.json'), 'secret')
    await writeFile(join(root, 'src/scripts/private.js'), 'private implementation')
    const installed = JSON.parse(await readFile(join(root, 'src/config/site.json'), 'utf8'))
    installed.site.privateToken = 'secret-token'
    installed.features.cloudflareBadge = false
    installed.features.builtWithCloudflareBadge = true
    installed.branding.privateToken = 'secret-token'
    installed.navigation.main.push({ label: 'Link', href: '/', privateToken: 'secret-token' })
    await writeFile(join(root, 'src/config/site.json'), JSON.stringify(installed))
    await writeFile(join(root, 'src/data/wiki-icons.json'), JSON.stringify({ icons: ['/src/media/images/core/cat-guard.png'], fallback: '/src/media/images/core/cat-guard.png', privateToken: 'secret-token' }))
    const output = await buildPublic(root)
    const files = await readdir(output, { recursive: true })
    assert.ok(!files.some(name => /(?:^|[\\/])readmes?(?:\.|$)/i.test(name)))
    for (const name of files) assert.ok(!/\.py$|\.zip$|\.dev.vars|state\.json|installation\.json|local\.json|setup|tests|migrations/.test(name), name)
    const config = JSON.parse(await readFile(join(output, 'src/config/site.json'), 'utf8'))
    assert.equal(config.features.cloudflareBadge, false)
    assert.equal(config.features.builtWithCloudflareBadge, true)
    assert.deepEqual(await readFile(join(output, 'src/media/images/protectedby-cloudflare.png')), await readFile('src/media/images/protectedby-cloudflare.png'))
    assert.deepEqual(await readFile(join(output, 'src/media/images/built-with-cloudflare.svg')), await readFile('src/media/images/built-with-cloudflare.svg'))
    assert.equal(config.access.superAdminEmail, undefined)
    assert.equal(config.cloudflare, undefined)
    assert.equal(config.site.privateToken, undefined)
    assert.equal(config.branding.privateToken, undefined)
    assert.equal(config.navigation.main.at(-1).privateToken, undefined)
    assert.equal(JSON.parse(await readFile(join(output, 'src/data/wiki-icons.json'), 'utf8')).privateToken, undefined)
    await assert.rejects(buildPublic(root, join(root, 'src')), /destino de publicação inválido/)
    assert.ok(!files.some(name => name.endsWith('private.js')))
    assert.ok(files.includes('src\\scripts\\theme.js') || files.includes('src/scripts/theme.js'))
    const signal = new AbortController()
    try {
      const assets = await unstable_generateASSETSBinding({ directory: output, signal: signal.signal, log: { debug() {}, info() {}, log() {}, warn() {}, error() {} } })
      for (const path of ['/.dev.vars', '/.wikicambada/state.json', '/.wikicambada/backups/secret.zip', '/src/config/local.json', '/src/scripts/private.js', '/setup.js', '/setup.cmd', '/src/setup/server.js', '/src/setup/vendor.cjs']) assert.doesNotMatch(await (await assets(new Request('https://wiki.example.com' + path))).text(), /secret-token|private implementation|^secret$|startServer|module\.exports/)
      assert.equal((await assets(new Request('https://wiki.example.com/src/scripts/app.js'))).status, 200)
      const route = await loadFunction('functions/wiki/[[slug]].ts')
      const response = await route.onRequestGet({ request: new Request('https://wiki.example.com/wiki/alpha?revision=2'), env: { ASSETS: { fetch: assets } } })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /src\/scripts\/app.js/)
    } finally { signal.abort() }
  } finally { await rm(root, { recursive: true, force: true }) }
})
