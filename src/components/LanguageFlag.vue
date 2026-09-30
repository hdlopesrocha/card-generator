<script setup lang="ts">
import type { Language } from '@/models/Language'

const props = defineProps<{ language: Language }>()
</script>

<template>
  <span class="language-flag" aria-hidden="true">
    <svg viewBox="0 0 60 40" focusable="false">
      <template v-if="props.language === 'EN'">
        <rect width="60" height="40" fill="#012169" />
        <path d="M0 0 L60 40 M60 0 L0 40" stroke="#ffffff" stroke-width="8" />
        <path d="M0 0 L60 40 M60 0 L0 40" stroke="#c8102e" stroke-width="4" />
        <path d="M30 0 V40 M0 20 H60" stroke="#ffffff" stroke-width="13" />
        <path d="M30 0 V40 M0 20 H60" stroke="#c8102e" stroke-width="8" />
      </template>

      <template v-else-if="props.language === 'PT'">
        <rect width="24" height="40" fill="#046a38" />
        <rect x="24" width="36" height="40" fill="#da291c" />
        <circle cx="24" cy="20" r="9" fill="#ffd100" />
        <circle cx="24" cy="20" r="5.5" fill="#ffffff" />
        <rect x="21" y="16" width="6" height="8" rx="1" fill="#da291c" />
      </template>

      <template v-else-if="props.language === 'FR'">
        <rect width="20" height="40" fill="#002654" />
        <rect x="20" width="20" height="40" fill="#ffffff" />
        <rect x="40" width="20" height="40" fill="#ce1126" />
      </template>

      <template v-else-if="props.language === 'ES'">
        <rect width="60" height="40" fill="#aa151b" />
        <rect y="10" width="60" height="20" fill="#f1bf00" />
        <rect x="12" y="15" width="8" height="10" rx="1" fill="#aa151b" />
      </template>

      <template v-else-if="props.language === 'DE'">
        <rect width="60" height="13.34" fill="#000000" />
        <rect y="13.34" width="60" height="13.33" fill="#dd0000" />
        <rect y="26.67" width="60" height="13.33" fill="#ffce00" />
      </template>

      <template v-else-if="props.language === 'NL'">
        <rect width="60" height="13.34" fill="#ae1c28" />
        <rect y="13.34" width="60" height="13.33" fill="#ffffff" />
        <rect y="26.67" width="60" height="13.33" fill="#21468b" />
      </template>

      <template v-else>
        <rect width="20" height="40" fill="#009246" />
        <rect x="20" width="20" height="40" fill="#ffffff" />
        <rect x="40" width="20" height="40" fill="#ce2b37" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.language-flag {
  display: inline-flex;
  width: 24px;
  height: 16px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 3px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(2, 6, 18, 0.45);
}

.language-flag svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
