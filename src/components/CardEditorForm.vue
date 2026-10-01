<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Card, CardDraft, CardTranslation, CardTranslations } from '@/models/Card'
import { Zone } from '@/models/Card'
import { getLanguageName, LANGUAGES } from '@/models/Language'
import { CARD_LIMITS, IMAGE_QUALITY } from '@/config/constants'
import { getZoneLabel, type MessageKey } from '@/config/languages'
import { zoneOptions } from '@/config/zones'
import type { CardValidationErrors } from '@/services/validation/cardValidation'
import { getTranslation } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'
import ImageUploader from '@/components/ImageUploader.vue'

const STAR_VALUES = [1, 2, 3] as const

const EMPTY_TRANSLATION: CardTranslation = { title: '', subtitle: '', action: '' }

const ZONE_DESCRIPTION_KEYS: Record<Zone, MessageKey> = {
  [Zone.ATTACK]: 'zone.attackDescription',
  [Zone.MIDFIELD]: 'zone.midfieldDescription',
  [Zone.DEFENSE]: 'zone.defenseDescription',
}

const props = withDefaults(
  defineProps<{
    modelValue: CardDraft
    errors: CardValidationErrors
    saving?: boolean
    imageQuality?: number
  }>(),
  {
    saving: false,
    imageQuality: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: CardDraft]
  save: []
  cancel: []
  preview: []
  pdf: []
}>()

const languageStore = useLanguageStore()

const isEnglish = computed(() => languageStore.language === 'EN')

/**
 * Local mirror of the draft. Components such as the image uploader send two
 * updates in a row (image data and its file name); merging them here instead
 * of spreading the still-stale prop keeps both values.
 */
const draft = ref<CardDraft>(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    draft.value = value
  },
)

/** Draft adapted to the card shape accepted by the localization helper. */
const translationSource = computed<Card>(() => ({
  ...draft.value,
  id: draft.value.id ?? '',
}))

const currentTranslation = computed<CardTranslation>(() => {
  if (isEnglish.value) return EMPTY_TRANSLATION
  return getTranslation(translationSource.value, languageStore.language) ?? EMPTY_TRANSLATION
})

const titleValue = computed(() =>
  isEnglish.value ? props.modelValue.title : currentTranslation.value.title,
)
const subtitleValue = computed(() =>
  isEnglish.value ? props.modelValue.subtitle : currentTranslation.value.subtitle,
)
const actionValue = computed(() =>
  isEnglish.value ? props.modelValue.action : currentTranslation.value.action,
)

const translationError = computed(() => props.errors.translations)

function updateField<K extends keyof CardDraft>(key: K, value: CardDraft[K]): void {
  draft.value = { ...draft.value, [key]: value }
  emit('update:modelValue', draft.value)
}

function updateTranslation(key: keyof CardTranslation, value: string): void {
  const language = languageStore.language

  if (language === 'EN') {
    updateField(key, value)
    return
  }

  const entry: CardTranslation = { ...currentTranslation.value }
  entry[key] = value

  const translations: CardTranslations = { ...draft.value.translations }
  translations[language] = entry

  updateField('translations', translations)
}

function handleTextInput(key: 'title' | 'subtitle' | 'action', event: Event): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  updateTranslation(key, target.value)
}

function handleNumberInput(key: 'attack' | 'defense', event: Event): void {
  const target = event.target as HTMLInputElement

  if (target.value === '') {
    updateField(key, 0)
    return
  }

  const parsed = Number(target.value)
  if (!Number.isNaN(parsed)) {
    updateField(key, parsed)
  }
}

function copyEnglish(): void {
  const language = languageStore.language
  if (language === 'EN') return

  const translations: CardTranslations = { ...draft.value.translations }
  translations[language] = {
    title: draft.value.title,
    subtitle: draft.value.subtitle,
    action: draft.value.action,
  }

  updateField('translations', translations)
}
</script>

