<script setup lang="ts">
import { computed } from 'vue'
import type { Zone } from '@/models/Card'
import { getZoneTheme } from '@/config/zones'

const props = withDefaults(
  defineProps<{
    zone: Zone
    label?: string
  }>(),
  {
    label: (props) => getZoneTheme(props.zone).label,
  },
)

const theme = computed(() => getZoneTheme(props.zone))
</script>

<template>
  <span class="card-zone-badge" :class="theme.className">
    <span class="card-zone-badge__dot" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>
