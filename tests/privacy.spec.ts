import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Privacy guardrails.
 *
 * The application is intentionally client-only: cards are stored in the
 * browser (IndexedDB/localStorage) and only leave it through files the user
 * downloads to disk (CSV / JSON backup / PDF / ZIP). These tests fail if code
 * that could send card data to the network is introduced, or if card data is
 * ever committed to the git repository (and therefore pushed to GitHub).
 */

const projectRoot = resolve(process.cwd())
const sourceRoot = resolve(projectRoot, 'src')

function collectFiles(directory: string, extensions: string[]): string[] {
  const results: string[] = []
  const stack = [directory]

  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  }

  return results
}

describe('privacy: cards never leave the browser', () => {
  it('contains no network or exfiltration primitives in the application source', () => {
    const files = [
      ...collectFiles(sourceRoot, ['.ts', '.js', '.vue']),
      resolve(projectRoot, 'index.html'),
    ]

    const forbidden = [
      { label: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
      { label: 'navigator.sendBeacon', pattern: /navigator\.sendBeacon/ },
      { label: 'WebSocket', pattern: /new\s+WebSocket/ },
      { label: 'EventSource', pattern: /new\s+EventSource/ },
      { label: 'absolute http(s) URL', pattern: /https?:\/\// },
    ]

    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const rule of forbidden) {
        if (rule.pattern.test(text)) {
          offenders.push(`${relative(projectRoot, file)} -> ${rule.label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('only fetches bundled same-origin font assets', () => {
    const files = collectFiles(sourceRoot, ['.ts', '.js', '.vue'])
    const fetchSites = files.filter((file) => /\bfetch\s*\(/.test(readFileSync(file, 'utf8')))

    // The PDF exporter reads bundled font files; there is no other fetch.
    expect(fetchSites.map((file) => relative(projectRoot, file))).toEqual([
      join('src', 'services', 'pdf', 'cardPdfService.ts'),
    ])
  })

  it('does not track card data files in git', () => {
    let tracked: string[] | null = null
    try {
      tracked = execFileSync('git', ['ls-files'], { cwd: projectRoot, encoding: 'utf8' })
        .split('\n')
        .filter((line) => line.trim().length > 0)
    } catch {
      tracked = null
    }

    if (tracked === null) {
      // Not a git checkout: nothing to enforce here.
      return
    }

    const cardData = /\.(csv|db|sqlite3?|db3|mdb|zip|pdf)$/i
    const backupJson = /backup.*\.json$/i

    const offenders = tracked.filter((file) => {
      const name = file.split('/').pop()?.toLowerCase() ?? ''
      // `sample.csv` is the bundled demo template of programmatic dummy cards.
      if (name === 'sample.csv') return false
      return cardData.test(name) || backupJson.test(name)
    })

    expect(offenders).toEqual([])
  })
})
