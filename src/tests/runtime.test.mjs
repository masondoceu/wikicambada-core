import test from 'node:test'
import assert from 'node:assert/strict'
import { database, loadFunction } from './helpers.mjs'
import { inlineMarkdown } from '../scripts/renderers/wiki-markdown.js'

const core = await loadFunction('functions/api/_lib/d1.ts')
const middleware = await loadFunction('functions/_middleware.ts')
const media = await loadFunction('functions/api/_lib/media.ts')
const api = await import('../scripts/services/wiki-api.js')

test('Markdown preserva caminhos, fragmentos, entidades e parâmetros', () => {
  globalThis.window = { location: { href: 'https://wiki.example.com/wiki/alpha', origin: 'https://wiki.example.com', hostname: 'wiki.example.com' } }
  assert.match(inlineMarkdown('[[Discussão: Alpha/Beta#seção|A & B]]'), /href="\/talk\/alpha\/beta#se%C3%A7%C3%A3o"/)
  assert.match(inlineMarkdown('[[Alpha/Beta#heading|A & B]]'), /href="\/wiki\/alpha\/beta#heading"/)
  assert.match(inlineMarkdown('[Link](https://example.com/?a=1&b=2)'), /\?a=1&amp;b=2/)
  assert.doesNotMatch(inlineMarkdown('[[Alpha|A &amp; B]]'), /amp;amp/)
  assert.doesNotMatch(inlineMarkdown('[bad](javascript:alert(1))'), /href="javascript:/)
  assert.match(inlineMarkdown('&lt;script&gt;'), /&lt;script&gt;/)
})

test('MIME declarado não aceita HTML como mídia', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'audio/mpeg']) assert.equal(media.matchesMediaType(new TextEncoder().encode('<html>attack</html>').buffer, mime), false)
  assert.equal(media.matchesMediaType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer, 'image/png'), true)
})

test('CSRF e erros internos são bloqueados no middleware', async () => {
  const response = await middleware.onRequest({ request: new Request('https://wiki.example.com/api/secure/files', { method: 'POST', headers: { origin: 'https://attacker.example.com', 'x-wiki-request': '1' } }), env: {}, next() { throw new Error('must not run') } })
  assert.equal(response.status, 403)
  const failure = await middleware.onRequest({ request: new Request('https://wiki.example.com/api/secure/test', { method: 'POST', headers: { origin: 'https://wiki.example.com', 'x-wiki-request': '1' } }), env: {}, next() { throw new Error('private DB SQL and tokens') } })
  assert.equal(failure.status, 500)
  assert.doesNotMatch(await failure.text(), /private|SQL|tokens/)
})

test('APIs distinguem ausência de página de falha de armazenamento', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ error: 'ausente' }, { status: 404 })
    assert.equal(await api.getPage('not-found', { noCache: true }), null)
    assert.equal(await api.getFile('not-found'), null)
    assert.equal(await api.getCategory('not-found'), null)
    globalThis.fetch = async () => Response.json({ error: 'falha' }, { status: 503 })
    await assert.rejects(api.getPage('failed', { noCache: true }), { status: 503 })
    await assert.rejects(api.listPages(), { status: 503 })
    await assert.rejects(api.listCategories(), { status: 503 })
    await assert.rejects(api.getFile('failed'), { status: 503 })
    await assert.rejects(api.getCategory('failed'), { status: 503 })
  } finally { globalThis.fetch = previous }
})

test('resposta malformada, falha de autenticação e proposta não persistida não simulam sucesso', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ invalid: true })
    await assert.rejects(api.listPages(), /listagem inválida/)
    await assert.rejects(api.getPageList(), /listagem inválida/)
    await assert.rejects(api.getSearchPage('test'), /busca inválida/)
    await assert.rejects(api.listRevisions('alpha'), /histórico inválida/)
    await assert.rejects(api.listFiles(), /arquivos inválida/)
    await assert.rejects(api.getPage('invalid', { noCache: true }), /página inválida/)
    await assert.rejects(api.savePage('alpha', {}), /gravação inválida/)
    await assert.rejects(api.restoreRevision('alpha', 1, 'restore', 'r1'), /restauração inválida/)
    await assert.rejects(api.submitEditProposal('alpha', {}), /não foi armazenada/)
    globalThis.fetch = async () => Response.json({ error: 'storage unavailable' }, { status: 503 })
    await assert.rejects(api.getCurrentUser('/'), { status: 503 })
    globalThis.fetch = async () => new Response('<html>upstream unavailable</html>', { status: 503 })
    await assert.rejects(api.submitEditProposal('alpha', {}), { status: 503 })
    await assert.rejects(api.deletePage('alpha'), { status: 503 })
    await assert.rejects(api.uploadImage(new File(['data'], 'image.png', { type: 'image/png' })), { status: 503 })
    globalThis.fetch = async () => { throw new TypeError('network failed') }
    await assert.rejects(api.getPage('offline', { noCache: true }), { kind: 'network' })
  } finally { api.clearPublicCache(); globalThis.fetch = previous }
})

