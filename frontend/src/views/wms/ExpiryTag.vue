<script setup lang="ts">
// Expiry status pill for a lot: "< 3 months · 45 d", "Expired", "Good", or "No expiry".
import { computed } from 'vue'
import { daysToExpiry, expiryStatus } from '../../stores/wmsStore'
import { expiryColor, expiryLabel } from './wmsUi'

const props = withDefaults(defineProps<{ exp: string; hasExpiry?: boolean; showDays?: boolean }>(), { hasExpiry: true, showDays: false })

const none = computed(() => !props.hasExpiry || !props.exp || props.exp === '-')
const status = computed(() => expiryStatus(props.exp, props.hasExpiry))
const days = computed(() => daysToExpiry(props.exp))
</script>

<template>
  <span v-if="none" class="status-pill gray">No expiry</span>
  <span v-else class="status-pill" :class="expiryColor(status)" :title="`Expires ${exp}`">
    {{ expiryLabel(status) }}<template v-if="showDays && days !== null"> · {{ days < 0 ? `${-days} d ago` : `${days} d` }}</template>
  </span>
</template>
