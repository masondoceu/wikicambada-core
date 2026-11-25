import test from 'node:test'
import assert from 'node:assert/strict'
import { database, loadFunction } from './helpers.mjs'

const core = await loadFunction('functions/api/_lib/d1.ts')
const input = { title: 'Alpha', content: 'conteúdo', summary: 'teste', categories: [], aliases: ['Primeiro'], redirects: ['Inicial'], expectedRevisionId: null }

test('gravação e índices são revertidos quando uma etapa falha', async () => {
  const DB = await database()
  DB.fail = sql => sql.includes('INSERT INTO page_search')
  await assert.rejects(core.writePage({ DB }, 'alpha', input, 'editor@example.com'))
  for (const table of ['pages', 'revisions', 'page_categories', 'categories', 'redirects', 'page_aliases', 'core_write_guards']) assert.equal(DB.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0, table)
  DB.sqlite.close()
})

test('duas edições sobre a mesma revisão aceitam somente uma gravação', async () => {
  const DB = await database()
  const first = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
  const changes = { ...input, expectedRevisionId: first.currentRevisionId, content: 'alterado' }
  const results = await Promise.allSettled([core.writePage({ DB }, 'alpha', changes, 'a@example.com'), core.writePage({ DB }, 'alpha', changes, 'b@example.com')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 2)
  DB.sqlite.close()
})

test('páginas deletadas ou bloqueadas recusam gravações também na persistência', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
  DB.sqlite.prepare("UPDATE pages SET status = 'deleted'").run()
  await assert.rejects(core.writePage({ DB }, 'alpha', { ...input, expectedRevisionId: page.currentRevisionId }, 'editor@example.com'), { status: 403 })
  DB.sqlite.prepare("UPDATE pages SET status = 'published', is_locked = 1").run()
  await assert.rejects(core.writePage({ DB }, 'alpha', input, 'editor@example.com'), { status: 403 })
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 1)
  DB.sqlite.close()
})

test('categorias históricas vazias não herdam categorias atuais', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
  await core.writePage({ DB }, 'alpha', { ...input, expectedRevisionId: page.currentRevisionId, categories: ['Nova'] }, 'editor@example.com')
  assert.deepEqual((await core.readPageRevision({ DB }, 'alpha', 1)).categories, [])
  DB.sqlite.prepare('UPDATE revisions SET categories_json = NULL WHERE revision_number = 1').run()
  assert.deepEqual((await core.readPageRevision({ DB }, 'alpha', 1)).categories, ['Nova'])
  DB.sqlite.close()
})

test('subtítulo histórico vazio não herda o subtítulo atual', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
  await core.writePage({ DB }, 'alpha', { ...input, subtitle: 'Atual', expectedRevisionId: page.currentRevisionId }, 'editor@example.com')
  assert.equal((await core.readPageRevision({ DB }, 'alpha', 1)).subtitle, '')
  DB.sqlite.prepare('UPDATE revisions SET title = NULL WHERE revision_number = 1').run()
  assert.equal((await core.readPageRevision({ DB }, 'alpha', 1)).subtitle, 'Atual')
  DB.sqlite.close()
})

test('renomeação editorial exige administrador e preserva histórico e URL antiga', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
  await assert.rejects(core.writePage({ DB }, 'beta', { ...input, sourceSlug: 'alpha', expectedRevisionId: page.currentRevisionId }, 'editor@example.com'), { status: 403 })
  DB.sqlite.prepare("INSERT INTO editor_profiles(id,email,role,status,created_at,updated_at) VALUES ('admin','admin@example.com','admin','active','now','now')").run()
  const renamed = await core.writePage({ DB }, 'beta', { ...input, sourceSlug: 'alpha', expectedRevisionId: page.currentRevisionId }, 'admin@example.com')
  assert.equal(renamed.id, page.id)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM pages').get().n, 1)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 2)
  assert.equal((await core.readPage({ DB }, 'alpha')).slug, 'beta')
  assert.equal((await core.readPage({ DB }, 'inicial')).slug, 'beta')
  DB.sqlite.close()
})

test('histórico paginado permite consultar todas as revisões', async () => {
  const DB = await database()
  try {
    const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
    const insert = DB.sqlite.prepare("INSERT INTO revisions(id,page_id,revision_number,author_email,content_markdown,created_at) VALUES (?, ?, ?, 'editor@example.com', 'content', 'now')")
    for (let revision = 2; revision <= 305; revision++) insert.run(`r${revision}`, page.id, revision)
    const found = []
    let offset = 0
    do {
      const data = await core.listPageRevisions({ DB }, 'alpha', { offset })
      assert.equal(data.total, 305)
      found.push(...data.revisions.map(row => row.revisionNumber))
      offset = data.nextOffset
    } while (offset !== null)
    assert.equal(found.length, 305)
    assert.equal(new Set(found).size, 305)
    assert.equal(found.at(-1), 1)
  } finally { DB.sqlite.close() }
})

test('desativar categorias não apaga metadados durante uma edição', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'alpha', { ...input, categories: ['Preservada'] }, 'editor@example.com')
  const updated = await core.writePage({ DB, WIKI_FEATURES_JSON: '{"categories":false}' }, 'alpha', { ...input, categories: [], expectedRevisionId: page.currentRevisionId }, 'editor@example.com')
  assert.deepEqual(updated.categories, ['Preservada'])
  assert.deepEqual((await core.readPageRevision({ DB }, 'alpha', 2)).categories, ['Preservada'])
  DB.sqlite.close()
})

test('renomeações administrativas concorrentes não sobrescrevem a mesma origem', async () => {
  const DB = await database()
  try {
    await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
    const results = await Promise.allSettled([core.renamePage({ DB }, 'alpha', { title: 'Beta', slug: 'beta' }, 'admin@example.com'), core.renamePage({ DB }, 'alpha', { title: 'Gamma', slug: 'gamma' }, 'admin@example.com')])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.find(result => result.status === 'rejected').reason.status, 409)
    const canonical = DB.sqlite.prepare('SELECT slug FROM pages').get().slug
    assert.equal((await core.readPage({ DB }, 'alpha')).slug, canonical)
    assert.equal((await core.readPage({ DB }, 'inicial')).slug, canonical)
  } finally { DB.sqlite.close() }
})

test('renomeação e restauração não consultam novamente o D1 depois de confirmar a gravação', async () => {
  const DB = await database()
  try {
    await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
    const batch = DB.batch.bind(DB)
    DB.batch = async statements => {
      const result = await batch(statements)
      DB.fail = () => true
      return result
    }
    const renamed = await core.renamePage({ DB }, 'alpha', { title: 'Beta', slug: 'beta' }, 'admin@example.com')
    assert.equal(renamed.slug, 'beta')
    assert.equal(renamed.content, input.content)
    DB.fail = null
    DB.sqlite.prepare("UPDATE pages SET status = 'deleted'").run()
    const restored = await core.restoreDeletedPage({ DB }, 'beta', 'admin@example.com')
    assert.equal(restored.status, 'published')
    assert.equal(restored.currentRevisionId, renamed.currentRevisionId)
  } finally { DB.sqlite.close() }
})
