<script setup lang="ts">
// Shown by the router guard when the acting user lacks view permission on a menu.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AccessDenied from '../components/AccessDenied.vue'

const route = useRoute()
const itemKey = computed(() => (typeof route.query.key === 'string' ? route.query.key : undefined))
</script>

<template>
  <div class="page">
    <AccessDenied :item-key="itemKey" />
  </div>
</template>
