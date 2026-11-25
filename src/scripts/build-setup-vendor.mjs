import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
await build({ stdin: { contents: "module.exports = { toml: require('smol-toml'), yauzl: require('yauzl'), yazl: require('yazl') }", resolveDir: root }, outfile: resolve(root, 'src/setup/vendor.cjs'), bundle: true, platform: 'node', format: 'cjs', minify: true, legalComments: 'eof' })
const licenses = ['smol-toml', 'yauzl', 'yazl', 'pend', 'buffer-crc32'].map(name => {
  let directory = dirname(require.resolve(name))
  while (true) { try { return `${name}\n${readFileSync(resolve(directory, 'LICENSE'), 'utf8')}\n` } catch { const parent = dirname(directory); if (parent === directory) throw new Error(`licença ausente: ${name}`); directory = parent } }
})
writeFileSync(resolve(root, 'src/setup/THIRD-PARTY-LICENSES.txt'), licenses.join('\n'))
