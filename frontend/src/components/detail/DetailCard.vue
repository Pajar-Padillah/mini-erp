<script setup lang="ts">
// Section card on detail pages (items, notes, document info): dashboard card with a header,
// optional header actions and an optional footer (e.g. totals).
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="dash-card detail-card">
    <header class="dash-card-head detail-card-head">
      <div>
        <h4>{{ title }}</h4>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="detail-card-actions"><slot name="actions" /></div>
    </header>
    <slot />
    <footer v-if="$slots.footer" class="detail-card-foot"><slot name="footer" /></footer>
  </section>
</template>
