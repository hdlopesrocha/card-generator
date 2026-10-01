import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { IMAGE_QUALITY, PDF_CONSTANTS, STORAGE_KEYS } from '@/config/constants'
import { DEFAULT_CARD_FONT_ID, isCardFontId } from '@/config/fonts'

export interface AppSettings {
  cardWidthMm: number
  cardHeightMm: number
  imageQuality: number
  cardFontId: string
}

const DEFAULT_SETTINGS: AppSettings = {
  cardWidthMm: PDF_CONSTANTS.cardWidthMm,
  cardHeightMm: PDF_CONSTANTS.cardHeightMm,
  imageQuality: IMAGE_QUALITY.default,
  cardFontId: DEFAULT_CARD_FONT_ID,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readStoredSettings(): Partial<AppSettings> {
  const storage = getStorage()
  if (!storage) return {}

  try {
    const raw = storage.getItem(STORAGE_KEYS.settings)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}

    const settings: Partial<AppSettings> = {}

    if (typeof parsed.cardWidthMm === 'number' && Number.isFinite(parsed.cardWidthMm)) {
      settings.cardWidthMm = clamp(
        parsed.cardWidthMm,
        PDF_CONSTANTS.minCardWidthMm,
        PDF_CONSTANTS.maxCardWidthMm,
      )
    }

    if (typeof parsed.cardHeightMm === 'number' && Number.isFinite(parsed.cardHeightMm)) {
      settings.cardHeightMm = clamp(
        parsed.cardHeightMm,
        PDF_CONSTANTS.minCardHeightMm,
        PDF_CONSTANTS.maxCardHeightMm,
      )
    }

    if (typeof parsed.imageQuality === 'number' && Number.isFinite(parsed.imageQuality)) {
      settings.imageQuality = clamp(parsed.imageQuality, IMAGE_QUALITY.min, IMAGE_QUALITY.max)
    }

    if (isCardFontId(parsed.cardFontId)) {
      settings.cardFontId = parsed.cardFontId
    }

    return settings
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const stored = readStoredSettings()

  const cardWidthMm = ref<number>(stored.cardWidthMm ?? DEFAULT_SETTINGS.cardWidthMm)
  const cardHeightMm = ref<number>(stored.cardHeightMm ?? DEFAULT_SETTINGS.cardHeightMm)
  const imageQuality = ref<number>(stored.imageQuality ?? DEFAULT_SETTINGS.imageQuality)
  const cardFontId = ref<string>(stored.cardFontId ?? DEFAULT_SETTINGS.cardFontId)

  const cardAspectRatio = computed(() => `${cardWidthMm.value} / ${cardHeightMm.value}`)

  function persist(): void {
    const storage = getStorage()
    if (!storage) return

    const settings: AppSettings = {
      cardWidthMm: cardWidthMm.value,
      cardHeightMm: cardHeightMm.value,
      imageQuality: imageQuality.value,
      cardFontId: cardFontId.value,
    }

    try {
      storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
    } catch {
      return
    }
  }

  function setCardDimensions(widthMm: number, heightMm: number): void {
    if (Number.isFinite(widthMm)) {
      cardWidthMm.value = clamp(
        widthMm,
        PDF_CONSTANTS.minCardWidthMm,
        PDF_CONSTANTS.maxCardWidthMm,
      )
    }

    if (Number.isFinite(heightMm)) {
      cardHeightMm.value = clamp(
        heightMm,
        PDF_CONSTANTS.minCardHeightMm,
        PDF_CONSTANTS.maxCardHeightMm,
      )
    }
  }

  function setImageQuality(value: number): void {
    if (Number.isFinite(value)) {
      imageQuality.value = clamp(value, IMAGE_QUALITY.min, IMAGE_QUALITY.max)
    }
  }

  function setCardFont(id: string): void {
    if (isCardFontId(id)) {
      cardFontId.value = id
    }
  }

  function resetToDefaults(): void {
    cardWidthMm.value = DEFAULT_SETTINGS.cardWidthMm
    cardHeightMm.value = DEFAULT_SETTINGS.cardHeightMm
    imageQuality.value = DEFAULT_SETTINGS.imageQuality
    cardFontId.value = DEFAULT_SETTINGS.cardFontId
  }

  watch([cardWidthMm, cardHeightMm, imageQuality, cardFontId], persist)

  return {
    cardWidthMm,
    cardHeightMm,
    imageQuality,
    cardFontId,
    cardAspectRatio,
    setCardDimensions,
    setImageQuality,
    setCardFont,
    resetToDefaults,
  }
})
