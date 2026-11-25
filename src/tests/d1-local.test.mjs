import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { loadFunction, migrationStatements } from './helpers.mjs'

test('D1 local executa migrations, batch atômico e concorrência editorial', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-miniflare-'))
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-06-22', d1Databases: { DB: 'test' }, r2Buckets: ['WIKI_BUCKET'], cf: false }), resourcePersistencePath: directory, telemetry: { enabled: false } })
  try {
    const DB = await mf.getD1Database('DB')
    for (const migration of migrationStatements()) await DB.batch(migration.map(sql => DB.prepare(sql)))
    const core = await loadFunction('functions/api/_lib/d1.ts')
    const input = { title: 'Alpha', content: 'conteúdo', categories: ['Teste'], aliases: ['Primeiro'], redirects: ['Inicial'], summary: 'criada', expectedRevisionId: null }
    const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
    const edits = await Promise.allSettled([core.writePage({ DB }, 'alpha', { ...input, expectedRevisionId: page.currentRevisionId }, 'a@example.com'), core.writePage({ DB }, 'alpha', { ...input, expectedRevisionId: page.currentRevisionId }, 'b@example.com')])
    assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal((await DB.prepare('SELECT count(*) n FROM revisions').first()).n, 2)
    await assert.rejects(DB.batch([DB.prepare("UPDATE pages SET title = 'partial'"), DB.prepare('INSERT INTO core_write_guards VALUES (?, 0)').bind('fault')]))
    assert.equal((await DB.prepare('SELECT title FROM pages').first()).title, 'Alpha')
    const bucket = await mf.getR2Bucket('WIKI_BUCKET')
    await bucket.put('uploads/test.png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { httpMetadata: { contentType: 'image/png' } })
    assert.equal((await bucket.get('uploads/test.png')).httpMetadata.contentType, 'image/png')
  } finally { await mf.dispose(); await rm(directory, { recursive: true, force: true }) }
})
