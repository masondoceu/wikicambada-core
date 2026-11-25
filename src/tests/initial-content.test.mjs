import test from 'node:test'
import assert from 'node:assert/strict'
import { database, loadFunction } from './helpers.mjs'
const { seedInitialContent } = await loadFunction('functions/api/_lib/initial-content.ts')
const core = await loadFunction('functions/api/_lib/d1.ts')
for (const language of ['pt-BR', 'en']) test(`seed nativo ${language} é atômico, editável e não recria páginas removidas`, async () => {
  const DB = await database(), env = { DB, WIKI_INITIAL_CONTENT: JSON.stringify({ id: 'new', language, homeSlug: 'home', guideSlug: 'guide' }) }
  try {
    DB.fail = sql => sql.includes('INSERT INTO revisions')
    await assert.rejects(seedInitialContent(env))
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM pages').get().n, 0)
    assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM system_settings WHERE key='initial_content'").get().n, 0)
    DB.fail = null
    await Promise.all([seedInitialContent(env), seedInitialContent(env)])
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM pages').get().n, 2)
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM revisions').get().n, 2)
    const page = await core.readPage(env, 'home')
    assert.match(page.content, language === 'en' ? /Welcome/ : /Bem-vindo/)
    await core.writePage(env, 'home', { title: 'Updated', content: 'updated', summary: 'edit', expectedRevisionId: page.currentRevisionId }, 'editor@example.com')
    await core.deletePage(env, 'guide', 'admin@example.com'); await core.hardDeletePage(env, 'guide')
    await seedInitialContent(env)
    assert.equal(await core.readPage(env, 'guide'), null)
    assert.equal((await core.readPage(env, 'home')).content, 'updated')
    assert.equal((await core.listPageRevisions(env, 'home')).total, 2)
  } finally { DB.sqlite.close() }
})
test('seed não altera instalação existente e não atua sem configuração explícita de instalação nova', async () => {
  const DB = await database()
  try {
    await seedInitialContent({ DB }); assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM pages').get().n, 0)
    await core.writePage({ DB }, 'existing', { title: 'Existing', content: 'existing', summary: 'new', expectedRevisionId: null }, 'editor@example.com')
    await seedInitialContent({ DB, WIKI_INITIAL_CONTENT: JSON.stringify({ id: 'new', language: 'pt-BR', homeSlug: 'home', guideSlug: 'guide' }) })
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM pages').get().n, 1)
  } finally { DB.sqlite.close() }
})