test('disponibilidade acompanha aliases, redirects, histórico e rotas legadas de mídia', async () => {
  const DB = await database()
  const page = await core.writePage({ DB }, 'discussao/alpha', { title: 'Discussion', content: 'content', summary: 'new', aliases: ['Discussion alias'], redirects: ['discussion-redirect'], expectedRevisionId: null }, 'editor@example.com')
  const env = { DB, WIKI_FEATURES_JSON: '{"talkPages":false,"pageHistory":false,"mediaUploads":false}' }
  for (const slug of ['discussao/alpha', 'discussion-alias', 'discussion-redirect']) assert.equal(await core.readPage(env, slug), null)
  await assert.rejects(core.listPageRevisions(env, page.slug), { status: 403 })
  await assert.rejects(core.readPageRevision(env, page.slug, 1), { status: 403 })
  const legacy = await loadFunction('functions/api/uploads/[[key]].ts')
  assert.equal((await legacy.onRequestGet({ env: { ...env, WIKI_BUCKET: {} }, params: { key: ['uploads/file.png'] } })).status, 403)
  const uploaded = await core.recordUpload({ DB }, { r2Key: 'uploads/file.png', filename: 'file.png', mimeType: 'image/png', sizeBytes: 8 })
  DB.sqlite.prepare("UPDATE uploads SET status = 'deleted'").run()
  assert.equal((await legacy.onRequestGet({ env: { DB, WIKI_BUCKET: { get() { throw new Error('must not read deleted media') } } }, params: { key: ['uploads/file.png'] } })).status, 404)
  assert.equal(await core.readUpload({ DB }, uploaded.slug), null)
  DB.sqlite.close()
})

test('modo privado protege conteúdo, assets e APIs alternativas', async () => {
  const DB = await database()
  try {
    for (const path of ['/wiki/alpha', '/src/config/site.json', '/api/pages/alpha', '/api/uploads/uploads/file.png']) {
      const response = await middleware.onRequest({ request: new Request('https://wiki.example.com' + path), env: { DB, WIKI_ACCESS_MODE: 'private' }, next() { throw new Error('must not run') } })
      assert.equal(response.status, 401, path)
    }
    assert.equal((await middleware.onRequest({ request: new Request('https://wiki.example.com/'), env: { WIKI_ACCESS_MODE: 'unknown' }, next() { throw new Error('must not run') } })).status, 503)
  } finally { DB.sqlite.close() }
})

test('falha posterior ao INSERT de upload preserva o objeto referenciado', async () => {
  const DB = await database()
  const handler = await loadFunction('functions/api/secure/files/index.ts')
  const objects = new Map()
  const WIKI_BUCKET = { async put(key, bytes) { objects.set(key, bytes) }, async delete(key) { objects.delete(key) } }
  const form = new FormData()
  form.set('file', new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'valid.png', { type: 'image/png' }))
  const prepare = DB.prepare
  DB.prepare = sql => {
    const statement = prepare(sql)
    if (sql.includes('INSERT INTO uploads')) {
      const run = statement.run
      statement.run = async () => { await run.call(statement); throw new Error('response lost after commit') }
    }
    return statement
  }
  try {
    await assert.rejects(handler.onRequestPost({ request: new Request('http://localhost/api/secure/files', { method: 'POST', headers: { 'cf-access-authenticated-user-email': 'editor@example.com' }, body: form }), env: { DB, WIKI_BUCKET, ACCESS_STRICT: 'false', WIKI_DEV_AUTH: 'true' } }))
    assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM uploads').get().n, 1)
    assert.equal(objects.size, 1)
    assert.ok(objects.has(DB.sqlite.prepare('SELECT r2_key FROM uploads').get().r2_key))
  } finally { DB.sqlite.close() }
})

