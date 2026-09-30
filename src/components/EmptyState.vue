<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    message?: string
    actionLabel?: string
    icon?: string
  }>(),
  {
    message: undefined,
    actionLabel: undefined,
    icon: '🃏',
  },
)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <section class="empty-state">
    <span class="empty-state__icon" aria-hidden="true">{{ icon }}</span>
    <h2 class="empty-state__title">{{ title }}</h2>
    <p v-if="message" class="empty-state__message">{{ message }}</p>
    <button v-if="actionLabel" type="button" class="btn btn--primary" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </section>
</template>
