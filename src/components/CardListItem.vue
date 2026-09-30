<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '@/models/Card'
import { getCardTextLabels, getLanguageName, getZoneLabel } from '@/config/languages'
import { getZoneTheme } from '@/config/zones'
import { getLocalizedCard, hasTranslation } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'

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

const displayCard = computed(() => getLocalizedCard(props.card, languageStore.language))

const labels = computed(() => getCardTextLabels(languageStore.language))

const zoneLabel = computed(() => getZoneLabel(props.card.zone, languageStore.language))

const theme = computed(() => getZoneTheme(props.card.zone))

const displayTitle = computed(() => displayCard.value.title.trim() || labels.value.untitled)

const starCount = computed(() => Math.min(3, Math.max(1, Math.round(Number(props.card.stars) || 1))))

const cardAriaLabel = computed(() =>
  languageStore.t('preview.ariaCard', {
    title: displayTitle.value,
    zone: zoneLabel.value,
    stars: starCount.value,
  }),
)

const initial = computed(() => displayTitle.value.charAt(0).toUpperCase() || '?')

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
  <article class="card-list-item" :class="theme.className" :aria-label="cardAriaLabel">
    <div class="card-list-item__thumb">
      <img
        v-if="card.image"
        :src="card.image"
        :alt="languageStore.t('image.artworkAlt', { title: displayTitle })"
        loading="lazy"
      />
      <span v-else class="card-list-item__thumb-initial" aria-hidden="true">{{ initial }}</span>
    </div>

    <div class="card-list-item__body">
      <h3 class="card-list-item__title">{{ displayTitle }}</h3>
      <p v-if="displayCard.subtitle" class="card-list-item__subtitle">{{ displayCard.subtitle }}</p>

      <div class="card-list-item__meta">
        <span class="zone-pill">
          <span class="zone-pill__dot" aria-hidden="true"></span>
          {{ zoneLabel }}
        </span>
        <span class="stat-chip stat-chip--attack">
          {{ languageStore.t('field.attack') }} <strong>{{ card.attack }}</strong>
        </span>
        <span class="stat-chip stat-chip--defense">
          {{ languageStore.t('field.defense') }} <strong>{{ card.defense }}</strong>
        </span>
        <span
          v-if="missingTranslation"
          class="stat-chip stat-chip--fallback"
          :title="fallbackLabel"
        >
          EN
        </span>
      </div>

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
    </div>
  </article>
</template>
