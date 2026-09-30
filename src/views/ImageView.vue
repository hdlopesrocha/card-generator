<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import { getBundledImageNames, resolveBundledImage } from '@/services/image/bundledImages'
import type { StoredImage } from '@/services/storage/indexedDb'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'
import { useLanguageStore } from '@/stores/languageStore'

interface BundledImageEntry {
  name: string
  dataUrl: string | null
}

const languageStore = useLanguageStore()
const { t } = languageStore
const store = useImageLibraryStore()

const fileInput = ref<HTMLInputElement | null>(null)
const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')
const deleteTarget = ref<StoredImage | null>(null)
const deleting = ref(false)

const bundledImages = ref<BundledImageEntry[]>(
  getBundledImageNames().map((name) => ({ name, dataUrl: null })),
)

const uploadedImages = computed(() => store.images)

const deleteMessage = computed(() =>
  deleteTarget.value ? t('images.deleteMessage', { name: deleteTarget.value.name }) : undefined,
)

function setStatus(kind: 'success' | 'error', message: string): void {
  statusKind.value = kind
  statusMessage.value = message
}

function clearStatus(): void {
  statusMessage.value = ''
}

onMounted(async () => {
  void store.loadImages()

  for (const entry of bundledImages.value) {
    entry.dataUrl = await resolveBundledImage(entry.name)
  }
})

function openPicker(): void {
  fileInput.value?.click()
}

async function handleFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return

  clearStatus()
  const { added, failed } = await store.addImages(files)
  input.value = ''

  if (added.length > 0) {
    setStatus('success', t('images.statusUploaded', { count: added.length }))
  } else if (failed > 0) {
    setStatus('error', store.error ?? t('images.uploadFailed'))
  }
}

async function copyName(name: string): Promise<void> {
  clearStatus()

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(name)
    } else {
      const helper = document.createElement('textarea')
      helper.value = name
      helper.setAttribute('readonly', 'true')
      helper.style.position = 'fixed'
      helper.style.opacity = '0'
      document.body.appendChild(helper)
      helper.select()
      document.execCommand('copy')
      helper.remove()
    }
    setStatus('success', t('images.copied', { name }))
  } catch (caught) {
    console.error('Failed to copy the image name.', caught)
    setStatus('error', t('images.copyFailed'))
  }
}

function requestDelete(image: StoredImage): void {
  clearStatus()
  deleteTarget.value = image
}

function cancelDelete(): void {
  deleteTarget.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return

  deleting.value = true
  const deleted = await store.deleteImage(target.id)
  deleting.value = false
  deleteTarget.value = null

  if (deleted) {
    setStatus('success', t('images.statusDeleted', { name: target.name }))
  } else {
    setStatus('error', store.error ?? t('store.imageDeleteFailed'))
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ t('images.title') }}</h1>
        <p class="page-subtitle">{{ t('images.subtitle') }}</p>
      </div>

      <div class="page-actions">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="store.uploading"
          @click="openPicker"
        >
          {{ store.uploading ? t('images.uploading') : t('images.upload') }}
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          :aria-label="t('images.chooseFiles')"
          @change="handleFiles"
        />
      </div>
    </header>

    <p class="muted">{{ t('images.hint') }}</p>

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
      <span class="spinner" aria-hidden="true" />
      <span>{{ t('common.loading') }}</span>
    </div>

    <template v-else>
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('images.sampleSection') }}</h2>
          <span class="muted">{{ bundledImages.length }}</span>
        </header>
        <div class="panel__body">
          <div class="image-grid">
            <article v-for="entry in bundledImages" :key="entry.name" class="image-card">
              <div class="image-card__thumb">
                <img
                  v-if="entry.dataUrl"
                  :src="entry.dataUrl"
                  :alt="entry.name"
                  loading="lazy"
                />
                <span v-else class="spinner" aria-hidden="true" />
              </div>
              <div class="image-card__body">
                <p class="image-card__name" :title="entry.name">{{ entry.name }}</p>
                <span class="image-badge image-badge--sample">{{ t('images.badgeSample') }}</span>
              </div>
              <div class="image-card__actions">
                <button
                  type="button"
                  class="btn btn--sm btn--secondary"
                  :aria-label="t('images.copyName') + ': ' + entry.name"
                  @click="copyName(entry.name)"
                >
                  {{ t('images.copyName') }}
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">{{ t('images.localSection') }}</h2>
          <span class="muted">{{ store.imageCount }}</span>
        </header>
        <div class="panel__body">
          <EmptyState
            v-if="uploadedImages.length === 0"
            :title="t('images.empty')"
            :message="t('images.emptyHint')"
            icon="▣"
          />

          <div v-else class="image-grid">
            <article v-for="image in uploadedImages" :key="image.id" class="image-card">
              <div class="image-card__thumb">
                <img :src="image.dataUrl" :alt="image.name" loading="lazy" />
              </div>
              <div class="image-card__body">
                <p class="image-card__name" :title="image.name">{{ image.name }}</p>
                <span class="image-badge image-badge--uploaded">
                  {{ t('images.badgeUploaded') }}
                </span>
                <span class="muted image-card__size">{{ formatSize(image.size) }}</span>
              </div>
              <div class="image-card__actions">
                <button
                  type="button"
                  class="btn btn--sm btn--secondary"
                  :aria-label="t('images.copyName') + ': ' + image.name"
                  @click="copyName(image.name)"
                >
                  {{ t('images.copyName') }}
                </button>
                <button
                  type="button"
                  class="btn btn--sm btn--danger"
                  :aria-label="t('common.delete') + ': ' + image.name"
                  @click="requestDelete(image)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </template>

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="t('images.deleteTitle')"
      :message="deleteMessage"
      :confirm-label="t('common.delete')"
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>
