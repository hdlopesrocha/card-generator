<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Card } from '@/models/Card'
import { getCardTextLabels } from '@/config/languages'
import { getLocalizedCard } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'

const props = defineProps<{
  open: boolean
  cards: Card[]
  initialSelectedIds?: string[]
}>()

const emit = defineEmits<{
  close: []
  export: [payload: { cards: Card[] }]
}>()

const languageStore = useLanguageStore()

const labels = computed(() => getCardTextLabels(languageStore.language))

const displayCards = computed(() =>
  props.cards.map((card) => ({
    card,
    title: getLocalizedCard(card, languageStore.language).title.trim() || labels.value.untitled,
  })),
)

const uid = useId()
const titleId = `export-dialog-title-${uid}`

const selectedIds = ref<string[]>([])
const knownIds = new Set<string>()

function rememberCards(cards: Card[]): void {
  knownIds.clear()
  for (const card of cards) {
    knownIds.add(card.id)
  }
}

function syncCards(cards: Card[]): void {
  const validIds = new Set(cards.map((card) => card.id))
  const kept = selectedIds.value.filter((id) => validIds.has(id))
  const added = cards.filter((card) => !knownIds.has(card.id)).map((card) => card.id)
  selectedIds.value = [...kept, ...added]
  rememberCards(cards)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

function selectAll(): void {
  selectedIds.value = props.cards.map((card) => card.id)
}

function clearSelection(): void {
  selectedIds.value = []
}

function handleExport(): void {
  if (selectedIds.value.length === 0) {
    return
  }

  const selected = new Set(selectedIds.value)
  emit('export', {
    cards: props.cards.filter((card) => selected.has(card.id)),
  })
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      const validIds = new Set(props.cards.map((card) => card.id))
      selectedIds.value = props.initialSelectedIds
        ? props.initialSelectedIds.filter((id) => validIds.has(id))
        : props.cards.map((card) => card.id)
      rememberCards(props.cards)
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

watch(
  () => props.cards,
  (cards) => {
    if (props.open) {
      syncCards(cards)
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="dialog-backdrop" @click.self="emit('close')">
      <div
        class="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="dialog__header">
          <div>
            <h2 :id="titleId" class="dialog__title">{{ languageStore.t('export.title') }}</h2>
            <p class="dialog__description">{{ languageStore.t('export.description') }}</p>
          </div>
          <button
            type="button"
            class="dialog__close"
            :aria-label="languageStore.t('dialog.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="dialog__body">
          <div class="export-options">
            <fieldset>
              <legend>{{ languageStore.t('export.cardsToExport') }}</legend>
              <div class="export-selection">
                <div class="export-selection__toolbar">
                  <span>
                    {{
                      languageStore.t('export.selectedCount', {
                        selected: selectedIds.length,
                        total: cards.length,
                      })
                    }}
                  </span>
                  <span class="cluster">
                    <button
                      type="button"
                      class="btn btn--sm btn--ghost"
                      @click="selectAll"
                    >
                      {{ languageStore.t('common.selectAll') }}
                    </button>
                    <button
                      type="button"
                      class="btn btn--sm btn--ghost"
                      @click="clearSelection"
                    >
                      {{ languageStore.t('common.clearSelection') }}
                    </button>
                  </span>
                </div>

                <div class="export-selection__list">
                  <label
                    v-for="entry in displayCards"
                    :key="entry.card.id"
                    class="export-selection__item"
                  >
                    <input v-model="selectedIds" type="checkbox" :value="entry.card.id" />
                    <span class="export-selection__name">{{ entry.title }}</span>
                  </label>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        <footer class="dialog__footer">
          <button type="button" class="btn btn--secondary" @click="emit('close')">
            {{ languageStore.t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="selectedIds.length === 0"
            @click="handleExport"
          >
            {{ languageStore.t('common.export') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
