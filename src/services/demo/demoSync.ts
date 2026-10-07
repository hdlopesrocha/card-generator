/**
 * Content-hash synchronization for the bundled demo cards.
 *
 * Demo cards are app-owned content seeded into IndexedDB on first launch.
 * When a bundled definition changes (for example a stat rebalance), stored
 * copies would otherwise stay stale forever. This module refreshes stored
 * demo cards that the user never customized, while leaving user-edited
 * cards untouched.
 *
 * Two mechanisms combine on every load, for each stored card whose id
 * matches a bundled demo card with untouched English texts:
 *
 * 1. Additive backfill (always safe): empty translation slots are filled
 *    from the bundle and missing artwork is resolved. Nothing the user
 *    wrote is ever overwritten.
 *
 * 2. Content refresh (hash-gated): scalar fields (texts, stats, zone,
 *    stars, image reference) are adopted from the bundle when a baseline
 *    proves the user did not customize them:
 *    - `storedHash === syncedHash`: the card still matches the last
 *      seeded/synced content, so the bundle must have changed.
 *    - no `syncedHash` recorded (databases seeded before hash tracking
 *      existed): one-time heuristic, documented below.
 *
 * Change detection uses an FNV-1a content hash over the canonical card
 * content. The data-URL artwork (`image`) is derived from `imageRef` and
 * therefore excluded from the hash; translations are included.
 *
 * Legacy heuristic (no recorded baseline): cards whose English texts still
 * match the bundle are treated as app-owned and refreshed. This cannot
 * tell a user stat tweak apart from a bundle change, so stat-only edits on
 * pre-existing demo cards may be refreshed once. Afterwards a baseline hash
 * is recorded and tracking is exact: any local edit opts the card out of
 * future refreshes (gaps are still backfilled).
 */

import { DEMO_HASHES_KEY } from '@/config/constants'
import { createSampleCards } from '@/data/sampleCards'
import type { Card } from '@/models/Card'
import { resolveBundledImage } from '@/services/image/bundledImages'

export type DemoHashes = Record<string, string>

export interface DemoSyncResult {
  /** Stored cards rewritten with the bundled content. Persist with bulkPut. */
  updates: Card[]
  /** Complete hash map to persist (seeded/synced ids recorded). */
  hashes: DemoHashes
  /** Whether `hashes` differs from the input map and should be saved. */
  hashesChanged: boolean
}

/** Canonical, order-stable snapshot of everything that defines card content. */
function canonicalContent(card: Card): unknown {
  const languages = Object.keys(card.translations ?? {}).sort()
  const translations: Record<string, { title: string; subtitle: string; action: string }> = {}

  for (const language of languages) {
    const entry = card.translations[language as keyof typeof card.translations]
    translations[language] = {
      title: entry?.title ?? '',
      subtitle: entry?.subtitle ?? '',
      action: entry?.action ?? '',
    }
  }

  return {
    title: card.title,
    subtitle: card.subtitle,
    attack: card.attack,
    defense: card.defense,
    action: card.action,
    zone: card.zone,
    stars: card.stars,
    imageRef: card.imageRef ?? null,
    translations,
  }
}

/**
 * Short, deterministic content fingerprint (FNV-1a, 32-bit). Used only for
 * change detection, not for security.
 */
export function hashDemoContent(card: Card): string {
  const json = JSON.stringify(canonicalContent(card))
  let hash = 0x811c9dc5

  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Reads the last-synced demo hashes; unknown/corrupt storage means none. */
export function readDemoHashes(): DemoHashes {
  const storage = getStorage()
  if (!storage) return {}

  try {
    const raw = storage.getItem(DEMO_HASHES_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const hashes: DemoHashes = {}
    for (const [id, hash] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hash === 'string') hashes[id] = hash
    }
    return hashes
  } catch {
    return {}
  }
}

/** Persists the last-synced demo hashes. Failures are silently ignored. */
export function writeDemoHashes(hashes: DemoHashes): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(DEMO_HASHES_KEY, JSON.stringify(hashes))
  } catch {
    return
  }
}

