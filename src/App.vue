<script setup lang="ts">
import AppNavigation from '@/components/AppNavigation.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import { useLanguageStore } from '@/stores/languageStore'

const languageStore = useLanguageStore()
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">{{ languageStore.t('app.skipToContent') }}</a>

    <header class="app-shell__header">
      <span class="app-shell__brand-mark" aria-hidden="true">CG</span>
      <div class="app-shell__brand-text">
        <strong>Card Generator</strong>
        <span>{{ languageStore.t('app.tagline') }}</span>
      </div>

      <LanguagePicker class="app-shell__language" />
    </header>

    <AppNavigation />

    <main id="main-content" class="app-shell__main" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
