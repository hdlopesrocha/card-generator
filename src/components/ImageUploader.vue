<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { IMAGE_QUALITY } from '@/config/constants'
import { fileToOptimizedDataUrl, validateImageFile } from '@/services/image/imageService'
import { getBundledImageNames, resolveBundledImage } from '@/services/image/bundledImages'
import type { StoredImage } from '@/services/storage/indexedDb'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'
import { useLanguageStore } from '@/stores/languageStore'

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    imageRef?: string | null
    error?: string
    quality?: number
    label?: string
  }>(),
  {
    imageRef: null,
    error: undefined,
    quality: undefined,
    label: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'update:imageRef': [value: string | null]
  error: [message: string | null]
}>()

const FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

const languageStore = useLanguageStore()
const imageLibrary = useImageLibraryStore()

const uid = useId()
const hintId = `image-uploader-hint-${uid}`
const errorId = `image-uploader-error-${uid}`

const fileInput = ref<HTMLInputElement | null>(null)
const processing = ref(false)
const dragging = ref(false)
const pickerOpen = ref(false)
const loadingBundled = ref(false)
const bundledImages = ref<Array<{ name: string; dataUrl: string }>>([])

const invalid = computed(() => Boolean(props.error))
const describedBy = computed(() => (invalid.value ? `${errorId} ${hintId}` : hintId))
const fieldLabel = computed(() => props.label ?? languageStore.t('field.image'))
const buttonLabel = computed(() =>
  props.modelValue ? languageStore.t('image.change') : languageStore.t('image.upload'),
)
const libraryImages = computed(() => imageLibrary.images)

onMounted(() => {
  void imageLibrary.loadImages()
})

function isSelected(dataUrl: string, name: string): boolean {
  return props.modelValue === dataUrl || props.imageRef === name
}

function emitSelection(dataUrl: string, name: string): void {
  emit('update:modelValue', dataUrl)
  emit('update:imageRef', name)
  emit('error', null)
  pickerOpen.value = false
}

async function togglePicker(): Promise<void> {
  pickerOpen.value = !pickerOpen.value

  if (!pickerOpen.value || bundledImages.value.length > 0) return

  loadingBundled.value = true
  try {
    const entries = await Promise.all(
      getBundledImageNames().map(async (name) => ({
        name,
        dataUrl: await resolveBundledImage(name),
      })),
    )
    bundledImages.value = entries.filter(
      (entry): entry is { name: string; dataUrl: string } => entry.dataUrl !== null,
    )
  } finally {
    loadingBundled.value = false
  }
}

function selectLibraryImage(image: StoredImage): void {
  emitSelection(image.dataUrl, image.name)
}

function selectBundledImage(image: { name: string; dataUrl: string }): void {
  emitSelection(image.dataUrl, image.name)
}

async function processFile(file: File): Promise<void> {
  emit('error', null)

  const validation = await validateImageFile(file, languageStore.language)
  if (!validation.valid) {
    emit('error', validation.error ?? languageStore.t('error.imageType'))
    return
  }

  processing.value = true
  try {
    const dataUrl = await fileToOptimizedDataUrl(file, {
      quality: props.quality ?? IMAGE_QUALITY.default,
    })

    const stored = await imageLibrary.addProcessedImage({
      name: file.name,
      dataUrl,
      size: file.size,
    })

    emit('update:modelValue', dataUrl)
    emit('update:imageRef', stored?.name ?? file.name)
  } catch {
    emit('error', languageStore.t('error.imageProcess'))
  } finally {
    processing.value = false
  }
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''

  if (file) {
    void processFile(file)
  }
}

function handleDrop(event: DragEvent): void {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0] ?? null

  if (file) {
    void processFile(file)
  }
}

