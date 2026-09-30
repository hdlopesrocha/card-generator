/**
 * Filename helpers shared by the CSV and PDF export services.
 */

/** Lower-cases a name and removes characters that are unsafe in download names. */
export function sanitizeFilename(name: string): string {
  const collapsed = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')

  return collapsed || 'card'
}

/** Formats a date as YYYY-MM-DD (local time). */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
