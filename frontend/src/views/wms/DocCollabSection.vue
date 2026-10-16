<script setup lang="ts">
// Attachments (and comments for saved documents) placed below the fields of a WMS form dialog.
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'

defineProps<{ docKey: string }>()
</script>

<template>
  <div v-if="docKey" class="wms-collab">
    <DocCollabPanel :doc-key="docKey" />
  </div>
</template>

<style scoped>
.wms-collab {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}
</style>
