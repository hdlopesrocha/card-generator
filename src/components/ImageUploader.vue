<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { IMAGE_QUALITY } from '@/config/constants'
import { fileToOptimizedDataUrl, validateImageFile } from '@/services/image/imageService'
import { useLanguageStore } from '@/stores/languageStore'

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    error?: string
    quality?: number
    label?: string
  }>(),
  {
    error: undefined,
    quality: undefined,
    label: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  error: [message: string | null]
}>()

const FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

const languageStore = useLanguageStore()

const uid = useId()
const hintId = `image-uploader-hint-${uid}`
const errorId = `image-uploader-error-${uid}`

const fileInput = ref<HTMLInputElement | null>(null)
const processing = ref(false)
const dragging = ref(false)

const invalid = computed(() => Boolean(props.error))
const describedBy = computed(() => (invalid.value ? `${errorId} ${hintId}` : hintId))
const fieldLabel = computed(() => props.label ?? languageStore.t('field.image'))
const buttonLabel = computed(() =>
  props.modelValue ? languageStore.t('image.change') : languageStore.t('image.upload'),
)

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
    emit('update:modelValue', dataUrl)
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

.image-uploader .file-button:has(input:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 75%, white 10%);
  outline-offset: 2px;
}
</style>
