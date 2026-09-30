<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { useLanguageStore } from '@/stores/languageStore'

const languageStore = useLanguageStore()
</script>

<template>
  <nav class="app-navigation" :aria-label="languageStore.t('nav.mainLabel')">
    <p class="app-navigation__heading">{{ languageStore.t('nav.workspace') }}</p>

    <RouterLink class="app-navigation__link" to="/cards">
      <span class="app-navigation__icon" aria-hidden="true">▦</span>
      <span>{{ languageStore.t('nav.cards') }}</span>
    </RouterLink>

    <RouterLink class="app-navigation__link" to="/cards/new">
      <span class="app-navigation__icon" aria-hidden="true">＋</span>
      <span>{{ languageStore.t('nav.newCard') }}</span>
    </RouterLink>

    <RouterLink class="app-navigation__link" to="/images">
      <span class="app-navigation__icon" aria-hidden="true">▣</span>
      <span>{{ languageStore.t('nav.images') }}</span>
    </RouterLink>

    <RouterLink class="app-navigation__link" to="/settings">
      <span class="app-navigation__icon" aria-hidden="true">⚙</span>
      <span>{{ languageStore.t('nav.settings') }}</span>
    </RouterLink>
  </nav>
</template>
