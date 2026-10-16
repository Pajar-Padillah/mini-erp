<script setup lang="ts">
// "You don't have access" empty state, shown instead of a page (or a section) the acting user may not see.
import { computed } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import { permItem, useAccessStore } from '../stores/accessStore'

const props = withDefaults(defineProps<{ itemKey?: string; title?: string; message?: string; compact?: boolean }>(), {
  itemKey: undefined,
  title: "You don't have access to this page",
  message: undefined,
  compact: false,
})

const access = useAccessStore()
const itemLabel = computed(() => (props.itemKey ? permItem(props.itemKey)?.label : undefined))
const text = computed(
  () =>
    props.message ??
    (itemLabel.value
      ? `Your group has no permission to open ${itemLabel.value}. Ask an administrator to grant access.`
      : 'Your group has no permission for this. Ask an administrator to grant access.'),
)
const canManage = computed(() => access.canView('users-roles'))
</script>

<template>
  <div class="access-denied" :class="{ compact }">
    <div class="ad-icon"><el-icon :size="compact ? 22 : 30"><Lock /></el-icon></div>
    <div class="ad-title">{{ title }}</div>
    <div class="ad-text">{{ text }}</div>
    <div v-if="access.currentUser" class="ad-user">
      Signed in as <b>{{ access.currentUser.name }}</b>
      <span class="status-pill gray">{{ access.currentGroup?.name ?? 'No group' }}</span>
      <span v-if="access.isSimulating" class="status-pill amber">Simulated</span>
    </div>
    <div class="ad-actions">
      <el-button v-if="access.isSimulating" @click="access.setActAs(null)">Stop simulating</el-button>
      <router-link v-if="canManage" to="/administration/users-roles">
        <el-button type="primary" plain>Open Users &amp; Roles</el-button>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.access-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 64px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}
.access-denied.compact {
  padding: 28px 16px;
  box-shadow: none;
  background: var(--gray-50);
}
.ad-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--danger-light);
  color: var(--danger);
}
.compact .ad-icon {
  width: 44px;
  height: 44px;
}
.ad-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--gray-900);
}
.compact .ad-title {
  font-size: 15px;
}
.ad-text {
  max-width: 460px;
  color: var(--gray-500);
  font-size: 13px;
}
.ad-user {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 13px;
  color: var(--gray-700);
}
.ad-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
</style>
