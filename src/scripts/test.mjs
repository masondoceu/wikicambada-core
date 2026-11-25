import { spawnSync } from 'node:child_process'

const checks = [
  [process.execPath, ['--test', 'src/tests/*.test.mjs']],
  [process.execPath, ['node_modules/typescript/bin/tsc', '--pretty', 'false']]
]
for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
