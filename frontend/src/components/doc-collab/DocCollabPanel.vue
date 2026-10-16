<script setup lang="ts">
// Attachments (a field of the document, on top) and comments (notifications / discussion, below),
// both full width. A new document (draft key, see docCollabStore) only shows the attachments:
// comments appear once the document exists.
// Used in the document forms, detail pages and list row actions.
import { computed } from 'vue'
import DocComments from './DocComments.vue'
import DocAttachments from './DocAttachments.vue'
import { isDraftKey } from '../../stores/docCollabStore'

const props = defineProps<{ docKey: string }>()
const isNew = computed(() => isDraftKey(props.docKey))
</script>

<template>
  <div class="collab-grid">
    <DocAttachments :doc-key="docKey" />
    <DocComments v-if="!isNew" :doc-key="docKey" />
  </div>
</template>

<style scoped>
.collab-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
</style>
