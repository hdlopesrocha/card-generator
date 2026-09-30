<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CardListItem from '@/components/CardListItem.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import type { Card } from '@/models/Card'
import { parseCardsCsvFile } from '@/services/csv/csvService'
import { generateAndDownloadCardPdf, generateAndDownloadCardsPdf } from '@/services/pdf/cardPdfService'
import { useCardStore } from '@/stores/cardStore'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const router = useRouter()
const store = useCardStore()
const settings = useSettingsStore()
const languageStore = useLanguageStore()
const imageLibrary = useImageLibraryStore()
const { t } = languageStore

const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')
const busyPdfId = ref<string | null>(null)
const deleteTarget = ref<Card | null>(null)
const deleting = ref(false)
const exportOpen = ref(false)
const importingCsv = ref(false)
const csvInput = ref<HTMLInputElement | null>(null)
const clearAllOpen = ref(false)
const clearingAll = ref(false)

const pdfOptions = computed(() => ({
  cardWidthMm: settings.cardWidthMm,
  cardHeightMm: settings.cardHeightMm,
}))

const cardCountText = computed(() =>
  t(store.cardCount === 1 ? 'cards.subtitleOne' : 'cards.subtitleMany', {
    count: store.cardCount,
  }),
)

const clearAllMessage = computed(() => t('cards.deleteAllMessage', { count: store.cardCount }))

const deleteMessage = computed(() =>
  deleteTarget.value ? t('cards.deleteOneMessage', { title: deleteTarget.value.title }) : undefined,
)

function setStatus(kind: 'success' | 'error', message: string): void {
  statusKind.value = kind
  statusMessage.value = message
}

function clearStatus(): void {
  statusMessage.value = ''
}

onMounted(() => {
  void store.loadCards()
  void imageLibrary.loadImages()
})

function goToNewCard(): void {
  void router.push('/cards/new')
}

function handleEdit(card: Card): void {
  void router.push(`/cards/${card.id}/edit`)
}

function handlePreview(card: Card): void {
  void router.push(`/cards/${card.id}/preview`)
}

async function handlePdf(card: Card): Promise<void> {
  if (busyPdfId.value !== null) return

  clearStatus()
  busyPdfId.value = card.id

  try {
    await generateAndDownloadCardPdf(card, {
      ...pdfOptions.value,
      language: languageStore.language,
    })
    setStatus('success', t('cards.statusPdfGenerated', { title: card.title }))
  } catch (error) {
    console.error('Failed to generate a card PDF.', error)
    setStatus('error', t('cards.statusPdfFailed'))
  } finally {
    busyPdfId.value = null
  }
}

function requestDelete(card: Card): void {
  clearStatus()
  deleteTarget.value = card
}

function cancelDelete(): void {
  deleteTarget.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return

  clearStatus()
  deleting.value = true
  const deleted = await store.deleteCard(target.id)
  deleting.value = false
  deleteTarget.value = null

  if (deleted) {
    setStatus('success', t('cards.statusDeleted', { title: target.title }))
  } else {
    setStatus('error', store.error ?? t('cards.statusDeleteFailed'))
  }
}

function openExport(): void {
  clearStatus()
  exportOpen.value = true
}

function closeExport(): void {
  exportOpen.value = false
}

function openClearAll(): void {
  clearStatus()
  clearAllOpen.value = true
}

function cancelClearAll(): void {
  clearAllOpen.value = false
}

async function confirmClearAll(): Promise<void> {
  clearStatus()
  clearingAll.value = true
  const cleared = await store.clearAllCards()
  clearingAll.value = false
  clearAllOpen.value = false

  if (cleared) {
    setStatus('success', t('cards.statusAllDeleted'))
  } else {
    setStatus('error', store.error ?? t('cards.statusDeleteAllFailed'))
  }
}

