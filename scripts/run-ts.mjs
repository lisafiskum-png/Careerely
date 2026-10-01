// Runs a TypeScript maintenance script outside Next.js:
//   node scripts/run-ts.mjs scripts/<name>.ts [args...]
// `server-only` (which keeps server modules out of client bundles) is stubbed.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { 'server-only': path.join(root, 'tests/stubs/server-only.ts') } })

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('Usage: node scripts/run-ts.mjs scripts/<name>.ts [args...]')
  process.exit(2)
}
const file = path.resolve(script)
process.argv = [process.argv[0], file, ...args]
await jiti.import(pathToFileURL(file).href)
