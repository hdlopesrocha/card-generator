<script setup lang="ts">
import { computed, onMounted } from 'vue'

import AppNavigation from '@/components/AppNavigation.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import { cardFontFamily, ensureCardFontFaces } from '@/services/fonts/webFonts'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

const languageStore = useLanguageStore()
const settings = useSettingsStore()

ensureCardFontFaces()

onMounted(() => {
  ensureCardFontFaces()
})

const shellStyle = computed(() => ({
  '--font-card': cardFontFamily(settings.cardFontId),
}))
</script>

<template>
  <div class="app-shell" :style="shellStyle">
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
