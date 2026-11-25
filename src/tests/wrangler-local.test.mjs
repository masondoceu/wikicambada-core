import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

async function wrangler(args) {
  const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', bytes => { output += bytes.toString() })
  child.stderr.on('data', bytes => { output += bytes.toString() })
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  assert.equal(code, 0, output.slice(-6000))
  return output
}

test('Wrangler aplica todas as migrations localmente e registra o schema real', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-wrangler-test-'))
  try {
    const config = join(directory, 'wrangler.toml')
    await writeFile(config, `name = "wiki-migration-test"\ncompatibility_date = "2026-06-22"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "test-db"\ndatabase_id = "00000000-0000-0000-0000-000000000001"\nmigrations_dir = ${JSON.stringify(resolve('src/data/migrations').replaceAll('\\', '/'))}\n`)
    const args = ['d1', 'migrations', 'apply', 'test-db', '--local', '--config', config, '--persist-to', join(directory, 'state')]
    await wrangler(args)
    const files = await readdir(join(directory, 'state'), { recursive: true })
    const file = files.find(name => name.endsWith('.sqlite'))
    assert.ok(file)
    const database = new DatabaseSync(join(directory, 'state', file), { readOnly: true })
    try {
      assert.equal(database.prepare('SELECT COUNT(*) n FROM d1_migrations').get().n, 17)
      assert.equal(database.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'recovery_%'").get().n, 54)
      assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
    } finally { database.close() }
    assert.match(await wrangler(args), /No migrations|Nenhuma migra/i)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
