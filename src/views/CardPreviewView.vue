<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CardPreview from '@/components/CardPreview.vue'
import EmptyState from '@/components/EmptyState.vue'
import { getZoneLabel } from '@/config/languages'
import { generateAndDownloadCardPdf } from '@/services/pdf/cardPdfService'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useCardStore()
const settings = useSettingsStore()
const languageStore = useLanguageStore()
const { t } = languageStore

const ready = ref(false)
const busyPdf = ref(false)
const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')

const card = computed(() => store.getCardById(props.id) ?? null)

const subtitle = computed(() => {
  const current = card.value
  if (!current) return ''
  return current.subtitle || getZoneLabel(current.zone, languageStore.language)
})

const pdfOptions = computed(() => ({
  cardWidthMm: settings.cardWidthMm,
  cardHeightMm: settings.cardHeightMm,
  fontId: settings.cardFontId,
  fontScale: settings.cardFontScale,
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

  ready.value = true
})

function goBack(): void {
  void router.push('/cards')
}

function editCard(): void {
  void router.push(`/cards/${props.id}/edit`)
}

async function handlePdf(): Promise<void> {
  const current = card.value
  if (!current || busyPdf.value) return

  clearStatus()
  busyPdf.value = true

  try {
    await generateAndDownloadCardPdf(current, {
      ...pdfOptions.value,
      language: languageStore.language,
    })
    setStatus('success', t('editor.statusPdfSuccess'))
  } catch (error) {
    console.error('Failed to generate a card PDF.', error)
    setStatus('error', t('cards.statusPdfFailed'))
  } finally {
    busyPdf.value = false
  }
}
</script>

<template>
  <div class="page">
    <div v-if="!ready" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ t('cards.loading') }}</span>
    </div>

    <EmptyState
      v-else-if="!card"
      :title="t('editor.notFoundTitle')"
      :message="t('editor.notFoundMessage')"
      :action-label="t('common.backToCards')"
      @action="goBack"
    />

    <template v-else>
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ card.title }}</h1>
          <p class="page-subtitle">{{ subtitle }}</p>
        </div>

        <div class="page-actions">
          <button type="button" class="btn btn--secondary" @click="goBack">
            {{ t('common.backToCards') }}
          </button>
          <button type="button" class="btn btn--secondary" @click="editCard">
            {{ t('common.edit') }}
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="busyPdf"
            @click="handlePdf"
          >
            {{ busyPdf ? t('common.working') : t('common.generatePdf') }}
          </button>
        </div>
      </header>

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

      <section class="panel">
        <div class="preview-stage">
          <div class="preview-stage__card">
            <CardPreview
              :card="card"
              :width-px="430"
            />
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
