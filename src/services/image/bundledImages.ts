/**
 * Bundled sample artwork.
 *
 * Files placed in `src/assets` are exposed to CSV imports by file name (for
 * example `img1.jpeg` in the `image` column). They are loaded lazily as
 * inline base64 data URLs and only when a file actually references them, so
 * the application bundle stays small while imported cards still store
 * portable image data that can be rendered on screen and embedded in PDFs.
 */

const imageLoaders = import.meta.glob('/src/assets/**/*.{png,jpg,jpeg,webp}', {
  query: '?inline',
  import: 'default',
}) as Record<string, () => Promise<string>>

function basename(path: string): string {
  return path.split('/').pop()?.toLowerCase() ?? ''
}

/** Names of the artwork shipped with the application. */
export function getBundledImageNames(): string[] {
  return Object.keys(imageLoaders)
    .map((path) => basename(path))
    .filter((name) => name.length > 0)
    .sort()
}

/** Resolves a bare file name to its bundled data URL, if it exists. */
export async function resolveBundledImage(reference: string): Promise<string | null> {
  const name = basename(reference)
  if (!name) return null

  const entry = Object.entries(imageLoaders).find(([path]) => basename(path) === name)
  if (!entry) return null

  try {
    const dataUrl = await entry[1]()
    return dataUrl.startsWith('data:image/') ? dataUrl : null
  } catch {
    return null
  }
}

/**
 * Finds every bundled image referenced anywhere in `text` and resolves the
 * matches to data URLs. Referencing a file that does not exist is ignored
 * here; the CSV parser then reports the invalid image normally.
 */
export async function resolveBundledImagesInText(
  text: string,
): Promise<ReadonlyMap<string, string>> {
  const haystack = text.toLowerCase()
  const resolved = new Map<string, string>()

  for (const [path, load] of Object.entries(imageLoaders)) {
    const name = basename(path)
    if (!name || !haystack.includes(name) || resolved.has(name)) continue

    try {
      const dataUrl = await load()
      if (dataUrl.startsWith('data:image/')) {
        resolved.set(name, dataUrl)
      }
    } catch {
      continue
    }
  }

  return resolved
}

let allBundledImagesPromise: Promise<ReadonlyMap<string, string>> | null = null

/**
 * Resolves every bundled image once and caches the result. Used to recover
 * file names when exporting cards whose reference was not stored.
 */
export function resolveAllBundledImages(): Promise<ReadonlyMap<string, string>> {
  if (!allBundledImagesPromise) {
    allBundledImagesPromise = (async () => {
      const resolved = new Map<string, string>()

      for (const [path, load] of Object.entries(imageLoaders)) {
        const name = basename(path)
        if (!name || resolved.has(name)) continue

        try {
          const dataUrl = await load()
          if (dataUrl.startsWith('data:image/')) {
            resolved.set(name, dataUrl)
          }
        } catch {
          continue
        }
      }

      return resolved
    })()
  }

  return allBundledImagesPromise
}
