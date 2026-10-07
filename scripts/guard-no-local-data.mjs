/**
 * Deploy guard: refuses to publish local card data.
 *
 * Cards are meant to exist only in the browser (IndexedDB / localStorage) or
 * in files the user downloads to disk (CSV / JSON backup / PDF / ZIP). They
 * must never end up in the `dist/` directory that is pushed to GitHub Pages.
 *
 * This script walks a directory (the build output by default) and exits with a
 * non-zero status when it finds any file that looks like card data, so a
 * misconfigured build can never silently upload a collection.
 *
 * Usage:
 *   node scripts/guard-no-local-data.mjs [directory]
 */
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const FORBIDDEN_EXTENSIONS = new Set([
  '.csv',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.db3',
  '.mdb',
  '.zip',
  '.pdf',
])

// JSON is legitimate in a build (manifests, source maps metadata), but JSON
// backups are not. Match names such as `card-generator-backup-2026-10-07.json`.
const FORBIDDEN_JSON = /(^|[-_.])backup([-_.]|$)/i

function isForbidden(fileName) {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const extension = dot >= 0 ? lower.slice(dot) : ''

  if (FORBIDDEN_EXTENSIONS.has(extension)) return true
  if (extension === '.json' && FORBIDDEN_JSON.test(lower)) return true
  return false
}

function findForbiddenFiles(directory) {
  const found = []
  const stack = [directory]

  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && isForbidden(entry.name)) {
        found.push(fullPath)
      }
    }
  }

  return found
}

const target = resolve(process.argv[2] ?? 'dist')
const offenders = findForbiddenFiles(target).map(
  (file) => relative(process.cwd(), file) || file,
)

if (offenders.length > 0) {
  console.error(`Refusing to publish: local card data found in ${target}`)
  for (const file of offenders) console.error(`  - ${file}`)
  console.error(
    '\nCards must only live in IndexedDB/localStorage or in CSVs on disk, never in a published build.',
  )
  process.exit(1)
}

const label = relative(process.cwd(), target) || target
console.log(`No local card data found in ${label}. Safe to publish.`)