test('propostas exigem persistência e limite de frequência transacional', async () => {
  const DB = await database()
  const request = new Request('https://wiki.example.com/', { headers: { 'cf-connecting-ip': '192.0.2.1' } })
  const input = { title: 'Alpha', content: 'teste', summary: 'sugestão' }
  await assert.rejects(core.createEditProposal({}, 'alpha', input, request), { status: 503 })
  for (let index = 0; index < 5; index++) await core.createEditProposal({ DB }, 'alpha', input, request)
  await assert.rejects(core.createEditProposal({ DB }, 'alpha', input, request), { status: 429 })
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM edit_proposals').get().n, 5)
  DB.sqlite.close()
})

test('aprovação de proposta falha sem deixar revisão nem mudar seu estado', async () => {
  const DB = await database()
  const request = new Request('https://wiki.example.com/')
  const proposal = await core.createEditProposal({ DB }, 'alpha', { title: 'Alpha', content: 'teste', summary: 'sugestão' }, request)
  DB.fail = sql => sql.includes("SET status = 'approved'")
  await assert.rejects(core.approveEditProposal({ DB }, proposal.id, 'admin@example.com'))
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 0)
  assert.equal(DB.sqlite.prepare('SELECT status FROM edit_proposals').get().status, 'pending')
  DB.fail = null
  const results = await Promise.allSettled([core.approveEditProposal({ DB }, proposal.id, 'a@example.com'), core.approveEditProposal({ DB }, proposal.id, 'b@example.com')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 1)
  DB.sqlite.close()
})

test('exclusão R2 interrompida deixa limpeza recuperável e nenhum registro publicado inválido', async () => {
  const DB = await database()
  const uploaded = await core.recordUpload({ DB }, { r2Key: 'uploads/test.png', filename: 'test.png', mimeType: 'image/png', sizeBytes: 8 })
  DB.sqlite.prepare("UPDATE uploads SET status = 'deleted'").run()
  const bucket = { async delete() { throw new Error('R2 unavailable') } }
  await assert.rejects(core.hardDeleteUpload({ DB, WIKI_BUCKET: bucket }, uploaded.slug))
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM uploads').get().n, 0)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM r2_cleanup').get().n, 1)
  let deleted = false
  await core.reconcileR2Cleanup({ DB, WIKI_BUCKET: { async delete() { deleted = true } } })
  assert.equal(deleted, true)
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM r2_cleanup').get().n, 0)
  DB.sqlite.close()
})

test('paginação e totais consideram todo o conteúdo disponível', async () => {
  const DB = await database()
  const statement = DB.sqlite.prepare("INSERT INTO pages(id,slug,title,namespace,status,created_at,updated_at) VALUES (?,?,?,'article','published','now','now')")
  for (let index = 0; index < 1205; index++) statement.run(String(index), `page-${String(index).padStart(4, '0')}`, `Page ${index}`)
  statement.run('talk', 'discussao/hidden', 'Hidden')
  const env = { DB, WIKI_FEATURES_JSON: '{"talkPages":false}' }
  assert.equal((await core.pageListStats(env)).total, 1205)
  const slugs = []
  for (let offset = 0; offset < 1205; offset += 100) slugs.push(...(await core.listPages(env, { offset, limit: 100 })).map(page => page.slug))
  assert.equal(new Set(slugs).size, 1205)
  const results = []
  let offset = 0
  do {
    const page = await core.searchPageBatch(env, 'Page', offset)
    assert.equal(page.total, 1205)
    results.push(...page.results.map(page => page.slug))
    offset = page.nextOffset
  } while (offset !== null)
  assert.equal(new Set(results).size, 1205)
  assert.equal(results.length, 1205)
  const bucket = { async list({ cursor }) { const offset = Number(cursor || 0); const objects = Array.from({ length: Math.min(100, 250 - offset) }, (_, index) => ({ key: `uploads/${offset + index}`, size: 10 })); return { objects, truncated: offset + objects.length < 250, cursor: String(offset + objects.length) } } }
  const storage = await core.listStorageOverview({ DB, WIKI_BUCKET: bucket })
  assert.equal(storage.r2Objects.length, 100)
  assert.equal(storage.r2ObjectCount, 250)
  assert.equal(storage.r2NextCursor, '100')
  DB.sqlite.close()
})