<template>
  <form class="form" novalidate @submit.prevent="emit('save')">
    <div class="form-grid">
      <div class="form-field form-field--full">
        <div
          class="language-tabs"
          role="group"
          :aria-label="languageStore.t('language.label')"
        >
          <button
            v-for="option in LANGUAGES"
            :key="option.code"
            type="button"
            class="language-tab"
            :class="{ 'is-active': languageStore.language === option.code }"
            :aria-pressed="languageStore.language === option.code"
            @click="languageStore.setLanguage(option.code)"
          >
            {{ option.name }}
          </button>
        </div>
      </div>

      <div v-if="!isEnglish" class="form-field form-field--full translation-hint">
        <p class="form-field__hint">
          {{
            languageStore.t('editor.translationHint', {
              language: getLanguageName(languageStore.language),
            })
          }}
        </p>
        <p v-if="translationError" class="form-field__error" role="alert">
          {{ translationError }}
        </p>
        <button type="button" class="btn btn--ghost btn--sm" @click="copyEnglish">
          {{ languageStore.t('editor.copyEnglish') }}
        </button>
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.title) }"
      >
        <label class="form-field__label" for="card-title">
          {{ languageStore.t('field.title') }}
        </label>
        <input
          id="card-title"
          class="form-control"
          type="text"
          :value="titleValue"
          :placeholder="isEnglish ? undefined : modelValue.title"
          :maxlength="CARD_LIMITS.title.maxLength"
          :aria-invalid="Boolean(errors.title)"
          :aria-describedby="errors.title ? 'card-title-error' : undefined"
          @input="handleTextInput('title', $event)"
        />
        <p v-if="errors.title" id="card-title-error" class="form-field__error" role="alert">
          {{ errors.title }}
        </p>
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.subtitle) }"
      >
        <label class="form-field__label" for="card-subtitle">
          {{ languageStore.t('field.subtitle') }}
          <span class="form-field__optional">{{ languageStore.t('common.optional') }}</span>
        </label>
        <input
          id="card-subtitle"
          class="form-control"
          type="text"
          :value="subtitleValue"
          :placeholder="isEnglish ? undefined : modelValue.subtitle"
          :maxlength="CARD_LIMITS.subtitle.maxLength"
          :aria-invalid="Boolean(errors.subtitle)"
          :aria-describedby="errors.subtitle ? 'card-subtitle-error' : undefined"
          @input="handleTextInput('subtitle', $event)"
        />
        <p v-if="errors.subtitle" id="card-subtitle-error" class="form-field__error" role="alert">
          {{ errors.subtitle }}
        </p>
      </div>

      <div
        class="form-field"
        :class="{ 'form-field--invalid': Boolean(errors.attack) }"
      >
        <label class="form-field__label" for="card-attack">
          {{ languageStore.t('field.attack') }}
        </label>
        <input
          id="card-attack"
          class="form-control"
          type="number"
          inputmode="numeric"
          :min="CARD_LIMITS.attack.min"
          :max="CARD_LIMITS.attack.max"
          step="1"
          :value="modelValue.attack"
          :aria-invalid="Boolean(errors.attack)"
          :aria-describedby="errors.attack ? 'card-attack-error' : undefined"
          @input="handleNumberInput('attack', $event)"
        />
        <p v-if="errors.attack" id="card-attack-error" class="form-field__error" role="alert">
          {{ errors.attack }}
        </p>
      </div>

      <div
        class="form-field"
        :class="{ 'form-field--invalid': Boolean(errors.defense) }"
      >
        <label class="form-field__label" for="card-defense">
          {{ languageStore.t('field.defense') }}
        </label>
        <input
          id="card-defense"
          class="form-control"
          type="number"
          inputmode="numeric"
          :min="CARD_LIMITS.defense.min"
          :max="CARD_LIMITS.defense.max"
          step="1"
          :value="modelValue.defense"
          :aria-invalid="Boolean(errors.defense)"
          :aria-describedby="errors.defense ? 'card-defense-error' : undefined"
          @input="handleNumberInput('defense', $event)"
        />
        <p v-if="errors.defense" id="card-defense-error" class="form-field__error" role="alert">
          {{ errors.defense }}
        </p>
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.action) }"
      >
        <label class="form-field__label" for="card-action">
          {{ languageStore.t('field.action') }}
        </label>
        <textarea
          id="card-action"
          class="form-control"
          :maxlength="CARD_LIMITS.action.maxLength"
          :value="actionValue"
          :placeholder="isEnglish ? undefined : modelValue.action"
          :aria-invalid="Boolean(errors.action)"
          :aria-describedby="errors.action ? 'card-action-error' : undefined"
          @input="handleTextInput('action', $event)"
        />
        <p v-if="errors.action" id="card-action-error" class="form-field__error" role="alert">
          {{ errors.action }}
        </p>
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.image) }"
      >
        <ImageUploader
          :model-value="modelValue.image"
          :image-ref="modelValue.imageRef ?? null"
          :error="errors.image"
          :quality="imageQuality ?? IMAGE_QUALITY.default"
          @update:model-value="updateField('image', $event)"
          @update:image-ref="updateField('imageRef', $event)"
        />
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.zone) }"
      >
        <fieldset
          class="zone-selector"
          :aria-invalid="Boolean(errors.zone)"
          :aria-describedby="errors.zone ? 'card-zone-error' : undefined"
        >
          <legend>{{ languageStore.t('field.zone') }}</legend>

          <label
            v-for="zoneOption in zoneOptions"
            :key="zoneOption.zone"
            class="zone-option"
            :class="[zoneOption.className, { 'is-selected': modelValue.zone === zoneOption.zone }]"
          >
            <input
              type="radio"
              name="card-zone"
              :value="zoneOption.zone"
              :checked="modelValue.zone === zoneOption.zone"
              @change="updateField('zone', zoneOption.zone)"
            />
            <span class="zone-option__name">
              <span class="zone-option__swatch" aria-hidden="true" />
              {{ getZoneLabel(zoneOption.zone, languageStore.language) }}
            </span>
            <span class="zone-option__description">
              {{ languageStore.t(ZONE_DESCRIPTION_KEYS[zoneOption.zone]) }}
            </span>
          </label>
        </fieldset>

        <p v-if="errors.zone" id="card-zone-error" class="form-field__error" role="alert">
          {{ errors.zone }}
        </p>
      </div>

      <div
        class="form-field form-field--full"
        :class="{ 'form-field--invalid': Boolean(errors.stars) }"
      >
        <fieldset
          class="stars-selector"
          :aria-invalid="Boolean(errors.stars)"
          :aria-describedby="errors.stars ? 'card-stars-error' : undefined"
        >
          <legend>{{ languageStore.t('field.stars') }}</legend>

          <label
            v-for="value in STAR_VALUES"
            :key="value"
            class="star-option"
            :class="{ 'is-selected': modelValue.stars === value }"
          >
            <input
              type="radio"
              name="card-stars"
              :value="value"
              :checked="modelValue.stars === value"
              @change="updateField('stars', value)"
            />
            <span class="star-option__icons" aria-hidden="true">
              <span
                v-for="position in 3"
                :key="position"
                class="star-option__star"
                :class="{ 'is-filled': position <= value }"
              >
                ★
              </span>
            </span>
            <span class="star-option__label">
              {{
                value === 1
                  ? languageStore.t('field.starOne', { count: value })
                  : languageStore.t('field.starMany', { count: value })
              }}
            </span>
          </label>
        </fieldset>

        <p v-if="errors.stars" id="card-stars-error" class="form-field__error" role="alert">
          {{ errors.stars }}
        </p>
      </div>

      <div class="cluster form-field--full">
        <button class="btn btn--primary" type="submit" :disabled="saving">
          {{ saving ? languageStore.t('common.saving') : languageStore.t('common.save') }}
        </button>
        <button class="btn btn--secondary" type="button" @click="emit('preview')">
          {{ languageStore.t('common.preview') }}
        </button>
        <button class="btn btn--secondary" type="button" @click="emit('pdf')">
          {{ languageStore.t('common.generatePdf') }}
        </button>
        <button class="btn btn--ghost" type="button" @click="emit('cancel')">
          {{ languageStore.t('common.cancel') }}
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.language-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.language-tab {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.language-tab:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.language-tab.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-text);
}

.translation-hint {
  align-items: flex-start;
}
</style>
