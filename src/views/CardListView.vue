<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CardListItem from '@/components/CardListItem.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import { CARD_FONT_SCALE } from '@/config/constants'
import { BUNDLED_CARD_FONTS, SYSTEM_CARD_FONTS } from '@/config/fonts'
import type { Card } from '@/models/Card'
import { parseCardsCsvFile, downloadCardsCsv } from '@/services/csv/csvService'
import { resolveAllBundledImages } from '@/services/image/bundledImages'
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
  fontId: settings.cardFontId,
  fontScale: settings.cardFontScale,
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

async function handleExportCsv(): Promise<void> {
  clearStatus()

  try {
    const bundled = await resolveAllBundledImages()
    const images = new Map(bundled)

    for (const [name, dataUrl] of imageLibrary.imagesByName) {
      images.set(name, dataUrl)
    }

    downloadCardsCsv(store.cards, { images })
    setStatus('success', t('cards.statusCsvExported', { count: store.cardCount }))
  } catch (error) {
    console.error('Failed to export the cards CSV.', error)
    setStatus('error', t('cards.statusCsvExportFailed'))
  }
}

function openCsvPicker(): void {
  csvInput.value?.click()
}

function handleFontChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  settings.setCardFont(target.value)
}

const cardFontSizePercent = computed(() => Math.round(settings.cardFontScale * 100))

function handleFontSizeChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const percent = Number(input.value)

  if (Number.isFinite(percent)) {
    settings.setCardFontScale(percent / 100)
  }

  input.value = String(Math.round(settings.cardFontScale * 100))
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

    setStatus('success', t('cards.statusCsvImported', { count }))
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
        <label class="card-font-picker">
          <span class="visually-hidden">{{ t('settings.cardFont') }}</span>
          <select
            id="cards-card-font"
            class="form-control card-font-picker__select"
            :value="settings.cardFontId"
            :aria-label="t('settings.cardFont')"
            :title="t('settings.cardFontSystemHint')"
            @change="handleFontChange"
          >
            <optgroup :label="t('settings.cardFontBundled')">
              <option v-for="font in BUNDLED_CARD_FONTS" :key="font.id" :value="font.id">
                {{ font.label }}
              </option>
            </optgroup>
            <optgroup :label="t('settings.cardFontSystem')">
              <option v-for="font in SYSTEM_CARD_FONTS" :key="font.id" :value="font.id">
                {{ font.label }}
              </option>
            </optgroup>
          </select>
        </label>

        <label class="card-font-size">
          <span class="visually-hidden">{{ t('cards.fontSize') }}</span>
          <input
            id="cards-font-size"
            class="form-control card-font-size__input"
            type="number"
            inputmode="numeric"
            :min="CARD_FONT_SCALE.min * 100"
            :max="CARD_FONT_SCALE.max * 100"
            :step="CARD_FONT_SCALE.step * 100"
            :value="cardFontSizePercent"
            :aria-label="t('cards.fontSize')"
            :title="t('cards.fontSize')"
            @change="handleFontSizeChange"
          />
          <span class="card-font-size__suffix" aria-hidden="true">%</span>
        </label>

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
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="store.cardCount === 0"
          @click="handleExportCsv"
        >
          {{ t('cards.exportCsv') }}
        </button>
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
