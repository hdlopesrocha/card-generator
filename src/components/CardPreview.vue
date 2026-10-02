<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { Card } from '@/models/Card'
import { getCardTextLabels, getZoneLabel } from '@/config/languages'
import { getZoneTheme } from '@/config/zones'
import { getLocalizedCard } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'
import CardImage from '@/components/CardImage.vue'
import CardStats from '@/components/CardStats.vue'
import CardZoneBadge from '@/components/CardZoneBadge.vue'

const props = withDefaults(
  defineProps<{
    card: Card
    widthPx?: number
    compact?: boolean
  }>(),
  {
    widthPx: 380,
    compact: false,
  },
)

const languageStore = useLanguageStore()
const settings = useSettingsStore()

const displayCard = computed(() => getLocalizedCard(props.card, languageStore.language))

const labels = computed(() => getCardTextLabels(languageStore.language))

const zoneLabel = computed(() => getZoneLabel(props.card.zone, languageStore.language))

const theme = computed(() => getZoneTheme(props.card.zone))

const displayTitle = computed(() => displayCard.value.title.trim() || labels.value.untitled)

const starCount = computed(() => Math.min(3, Math.max(1, Math.round(Number(props.card.stars) || 1))))

const starSlots = computed(() => [1, 2, 3].map((position) => position <= starCount.value))

const rootStyle = computed(
  () =>
    ({
      width: `min(${props.widthPx}px, 100%)`,
      // Always match the physical dimensions configured for the PDF.
      '--card-aspect': settings.cardAspectRatio,
      '--card-font-scale': settings.cardFontScale,
    }) as CSSProperties,
)
</script>

<template>
  <article
    class="card"
    :class="[theme.className, { 'card--thumb': compact }]"
    :style="rootStyle"
    :aria-label="
      languageStore.t('preview.ariaCard', {
        title: displayTitle,
        zone: zoneLabel,
        stars: starCount,
      })
    "
  >
    <div class="card__frame">
      <div class="card__texture" aria-hidden="true" />

      <header class="card__header">
        <div class="card__heading">
          <h3 class="card__title">{{ displayCard.title || labels.untitled }}</h3>
          <p v-if="displayCard.subtitle" class="card__subtitle">{{ displayCard.subtitle }}</p>
        </div>

        <CardZoneBadge :zone="card.zone" :label="zoneLabel" />
      </header>

      <div class="card__artwork">
        <CardImage
          :src="card.image"
          :alt="languageStore.t('image.artworkAlt', { title: displayTitle })"
          :initial="displayCard.title"
          :placeholder-label="labels.noArtwork"
        />
        <div class="card__artwork-glow" aria-hidden="true" />
      </div>

      <CardStats
        :attack="displayCard.attack"
        :defense="displayCard.defense"
        :attack-label="labels.attack"
        :defense-label="labels.defense"
      />

      <div class="card__action">
        <p class="card__action-label">{{ labels.action }}</p>
        <p class="card__action-text">{{ displayCard.action }}</p>
      </div>

      <div class="card__stars" aria-hidden="true">
        <span
          v-for="(filled, index) in starSlots"
          :key="index"
          class="card__star"
          :class="{ 'card__star--filled': filled }"
        >
          ★
        </span>
      </div>
    </div>
  </article>
</template>
