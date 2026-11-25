import { readdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'

function migrationSources() { return readdirSync('src/data/migrations').filter(name => name.endsWith('.sql')).sort().map(name => readFileSync('src/data/migrations/' + name, 'utf8')) }

export function migrationStatements() {
  const db = new DatabaseSync(':memory:')
  try {
    return migrationSources().map(source => {
      const statements = []
      let buffer = ''
      for (const character of source) {
        buffer += character
        if (character !== ';') continue
        try { db.prepare(buffer) } catch { continue }
        db.exec(buffer); statements.push(buffer); buffer = ''
      }
      if (buffer.trim()) db.exec(buffer)
      return statements
    })
  } finally { db.close() }
}

export async function loadFunction(path) {
  const result = await build({ entryPoints: [path], bundle: true, format: 'esm', platform: 'neutral', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

export async function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of (await readdir('src/data/migrations')).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(await readFile(`src/data/migrations/${file}`, 'utf8'))
  const db = {
    sqlite,
    fail: null,
    prepare(sql) {
      let args = []
      return {
        sql,
        bind(...values) { args = values; return this },
        execute(method) {
          if (db.fail?.(sql)) throw new Error('injected storage failure')
          return sqlite.prepare(sql)[method](...args)
        },
        async first() { return this.execute('get') || null },
        async all() { return { success: true, results: this.execute('all') } },
        async run() { return { success: true, meta: this.execute('run') } }
      }
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => ({ success: true, results: statement.execute('all') }))
        sqlite.exec('COMMIT')
        return results
      } catch (cause) { sqlite.exec('ROLLBACK'); throw cause }
    }
  }
  return db
}
