<script setup lang="ts">
import { computed } from 'vue'

import CardPreview from '@/components/CardPreview.vue'
import { getCardTextLabels, getLanguageName } from '@/config/languages'
import { getZoneTheme } from '@/config/zones'
import type { Card } from '@/models/Card'
import { hasTranslation } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const props = defineProps<{
  card: Card
}>()

const emit = defineEmits<{
  edit: [card: Card]
  preview: [card: Card]
  pdf: [card: Card]
  delete: [card: Card]
}>()

const languageStore = useLanguageStore()
const settings = useSettingsStore()

const labels = computed(() => getCardTextLabels(languageStore.language))

const displayTitle = computed(() => props.card.title.trim() || labels.value.untitled)

const theme = computed(() => getZoneTheme(props.card.zone))

const missingTranslation = computed(
  () => languageStore.language !== 'EN' && !hasTranslation(props.card, languageStore.language),
)

const fallbackLabel = computed(() =>
  languageStore.t('cards.fallbackBadge', {
    language: getLanguageName(languageStore.language),
  }),
)
</script>

<template>
  <article class="card-list-item">
    <div class="card-list-item__preview">
      <CardPreview
        :card="card"
        :width-px="320"
        :aspect-ratio="settings.cardAspectRatio"
      />
    </div>

    <footer class="card-list-item__footer" :class="theme.className">
      <span
        v-if="missingTranslation"
        class="stat-chip stat-chip--fallback"
        :title="fallbackLabel"
      >
        EN
      </span>

      <div class="card-list-item__actions">
        <button
          type="button"
          class="btn btn--sm btn--secondary"
          :aria-label="languageStore.t('cards.ariaPreview', { title: displayTitle })"
          @click="emit('preview', card)"
        >
          {{ languageStore.t('common.preview') }}
        </button>
        <button
          type="button"
          class="btn btn--sm btn--secondary"
          :aria-label="languageStore.t('cards.ariaEdit', { title: displayTitle })"
          @click="emit('edit', card)"
        >
          {{ languageStore.t('common.edit') }}
        </button>
        <button
          type="button"
          class="btn btn--sm btn--secondary"
          :aria-label="languageStore.t('cards.ariaPdf', { title: displayTitle })"
          @click="emit('pdf', card)"
        >
          {{ languageStore.t('common.generatePdf') }}
        </button>
        <button
          type="button"
          class="btn btn--sm btn--danger"
          :aria-label="languageStore.t('cards.ariaDelete', { title: displayTitle })"
          @click="emit('delete', card)"
        >
          {{ languageStore.t('common.delete') }}
        </button>
      </div>
    </footer>
  </article>
</template>
