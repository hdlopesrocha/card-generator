<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CardEditorForm from '@/components/CardEditorForm.vue'
import CardPreview from '@/components/CardPreview.vue'
import EmptyState from '@/components/EmptyState.vue'
import { cardFromDraft, createEmptyCardDraft, draftFromCard } from '@/models/Card'
import type { Card, CardDraft } from '@/models/Card'
import { generateAndDownloadCardPdf } from '@/services/pdf/cardPdfService'
import { validateCard } from '@/services/validation/cardValidation'
import type { CardValidationErrors } from '@/services/validation/cardValidation'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const store = useCardStore()
const settings = useSettingsStore()
const languageStore = useLanguageStore()
const { t } = languageStore

const draft = ref<CardDraft>(createEmptyCardDraft())
const errors = ref<CardValidationErrors>({})
const saving = ref(false)
const ready = ref(false)
const cardMissing = ref(false)
const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')

const isEditing = computed(() => Boolean(props.id))

const previewCard = computed<Card>(() => ({
  ...draft.value,
  id: draft.value.id ?? 'draft-preview',
  attack: Number(draft.value.attack),
  defense: Number(draft.value.defense),
}))

const pdfOptions = computed(() => ({
  cardWidthMm: settings.cardWidthMm,
  cardHeightMm: settings.cardHeightMm,
}))

function setStatus(kind: 'success' | 'error', message: string): void {
  statusKind.value = kind
  statusMessage.value = message
}

function clearStatus(): void {
  statusMessage.value = ''
}

onMounted(async () => {
  if (!store.initialized) {
    await store.loadCards()
  }

  if (props.id) {
    const card = store.getCardById(props.id)
    if (card) {
      draft.value = draftFromCard(card)
    } else {
      cardMissing.value = true
    }
  }

  ready.value = true
})

function handleDraftChange(value: CardDraft): void {
  draft.value = value
  errors.value = {}
}

function handleCancel(): void {
  void router.push('/cards')
}

async function handleSave(): Promise<void> {
  const validation = validateCard(draft.value, languageStore.language)
  errors.value = validation

  if (Object.keys(validation).length > 0) {
    setStatus('error', t('editor.statusFixFields'))
    return
  }

  clearStatus()
  saving.value = true
  const saved = await store.saveCard(draft.value)
  saving.value = false

  if (saved) {
    void router.push('/cards')
  } else {
    setStatus('error', store.error ?? t('editor.statusSaveFailed'))
  }
}

async function handlePreview(): Promise<void> {
  const validation = validateCard(draft.value, languageStore.language)
  errors.value = validation

  if (Object.keys(validation).length > 0) {
    setStatus('error', t('editor.statusFixFields'))
    return
  }

  clearStatus()

  if (draft.value.id) {
    void router.push(`/cards/${draft.value.id}/preview`)
    return
  }

  saving.value = true
  const saved = await store.saveCard(draft.value)
  saving.value = false

  if (saved) {
    void router.push(`/cards/${saved.id}/preview`)
  } else {
    setStatus('error', store.error ?? t('editor.statusSaveFailed'))
  }
}

async function handlePdf(): Promise<void> {
  const validation = validateCard(draft.value, languageStore.language)
  errors.value = validation

  if (Object.keys(validation).length > 0) {
    setStatus('error', t('editor.statusFixFields'))
    return
  }

  clearStatus()

  try {
    await generateAndDownloadCardPdf(cardFromDraft(draft.value, languageStore.language), {
      ...pdfOptions.value,
      language: languageStore.language,
    })
    setStatus('success', t('editor.statusPdfSuccess'))
  } catch (error) {
    console.error('Failed to generate a card PDF.', error)
    setStatus('error', t('cards.statusPdfFailed'))
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ isEditing ? t('editor.editTitle') : t('editor.newTitle') }}</h1>
        <p class="page-subtitle">
          {{ t('editor.subtitle') }}
        </p>
      </div>
    </header>

    <div v-if="!ready || store.loading" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ t('editor.loading') }}</span>
    </div>

    <EmptyState
      v-else-if="cardMissing"
      :title="t('editor.notFoundTitle')"
      :message="t('editor.notFoundMessage')"
      :action-label="t('common.backToCards')"
      @action="handleCancel"
    />

    <template v-else>
      <div
        v-if="statusMessage"
        class="status-message"
        :class="statusKind === 'success' ? 'status-message--success' : 'status-message--error'"
        aria-live="polite"
      >
        <span>{{ statusMessage }}</span>
        <button
          type="button"
          class="btn btn--sm btn--ghost"
          style="margin-left: auto"
          :aria-label="t('common.dismiss')"
          @click="clearStatus"
        >
          ×
        </button>
      </div>

      <div class="editor-layout">
        <section
          class="panel"
          :aria-label="isEditing ? t('editor.editTitle') : t('editor.newTitle')"
        >
          <div class="panel__body">
            <CardEditorForm
              :model-value="draft"
              :errors="errors"
              :saving="saving"
              :image-quality="settings.imageQuality"
              @update:model-value="handleDraftChange"
              @save="handleSave"
              @cancel="handleCancel"
              @preview="handlePreview"
              @pdf="handlePdf"
            />
          </div>
        </section>

        <aside class="editor-preview">
          <div class="editor-preview__header">
            <h2 class="editor-preview__title">{{ t('editor.livePreview') }}</h2>
          </div>
          <div class="editor-preview__card">
            <CardPreview
              :card="previewCard"
              :width-px="380"
            />
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
