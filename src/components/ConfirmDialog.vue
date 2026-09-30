<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

import { useLanguageStore } from '@/stores/languageStore'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    busy?: boolean
  }>(),
  {
    message: undefined,
    confirmLabel: undefined,
    cancelLabel: undefined,
    busy: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const languageStore = useLanguageStore()

const confirmText = computed(() => props.confirmLabel ?? languageStore.t('common.delete'))
const cancelText = computed(() => props.cancelLabel ?? languageStore.t('common.cancel'))

const uid = useId()
const titleId = `confirm-dialog-title-${uid}`
const descriptionId = `confirm-dialog-description-${uid}`

const cancelButton = ref<HTMLButtonElement | null>(null)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('cancel')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown)
      void nextTick(() => {
        cancelButton.value?.focus()
      })
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="dialog-backdrop" @click.self="emit('cancel')">
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="message ? descriptionId : undefined"
      >
        <header class="dialog__header">
          <div>
            <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
            <p v-if="message" :id="descriptionId" class="dialog__description">{{ message }}</p>
          </div>
          <button
            type="button"
            class="dialog__close"
            :aria-label="languageStore.t('dialog.close')"
            @click="emit('cancel')"
          >
            ×
          </button>
        </header>

        <footer class="dialog__footer">
          <button
            ref="cancelButton"
            type="button"
            class="btn btn--secondary"
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? languageStore.t('common.working') : confirmText }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