/** Hashes the given cards keyed by id, for recording after seed/restore. */
export function hashesForCards(cards: Card[]): DemoHashes {
  const hashes: DemoHashes = {}
  for (const card of cards) {
    hashes[card.id] = hashDemoContent(card)
  }
  return hashes
}

function isTranslationEmpty(entry?: { title: string; subtitle: string; action: string }): boolean {
  return !entry || (!entry.title.trim() && !entry.subtitle.trim() && !entry.action.trim())
}

function scalarsEqual(stored: Card, sample: Card): boolean {
  return (
    stored.title === sample.title &&
    stored.subtitle === sample.subtitle &&
    stored.attack === sample.attack &&
    stored.defense === sample.defense &&
    stored.action === sample.action &&
    stored.zone === sample.zone &&
    stored.stars === sample.stars &&
    (stored.imageRef ?? null) === (sample.imageRef ?? null)
  )
}

/**
 * Compares persisted demo cards against the bundled definitions and returns
 * the updates plus the hash map to record. Cards whose English texts were
 * edited are never touched; every other demo card gets missing translations
 * and artwork backfilled, and scalar fields are additionally adopted from
 * the bundle when the recorded baseline proves the user did not customize
 * them (see the module documentation).
 */
export async function collectDemoSync(
  loaded: Card[],
  knownHashes: DemoHashes,
): Promise<DemoSyncResult> {
  const samples = new Map(createSampleCards().map((card) => [card.id, card]))
  const hashes: DemoHashes = { ...knownHashes }
  let hashesChanged = false
  const updates: Card[] = []

  for (const card of loaded) {
    const sample = samples.get(card.id)
    if (!sample) continue

    if (
      card.title !== sample.title ||
      card.subtitle !== sample.subtitle ||
      card.action !== sample.action
    ) {
      continue
    }

    const sampleHash = hashDemoContent(sample)
    const storedHash = hashDemoContent(card)
    const syncedHash = hashes[card.id]

    let next = card
    let adopted = false

    const mayAdopt =
      syncedHash === undefined || storedHash === syncedHash || scalarsEqual(card, sample)
    if (mayAdopt && !scalarsEqual(card, sample)) {
      next = {
        ...next,
        title: sample.title,
        subtitle: sample.subtitle,
        attack: sample.attack,
        defense: sample.defense,
        action: sample.action,
        zone: sample.zone,
        stars: sample.stars,
        imageRef: sample.imageRef ?? null,
      }
      adopted = true
    }

    const translations = { ...(next.translations ?? {}) }
    let backfilled = false
    for (const [language, entry] of Object.entries(sample.translations)) {
      const key = language as keyof typeof translations
      if (isTranslationEmpty(translations[key])) {
        translations[key] = entry
        backfilled = true
      }
    }
    if (backfilled) {
      next = { ...next, translations }
    }

    // Missing artwork is always resolved (preferring the stored reference so
    // a custom image is never replaced), mirroring the previous upgrade.
    const targetRef = (next.imageRef ?? null) ?? (sample.imageRef ?? null)
    if (!next.image && targetRef) {
      try {
        const dataUrl = await resolveBundledImage(targetRef)
        if (dataUrl) {
          next = { ...next, image: dataUrl, imageRef: targetRef }
        }
      } catch {
        // Keep the card untouched when the artwork cannot be resolved.
      }
    }

    if (next !== card) {
      updates.push(next)
    }

    if (adopted || storedHash === sampleHash) {
      const finalHash = hashDemoContent(next)
      if (hashes[next.id] !== finalHash) {
        hashes[next.id] = finalHash
        hashesChanged = true
      }
    }
  }

  return { updates, hashes, hashesChanged }
}
