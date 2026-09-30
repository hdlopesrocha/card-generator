<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import LanguageFlag from '@/components/LanguageFlag.vue'
import { getLanguageName, LANGUAGES, type Language } from '@/models/Language'
import { useLanguageStore } from '@/stores/languageStore'

const languageStore = useLanguageStore()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const optionElements = ref<HTMLButtonElement[]>([])

function setOptionRef(element: Element | null, index: number): void {
  if (element instanceof HTMLButtonElement) {
    optionElements.value[index] = element
  }
}

function currentIndex(): number {
  return Math.max(
    0,
    LANGUAGES.findIndex((option) => option.code === languageStore.language),
  )
}

async function openMenu(): Promise<void> {
  open.value = true
  await nextTick()
  optionElements.value[currentIndex()]?.focus()
}

function close(restoreFocus = true): void {
  open.value = false
  if (restoreFocus) {
    trigger.value?.focus()
  }
}

function toggle(): void {
  if (open.value) {
    close()
  } else {
    void openMenu()
  }
}

function select(language: Language): void {
  languageStore.setLanguage(language)
  close()
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) {
    close(false)
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  event.preventDefault()
  const total = LANGUAGES.length
  let index = optionElements.value.findIndex((element) => element === document.activeElement)

  if (event.key === 'Home') index = 0
  else if (event.key === 'End') index = total - 1
  else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + total) % total

  optionElements.value[index]?.focus()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="language-picker">
    <button
      ref="trigger"
      type="button"
      class="language-picker__button"
      :aria-label="languageStore.t('language.label')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
      @keydown.down.prevent="openMenu"
    >
      <LanguageFlag :language="languageStore.language" />
      <span class="language-picker__name">{{ getLanguageName(languageStore.language) }}</span>
      <span class="language-picker__chevron" aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="language-picker__menu"
      role="menu"
      :aria-label="languageStore.t('language.label')"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="(option, index) in LANGUAGES"
        :key="option.code"
        :ref="(element) => setOptionRef(element as Element | null, index)"
        type="button"
        class="language-picker__option"
        :class="{ 'is-active': option.code === languageStore.language }"
        role="menuitemradio"
        :aria-checked="option.code === languageStore.language"
        :data-language="option.code"
        @click="select(option.code)"
      >
        <LanguageFlag :language="option.code" />
        <span>{{ option.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-picker {
  position: relative;
  display: inline-flex;
}

.language-picker__button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  font-weight: 650;
  font-size: 0.85rem;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}

.language-picker__button:hover {
  background: var(--color-surface-2);
  border-color: color-mix(in srgb, var(--color-border-strong) 70%, white 12%);
}

.language-picker__name {
  white-space: nowrap;
}

.language-picker__chevron {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.language-picker__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  min-width: 190px;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.language-picker__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: 0.88rem;
  text-align: left;
  cursor: pointer;
}

.language-picker__option:hover,
.language-picker__option:focus-visible {
  background: var(--color-surface-2);
}

.language-picker__option.is-active {
  background: var(--color-primary-soft);
  color: var(--color-text);
  font-weight: 700;
}
</style>
