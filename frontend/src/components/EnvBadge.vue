<script setup lang="ts">
// Environment badge: VITE_APP_ENV wins (MOCKUP, DEV, STAGING, PROD); otherwise "DEV" during local
// development. Production builds without VITE_APP_ENV show no badge.
const label = String(import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? 'DEV' : '')).toUpperCase()
const TONES: Record<string, string> = { MOCKUP: 'purple', DEV: 'amber', STAGING: 'blue', PROD: 'red', PRODUCTION: 'red' }
const tone = TONES[label] ?? 'amber'
const title = label === 'MOCKUP' ? 'Mockup environment: most pages show sample data only' : `${label} environment`
</script>

<template>
  <span v-if="label" class="env-badge" :class="tone" :title="title">{{ label }}</span>
</template>
