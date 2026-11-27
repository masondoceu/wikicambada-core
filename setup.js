#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { Project } from './src/setup/project.js'
import { buildPackage } from './src/setup/distribution.js'
import { migrateLegacy } from './src/setup/legacy.js'
import { backupLocal, restoreLocal, snapshotConfiguration } from './src/setup/recovery.js'
import { RecoveryClient, backupRemote, restoreRemote } from './src/setup/remote-recovery.js'
import { recoverInterrupted } from './src/setup/updater.js'
import { removeWithin } from './src/setup/files.js'
import { startServer } from './src/setup/server.js'

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: Object.fromEntries(['output', 'source', 'database', 'objects', 'archive', 'configuration', 'url', 'token-file', 'state-file', 'port', 'host'].map(name => [name, { type: 'string' }]).concat([['resume', { type: 'boolean' }], ['no-browser', { type: 'boolean' }], ['help', { type: 'boolean' }]])) })
  const command = positionals[0] || 'serve', project = new Project(), required = (...names) => { for (const name of names) if (!values[name]) throw new Error('--' + name + ' é obrigatório') }
  if (values.help) { console.log('WikiCambada Core setup: serve, verify, package, migrate-legacy, backup-local, restore-local, recover-local, backup, restore, abort-recovery\nnode setup.js migrate-legacy --source <directory-or-zip> --output <new-directory>'); return }
  let result
  if (command === 'serve') {
    const app = await startServer({ project, port: values.port === undefined ? 8765 : Number(values.port), host: values.host || '127.0.0.1', openBrowser: !values['no-browser'] })
    console.log('WikiCambada Core setup: ' + app.origin)
    const stop = () => app.shutdown(); process.once('SIGINT', stop); process.once('SIGTERM', stop)
    await app.closed; process.off('SIGINT', stop); process.off('SIGTERM', stop); return
  }
  if (command === 'verify') { result = project.verify(); if (!result.ok) process.exitCode = 1 }
  else if (command === 'package') { required('output'); result = await buildPackage(values.output, project) }
  else if (command === 'migrate-legacy') { required('source', 'output'); result = await migrateLegacy(project, { source: path.resolve(values.source), destination: path.resolve(values.output) }) }
  else if (command === 'recover-local') result = await recoverInterrupted(project)
  else if (command === 'backup-local') { required('output', 'database', 'objects'); result = await backupLocal(values.database, values.objects, values.output, values.configuration) }
  else if (command === 'restore-local') { required('archive', 'output'); result = await restoreLocal(values.archive, values.output) }
  else if (['backup', 'restore', 'abort-recovery'].includes(command)) {
    required('url', 'token-file')
    const client = new RecoveryClient(values.url, fs.readFileSync(values['token-file'], 'utf8').trim()), state = values['state-file'] || project.file('.wikicambada/recovery-remote.json')
    if (command === 'backup') {
      required('output')
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-backup-config-'))
      try { result = await backupRemote(client, values.output, values.configuration || snapshotConfiguration(project, path.join(directory, 'configuration'))) } finally { removeWithin(os.tmpdir(), directory) }
    } else if (command === 'restore') { required('archive'); result = await restoreRemote(client, values.archive, state, values.resume) }
    else { const operation = (await client.json('GET')).operation; if (operation) { client.token = operation.token; await client.abort() } fs.rmSync(state, { force: true }); result = { ok: true } }
  } else throw new Error(`Invalid command: ${command}`)
  console.log(JSON.stringify(result, null, 2))
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main().catch(error => { console.error(error.code ? 'Could not complete the local operation' : error.message); process.exitCode = 1 })