async function printCards(cards: Card[]): Promise<void> {
  clearStatus()

  try {
    await generateAndDownloadCardsPdf(cards, {
      ...pdfOptions.value,
      language: languageStore.language,
    })
    exportOpen.value = false
    setStatus('success', t('cards.statusPdfMany', { count: cards.length }))
  } catch (error) {
    console.error('Failed to generate the cards PDF.', error)
    exportOpen.value = false
    setStatus('error', t('cards.statusPdfFailed'))
  }
}

function handleExport(payload: { cards: Card[] }): void {
  void printCards(payload.cards)
}

function openCsvPicker(): void {
  csvInput.value?.click()
}

async function handleCsvImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  clearStatus()
  importingCsv.value = true

  try {
    const result = await parseCardsCsvFile(file, languageStore.language, {
      images: imageLibrary.imagesByName,
    })

    if (!result.ok) {
      const details = result.rowErrors?.slice(0, 3).join(' ') ?? ''
      setStatus('error', details ? `${result.error} ${details}` : result.error)
      return
    }

    const count = await store.importCards(result.cards)

    if (store.error !== null || count === 0) {
      setStatus('error', store.error ?? t('cards.statusCsvSaveFailed'))
      return
    }

    try {
      await generateAndDownloadCardsPdf(result.cards, {
        ...pdfOptions.value,
        language: languageStore.language,
      })
      setStatus('success', t('cards.statusCsvImported', { count }))
    } catch (error) {
      console.error('Failed to generate the CSV cards PDF.', error)
      setStatus('error', t('cards.statusCsvPartial', { count }))
    }
  } catch (error) {
    console.error('Failed to import the CSV file.', error)
    setStatus('error', t('cards.statusCsvImportFailed'))
  } finally {
    importingCsv.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ t('cards.title') }}</h1>
        <p class="page-subtitle">{{ cardCountText }}</p>
      </div>

      <div class="page-actions">
        <RouterLink class="btn btn--primary" to="/cards/new">
          {{ t('cards.createNew') }}
        </RouterLink>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="importingCsv"
          @click="openCsvPicker"
        >
          {{ importingCsv ? t('cards.importingCsv') : t('cards.importCsv') }}
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="store.cardCount === 0"
          @click="openExport"
        >
          {{ t('cards.exportAll') }}
        </button>
        <RouterLink class="btn btn--secondary" to="/settings">
          {{ t('cards.backupImport') }}
        </RouterLink>
        <button
          type="button"
          class="btn btn--danger"
          :disabled="store.cardCount === 0"
          @click="openClearAll"
        >
          {{ t('cards.deleteAll') }}
        </button>

        <input
          ref="csvInput"
          class="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          :aria-label="t('cards.chooseCsv')"
          @change="handleCsvImport"
        />
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

    <div v-if="store.loading" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ t('cards.loading') }}</span>
    </div>

    <div v-else-if="store.error" class="status-message status-message--error" aria-live="polite">
      <span>{{ store.error }}</span>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        style="margin-left: auto"
        :aria-label="t('common.dismiss')"
        @click="store.clearError"
      >
        ×
      </button>
    </div>

    <EmptyState
      v-else-if="store.cardCount === 0"
      :title="t('cards.emptyTitle')"
      :message="t('cards.emptyMessage')"
      :action-label="t('cards.emptyAction')"
      @action="goToNewCard"
    />

    <div v-else class="card-grid">
      <CardListItem
        v-for="card in store.sortedCards"
        :key="card.id"
        :card="card"
        @edit="handleEdit"
        @preview="handlePreview"
        @pdf="handlePdf"
        @delete="requestDelete"
      />
    </div>

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="t('cards.deleteOneTitle')"
      :message="deleteMessage"
      :confirm-label="t('common.delete')"
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <ConfirmDialog
      :open="clearAllOpen"
      :title="t('cards.deleteAllTitle')"
      :message="clearAllMessage"
      :confirm-label="t('cards.deleteAllConfirm')"
      :busy="clearingAll"
      @confirm="confirmClearAll"
      @cancel="cancelClearAll"
    />

    <ExportDialog
      :open="exportOpen"
      :cards="store.cards"
      @close="closeExport"
      @export="handleExport"
    />
  </div>
</template>
