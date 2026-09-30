<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { IMAGE_QUALITY, PDF_CONSTANTS } from '@/config/constants'
import { getLanguageName } from '@/config/languages'
import { downloadBackup, parseBackupFile } from '@/services/backup/backupService'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const store = useCardStore()
const settings = useSettingsStore()
const languageStore = useLanguageStore()
const { t } = languageStore

const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')
const importing = ref(false)
const restoring = ref(false)
const clearing = ref(false)
const confirmClearOpen = ref(false)

const busy = computed(() => importing.value || restoring.value || clearing.value)

const qualityPercent = computed(() => `${Math.round(settings.imageQuality * 100)}%`)

const pdfInfo = computed(() =>
  t('settings.pdfInfo', {
    width: settings.cardWidthMm,
    height: settings.cardHeightMm,
    language: getLanguageName(languageStore.language),
  }),
)

const clearAllMessage = computed(() => t('cards.deleteAllMessage', { count: store.cardCount }))

function setStatus(kind: 'success' | 'error', message: string): void {
  statusKind.value = kind
  statusMessage.value = message
}

function clearStatus(): void {
  statusMessage.value = ''
}

onMounted(() => {
  void store.loadCards()
})

function handleWidthChange(event: Event): void {
  const target = event.target as HTMLInputElement

  if (target.value.trim() === '') {
    target.value = String(settings.cardWidthMm)
    return
  }

  const value = Number(target.value)
  if (Number.isFinite(value)) {
    settings.setCardDimensions(value, settings.cardHeightMm)
  }
}

function handleHeightChange(event: Event): void {
  const target = event.target as HTMLInputElement

  if (target.value.trim() === '') {
    target.value = String(settings.cardHeightMm)
    return
  }

  const value = Number(target.value)
  if (Number.isFinite(value)) {
    settings.setCardDimensions(settings.cardWidthMm, value)
  }
}

function handleQualityInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)

  if (Number.isFinite(value)) {
    settings.setImageQuality(value)
  }
}

function handleReset(): void {
  settings.resetToDefaults()
  setStatus('success', t('settings.statusReset'))
}

function handleExportBackup(): void {
  clearStatus()

  try {
    downloadBackup(store.cards)
    setStatus('success', t('settings.statusBackupExported', { count: store.cardCount }))
  } catch (error) {
    console.error('Failed to export the backup.', error)
    setStatus('error', t('settings.statusBackupFailed'))
  }
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  clearStatus()
  importing.value = true

  try {
    const result = await parseBackupFile(file, languageStore.language)

    if (!result.ok) {
      setStatus('error', result.error)
      return
    }

    const count = await store.importCards(result.cards)

    if (store.error !== null) {
      setStatus('error', store.error)
      return
    }

    setStatus('success', t('settings.statusImported', { count }))
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function handleRestoreDemo(): Promise<void> {
  clearStatus()
  restoring.value = true

  const count = await store.restoreDemoCards()
  restoring.value = false

  if (store.error !== null) {
    setStatus('error', store.error)
    return
  }

  setStatus('success', t('settings.statusRestored', { count }))
}

function openClearConfirm(): void {
  clearStatus()
  confirmClearOpen.value = true
}

function closeClearConfirm(): void {
  confirmClearOpen.value = false
}

async function handleClearAll(): Promise<void> {
  clearStatus()
  clearing.value = true

  const cleared = await store.clearAllCards()
  clearing.value = false
  confirmClearOpen.value = false

  if (cleared) {
    setStatus('success', t('cards.statusAllDeleted'))
  } else {
    setStatus('error', store.error ?? t('cards.statusDeleteAllFailed'))
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ t('settings.title') }}</h1>
        <p class="page-subtitle">
          {{ t('settings.subtitle') }}
        </p>
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

    <div class="settings-grid">
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('settings.pdfPanel') }}</h2>
        </header>
        <div class="panel__body">
          <div class="form">
            <div class="form-grid">
              <div class="form-field">
                <label class="form-field__label" for="settings-card-width">
                  {{ t('settings.cardWidth') }}
                </label>
                <input
                  id="settings-card-width"
                  class="form-control"
                  type="number"
                  :min="PDF_CONSTANTS.minCardWidthMm"
                  :max="PDF_CONSTANTS.maxCardWidthMm"
                  step="0.5"
                  :value="settings.cardWidthMm"
                  @change="handleWidthChange"
                />
              </div>

              <div class="form-field">
                <label class="form-field__label" for="settings-card-height">
                  {{ t('settings.cardHeight') }}
                </label>
                <input
                  id="settings-card-height"
                  class="form-control"
                  type="number"
                  :min="PDF_CONSTANTS.minCardHeightMm"
                  :max="PDF_CONSTANTS.maxCardHeightMm"
                  step="0.5"
                  :value="settings.cardHeightMm"
                  @change="handleHeightChange"
                />
              </div>
            </div>

            <div class="form-field">
              <label class="form-field__label" for="settings-image-quality">
                {{ t('settings.imageQuality') }}
                <span class="form-field__optional">{{ qualityPercent }}</span>
              </label>
              <input
                id="settings-image-quality"
                class="form-control"
                type="range"
                :min="IMAGE_QUALITY.min"
                :max="IMAGE_QUALITY.max"
                :step="IMAGE_QUALITY.step"
                :value="settings.imageQuality"
                style="accent-color: var(--color-primary)"
                @input="handleQualityInput"
              />
            </div>

            <p class="muted">{{ pdfInfo }}</p>

            <div class="settings-actions">
              <button type="button" class="btn btn--secondary" @click="handleReset">
                {{ t('common.reset') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('settings.backupPanel') }}</h2>
        </header>
        <div class="panel__body">
          <div class="stack">
            <p class="muted">{{ t('settings.backupText') }}</p>
            <div class="settings-actions">
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="busy || store.cardCount === 0"
                @click="handleExportBackup"
              >
                {{ t('settings.exportBackup') }}
              </button>
              <label class="btn btn--secondary file-button">
                {{ t('settings.importBackup') }}
                <input
                  type="file"
                  accept=".json,application/json"
                  :disabled="busy"
                  @change="handleImportFile"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('settings.demoPanel') }}</h2>
        </header>
        <div class="panel__body">
          <div class="stack">
            <p class="muted">{{ t('settings.demoPanel') }}</p>
            <div class="settings-actions">
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="busy"
                @click="handleRestoreDemo"
              >
                {{ restoring ? t('common.working') : t('settings.restoreDemo') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('settings.dangerPanel') }}</h2>
        </header>
        <div class="panel__body">
          <div class="stack">
            <p class="muted">{{ t('settings.dangerText') }}</p>
            <div class="settings-actions">
              <button
                type="button"
                class="btn btn--danger"
                :disabled="busy || store.cardCount === 0"
                @click="openClearConfirm"
              >
                {{ t('cards.deleteAll') }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <ConfirmDialog
      :open="confirmClearOpen"
      :title="t('cards.deleteAllTitle')"
      :message="clearAllMessage"
      :confirm-label="t('cards.deleteAllConfirm')"
      :busy="clearing"
      @confirm="handleClearAll"
      @cancel="closeClearConfirm"
    />
  </div>
</template>
