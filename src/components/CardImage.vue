<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string | null
    alt: string
    initial?: string
    placeholderLabel?: string
  }>(),
  {
    placeholderLabel: 'No artwork',
  },
)

const failed = ref(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

const initialText = computed(() => {
  const value = props.initial ?? props.alt
  return value.trim().charAt(0).toUpperCase()
})
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="alt"
    loading="lazy"
    @error="failed = true"
  />
  <div v-else class="card__artwork-placeholder">
    <span class="card__artwork-initial">{{ initialText || '?' }}</span>
    <span class="card__artwork-hint">{{ placeholderLabel }}</span>
  </div>
</template>
