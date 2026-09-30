/**
 * Centralized application constants.
 *
 * Validation limits, image constraints, PDF defaults and storage keys live
 * here so behaviour stays consistent across components, stores and services.
 */

export const APP_NAME = 'Card Generator'

export const CARD_LIMITS = {
  title: { minLength: 1, maxLength: 60 },
  subtitle: { maxLength: 80 },
  action: { minLength: 1, maxLength: 240 },
  attack: { min: 0, max: 999 },
  defense: { min: 0, max: 999 },
  stars: { min: 1, max: 3 },
} as const

export const IMAGE_CONSTRAINTS = {
  /** Maximum accepted upload size: 5 MB. */
  maxSizeBytes: 5 * 1024 * 1024,
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] as const,
  acceptedExtensions: ['.png', '.jpg', '.jpeg', '.webp'] as const,
  /** Largest edge used when re-encoding an upload for local storage. */
  maxDimensionPx: 1400,
} as const

export const IMAGE_QUALITY = {
  min: 0.5,
  max: 1,
  step: 0.05,
  default: 0.85,
} as const

export const PDF_CONSTANTS = {
  /** Default physical card size in millimetres (63 x 88 mm). */
  cardWidthMm: 63,
  cardHeightMm: 88,
  minCardWidthMm: 40,
  maxCardWidthMm: 110,
  minCardHeightMm: 56,
  maxCardHeightMm: 154,
  /** mm -> PDF points conversion (72 points per inch, 25.4 mm per inch). */
  mmToPt: 72 / 25.4,
} as const

export const STORAGE_KEYS = {
  settings: 'card-generator:settings',
  language: 'card-generator:language',
} as const

export const BACKUP_APP_ID = 'card-generator'
export const BACKUP_VERSION = 1

/** localStorage key used to remember that demo cards were already seeded. */
export const DEMO_SEEDED_KEY = 'card-generator:demo-seeded'