function removeImage(): void {
  emit('update:modelValue', null)
  emit('update:imageRef', null)
  emit('error', null)

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="image-uploader">
    <span class="form-field__label">{{ fieldLabel }}</span>

    <div
      class="image-uploader__preview"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="handleDrop"
    >
      <img
        v-if="modelValue"
        :src="modelValue"
        :alt="languageStore.t('image.selectedAlt')"
      />
      <span v-else class="image-uploader__empty">
        {{ languageStore.t('image.upload') }}
      </span>
    </div>

    <p v-if="processing" class="image-uploader__status" role="status">
      {{ languageStore.t('image.processing') }}
    </p>

    <p v-if="error" :id="errorId" class="form-field__error" role="alert">{{ error }}</p>

    <p :id="hintId" class="form-field__hint">
      {{ languageStore.t('image.hint') }}
    </p>

    <div class="image-uploader__actions">
      <label class="btn btn--secondary btn--sm file-button">
        {{ buttonLabel }}
        <input
          ref="fileInput"
          type="file"
          :accept="FILE_ACCEPT"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          @change="handleFileChange"
        />
      </label>

      <button
        v-if="modelValue"
        type="button"
        class="btn btn--ghost btn--sm"
        @click="removeImage"
      >
        {{ languageStore.t('image.remove') }}
      </button>
    </div>

    <button
      type="button"
      class="btn btn--secondary btn--sm image-uploader__library-toggle"
      :aria-expanded="pickerOpen"
      @click="togglePicker"
    >
      {{ pickerOpen ? languageStore.t('image.libraryHide') : languageStore.t('image.library') }}
    </button>

    <div v-if="pickerOpen" class="image-picker">
      <section class="image-picker__section">
        <p class="image-picker__heading">{{ languageStore.t('image.libraryYour') }}</p>
        <p v-if="libraryImages.length === 0" class="form-field__hint">
          {{ languageStore.t('image.libraryEmpty') }}
        </p>
        <div v-else class="image-picker__grid">
          <button
            v-for="image in libraryImages"
            :key="image.id"
            type="button"
            class="image-picker__item"
            :class="{ 'is-selected': isSelected(image.dataUrl, image.name) }"
            :title="image.name"
            @click="selectLibraryImage(image)"
          >
            <img :src="image.dataUrl" :alt="image.name" loading="lazy" />
            <span class="image-picker__name">{{ image.name }}</span>
          </button>
        </div>
      </section>

      <section class="image-picker__section">
        <p class="image-picker__heading">{{ languageStore.t('image.librarySamples') }}</p>
        <p v-if="loadingBundled" class="image-uploader__status" role="status">
          {{ languageStore.t('common.loading') }}
        </p>
        <div v-else class="image-picker__grid">
          <button
            v-for="image in bundledImages"
            :key="image.name"
            type="button"
            class="image-picker__item"
            :class="{ 'is-selected': isSelected(image.dataUrl, image.name) }"
            :title="image.name"
            @click="selectBundledImage(image)"
          >
            <img :src="image.dataUrl" :alt="image.name" loading="lazy" />
            <span class="image-picker__name">{{ image.name }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
.image-uploader {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.image-uploader__preview {
  display: grid;
  place-items: center;
  width: 140px;
  height: 180px;
  max-width: 100%;
  overflow: hidden;
  padding: var(--space-2);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-text-faint);
  font-size: 0.76rem;
  line-height: 1.35;
  text-align: center;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}

.image-uploader__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-uploader__preview.is-dragging {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.form-field--invalid .image-uploader__preview {
  border-color: var(--color-danger);
}

.image-uploader__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.image-uploader__status {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.image-uploader__library-toggle {
  align-self: flex-start;
}

.image-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.image-picker__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.image-picker__heading {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--color-text-muted);
}

.image-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: var(--space-2);
}

.image-picker__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.66rem;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}

.image-picker__item:hover {
  border-color: var(--color-border-strong);
}

.image-picker__item.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-text);
}

.image-picker__item img {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: calc(var(--radius-sm) - 2px);
  background: var(--color-bg-elevated);
}

.image-picker__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.image-uploader .file-button:has(input:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 75%, white 10%);
  outline-offset: 2px;
}
</style>
