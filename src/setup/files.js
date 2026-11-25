import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'

export const IGNORE = new Set(['.git', '.wrangler', 'node_modules', '__pycache__', '.DS_Store', '__MACOSX', '_worker.bundle'])
// mantém os locks nativos vivos durante operações assíncronas
const activeLocks = new Set()
export const readJson = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return structuredClone(fallback) } }
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temporary, file)
  } finally { fs.rmSync(temporary, { force: true }) }
}
export function hash(file) {
  const digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(file, 'r')
  try { let length; while ((length = fs.readSync(fd, buffer)) > 0) digest.update(buffer.subarray(0, length)); return digest.digest('hex') } finally { fs.closeSync(fd) }
}
export function safePath(value) {
  if (typeof value !== 'string' || !value || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..' || part !== part.replace(/[ .]+$/, '') || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))) throw new Error('caminho inválido')
  return value
}
export function inside(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
}
export function checkAncestors(file) {
  for (let current = path.resolve(file);; current = path.dirname(current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('caminho simbólico na instalação') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (path.dirname(current) === current) break
  }
}
export function walk(root, excluded = new Set()) {
  checkAncestors(root)
  const files = []
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (excluded.has(name)) continue
      const file = path.join(directory, name), stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error('caminho simbólico na instalação')
      if (stat.isDirectory()) visit(file)
      else if (stat.isFile()) files.push(file)
      else throw new Error('tipo de arquivo não permitido')
    }
  }
  visit(root)
  return files
}
export function copyTree(source, target, excluded = new Set()) {
  for (const file of walk(source, excluded)) {
    const destination = path.join(target, path.relative(source, file))
    checkAncestors(destination)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(file, destination)
    fs.chmodSync(destination, fs.statSync(file).mode & 0o777)
  }
}
export function removeWithin(root, target) {
  if (!inside(root, target)) throw new Error('caminho fora do diretório permitido')
  checkAncestors(target)
  fs.rmSync(target, { recursive: true, force: true })
}
export function decodeBase64(value, maximum) {
  const encoded = String(value).split(',').at(-1)
  if (encoded.length > Math.ceil(maximum / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('conteúdo base64 inválido ou longo demais')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > maximum) throw new Error('conteúdo vazio ou longo demais')
  return bytes
}
export async function operationLock(root, operation) {
  const directory = path.join(root, '.wikicambada')
  checkAncestors(directory); fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, 'operation.lock.sqlite')
  checkAncestors(file)
  const db = new DatabaseSync(file)
  activeLocks.add(db)
  let acquired = false
  try {
    try { db.exec('PRAGMA busy_timeout = 0; CREATE TABLE IF NOT EXISTS operation_lock (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE; INSERT OR REPLACE INTO operation_lock VALUES (1)'); acquired = true }
    catch { throw new Error('outra operação local está em andamento') }
    return await operation()
  } finally { try { if (acquired) db.exec('ROLLBACK') } finally { activeLocks.delete(db); db.close() } }
}