test('busca paginada mantém fragmentos de redirecionamentos além da primeira página', async () => {
  const DB = await database()
  try {
    for (let index = 0; index < 55; index++) {
      DB.sqlite.prepare("INSERT INTO pages(id,slug,title,namespace,status,created_at,updated_at) VALUES (?,?,?,'article','published','now','now')").run(String(index), `page-${index}`, `Page ${index}`)
      DB.sqlite.prepare("INSERT INTO redirects(id,from_slug,to_slug,target_fragment,created_at) VALUES (?,?,?,?, 'now')").run(String(index), `lookup-${index}`, `page-${index}`, `section-${index}`)
    }
    let offset = 0
    const rows = []
    do {
      const batch = await core.searchPageBatch({ DB }, 'lookup', offset)
      rows.push(...batch.results)
      offset = batch.nextOffset
    } while (offset !== null)
    assert.equal(rows.length, 55)
    for (const row of rows) { assert.match(row.matchedSlug, /^lookup-/); assert.match(row.targetFragment, /^section-/) }
  } finally { DB.sqlite.close() }
})

test('aprovação obsoleta e aprovação de página deletada preservam a proposta pendente', async () => {
  const DB = await database()
  try {
    const input = { title: 'Alpha', content: 'initial', summary: 'first', expectedRevisionId: null }
    const page = await core.writePage({ DB }, 'alpha', input, 'editor@example.com')
    const proposal = await core.createEditProposal({ DB }, 'alpha', { ...input, content: 'proposed' }, new Request('https://wiki.example.com'))
    const latest = await core.writePage({ DB }, 'alpha', { ...input, content: 'updated', expectedRevisionId: page.currentRevisionId }, 'editor@example.com')
    await assert.rejects(core.approveEditProposal({ DB }, proposal.id, 'reviewer@example.com', null, 'anonymous', page.currentRevisionId), { status: 409 })
    assert.equal(DB.sqlite.prepare('SELECT status FROM edit_proposals').get().status, 'pending')
    DB.sqlite.prepare("UPDATE pages SET status = 'deleted'").run()
    await assert.rejects(core.approveEditProposal({ DB }, proposal.id, 'reviewer@example.com', null, 'anonymous', latest.currentRevisionId), { status: 403 })
    assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM revisions').get().n, 2)
  } finally { DB.sqlite.close() }
})

test('configuração interrompida é atômica e dados inválidos não reativam recursos', async () => {
  const DB = await database()
  try {
    DB.sqlite.exec("CREATE TRIGGER fail_setting BEFORE INSERT ON global_settings WHEN NEW.setting_key = 'templates' BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    await assert.rejects(core.saveGlobalSettings({ DB }, { search: false, templates: false }, 'admin@example.com'))
    assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM global_settings').get().n, 0)
    DB.sqlite.exec('DROP TRIGGER fail_setting')
    DB.sqlite.prepare("INSERT INTO global_settings VALUES ('templates','broken','now','admin@example.com')").run()
    await assert.rejects(core.globalSettingEnabled({ DB }, 'templates'), { status: 503 })
    await assert.rejects(core.getGlobalSettings({ DB }), { status: 503 })
    DB.fail = sql => sql.includes("name = ?") || sql.includes('COUNT(*) AS count FROM content_templates')
    await assert.rejects(core.listContentTemplates({ DB }))
  } finally { DB.sqlite.close() }
})

test('templates, usuários e metadados de arquivos retornam a gravação sem consulta posterior', async () => {
  const DB = await database()
  try {
    DB.fail = sql => sql.includes('SELECT * FROM content_templates WHERE id')
    const template = await core.saveContentTemplate({ DB }, { title: 'Example', call: '{{example}}' }, 'admin@example.com')
    assert.equal(template.title, 'Example')
    DB.sqlite.prepare("INSERT INTO editor_profiles(id,email,role,status,created_at,updated_at) VALUES ('admin','admin@example.com','admin','active','now','now')").run()
    DB.fail = null
    const batch = DB.batch.bind(DB)
    DB.batch = async statements => { const result = await batch(statements); DB.fail = () => true; return result }
    assert.equal((await core.updateEditorUser({ DB }, 'admin@example.com', { email: 'editor@example.com', displayName: 'Editor' })).displayName, 'Editor')
    DB.fail = null
    const file = await core.recordUpload({ DB }, { r2Key: 'uploads/example.png', filename: 'example.png', mimeType: 'image/png', sizeBytes: 8 })
    const prepare = DB.prepare.bind(DB)
    DB.prepare = sql => {
      const statement = prepare(sql)
      if (sql.includes('UPDATE uploads')) {
        const execute = statement.execute.bind(statement)
        statement.execute = method => { const result = execute(method); DB.fail = () => true; return result }
      }
      return statement
    }
    assert.equal((await core.updateUploadMetadata({ DB }, file.slug, { description: 'updated' })).description, 'updated')
  } finally { DB.sqlite.close() }
})
