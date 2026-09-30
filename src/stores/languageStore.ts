import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { STORAGE_KEYS } from '@/config/constants'
import { translate, type MessageKey } from '@/config/languages'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/models/Language'

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readStoredLanguage(): Language {
  const storage = getStorage()
  if (!storage) return DEFAULT_LANGUAGE

  try {
    const raw = storage.getItem(STORAGE_KEYS.language)
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/**
 * Single application language. Drives every UI label, the language rendered
 * on cards and the language used for PDF export. Persisted to localStorage.
 */
export const useLanguageStore = defineStore('language', () => {
  const language = ref<Language>(readStoredLanguage())

  function t(key: MessageKey, params?: Record<string, string | number>): string {
    return translate(key, language.value, params)
  }

  function setLanguage(value: Language): void {
    if (isLanguage(value)) {
      language.value = value
    }
  }

  watch(
    language,
    (value) => {
      const storage = getStorage()
      if (!storage) return

      try {
        storage.setItem(STORAGE_KEYS.language, value)
      } catch {
        return
      }
    },
    { immediate: true },
  )

  return { language, t, setLanguage }
})
