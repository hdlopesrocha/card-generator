/**
 * Prepares the production build for GitHub Pages:
 * - copies index.html to 404.html so client-side routes work on refresh
 * - adds .nojekyll so GitHub serves the files as-is
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const distDirectory = resolve(process.cwd(), 'dist')
const indexFile = resolve(distDirectory, 'index.html')

if (!existsSync(indexFile)) {
  console.error('dist/index.html was not found. Run the build before this script.')
  process.exit(1)
}

copyFileSync(indexFile, resolve(distDirectory, '404.html'))
writeFileSync(resolve(distDirectory, '.nojekyll'), '')

console.log('GitHub Pages fallback created: dist/404.html and dist/.nojekyll')
