<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Bell, ChatDotRound, Tickets } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import { tableLabel, useApprovalStore, type ApprovalRequest } from '../stores/approvalStore'

const router = useRouter()
const route = useRoute()
const chat = useChatStore()

const approvalListOpen = ref(false)
const notificationsOpen = ref(false)

const approvalStore = useApprovalStore()
const pendingCount = computed(() => approvalStore.pending.length)
// The dropdown previews the latest few; Show more opens the full Pending Approval List.
const approvals = computed(() => approvalStore.pending.slice(0, 3))

function openApproval(approval: ApprovalRequest) {
  approvalListOpen.value = false
  router.push({ name: 'pending-approvals-detail', params: { id: approval.id } })
}

function showAllApprovals() {
  approvalListOpen.value = false
  router.push({ name: 'pending-approvals' })
}

const notifications = [
  {
    title: 'Payment request submitted',
    message: 'PR-2025-004 is waiting for your approval.',
    time: '5 min ago',
    type: 'approval',
  },
  {
    title: 'Purchase order rejected',
    message: 'PO-2025-015 was rejected by Alex Morgan.',
    time: '24 min ago',
    type: 'rejected',
  },
  {
    title: 'Payment request approved',
    message: 'PR-2025-002 has been approved.',
    time: '1 hour ago',
    type: 'approved',
  },
  {
    title: 'Purchase order submitted',
    message: 'PO-2025-018 is waiting for your approval.',
    time: '2 hours ago',
    type: 'approval',
  },
  {
    title: 'Payment request rejected',
    message: 'PR-2025-001 was rejected. View the request for details.',
    time: 'Yesterday',
    type: 'rejected',
  },
]
</script>

<template>
  <div class="nav-quick-actions">
    <button
      class="nav-icon-btn"
      :class="{ 'is-active': route.name === 'chat' }"
      type="button"
      :aria-label="`Chat, ${chat.totalUnread} unread`"
      title="Chat"
      @click="router.push({ name: 'chat' })"
    >
      <el-icon><ChatDotRound /></el-icon>
      <span v-if="chat.totalUnread" class="nav-icon-count">{{ chat.totalUnread }}</span>
    </button>

    <el-popover
      :visible="approvalListOpen"
      @update:visible="approvalListOpen = $event"
      placement="bottom-end"
      trigger="click"
      :width="360"
      popper-class="nav-quick-popover"
    >
      <template #reference>
        <button class="nav-icon-btn" type="button" :aria-label="`Approval list, ${pendingCount} pending`" title="Approval list">
          <el-icon><Tickets /></el-icon>
          <span v-if="pendingCount" class="nav-icon-count">{{ pendingCount }}</span>
        </button>
      </template>
      <div class="nav-quick-panel">
        <div class="nav-quick-panel-heading">
          <div>
            <span class="nav-quick-eyebrow">WORKFLOW</span>
            <h3>Approval List</h3>
          </div>
          <span class="nav-quick-total">{{ pendingCount }} pending</span>
        </div>
        <div class="nav-quick-list">
          <button
            v-for="approval in approvals"
            :key="approval.id"
            type="button"
            class="nav-quick-item"
            @click="openApproval(approval)"
          >
            <span class="nav-quick-item-icon is-pending"><el-icon><Tickets /></el-icon></span>
            <span class="nav-quick-item-content">
              <span class="nav-quick-item-title">{{ tableLabel(approval.table) }} <span>{{ approval.no }}</span></span>
              <span class="nav-quick-item-requester">Request by {{ approval.requestedBy }}</span>
            </span>
            <el-icon class="nav-quick-item-chevron" aria-hidden="true"><ArrowRight /></el-icon>
          </button>
          <div v-if="!approvals.length" class="nav-quick-empty">Nothing waiting for your approval.</div>
        </div>
        <div class="nav-quick-panel-footer">
          <span>Pending approval requests</span>
          <button class="nav-quick-show-more" type="button" @click="showAllApprovals">Show more</button>
        </div>
      </div>
    </el-popover>

    <el-popover
      :visible="notificationsOpen"
      @update:visible="notificationsOpen = $event"
      placement="bottom-end"
      trigger="click"
      :width="360"
      popper-class="nav-quick-popover"
    >
      <template #reference>
        <button class="nav-icon-btn" type="button" aria-label="Notifications, 5 unread" title="Notifications">
          <el-icon><Bell /></el-icon>
          <span class="nav-icon-count">{{ notifications.length }}</span>
        </button>
      </template>
      <div class="nav-quick-panel">
        <div class="nav-quick-panel-heading">
          <div>
            <span class="nav-quick-eyebrow">UPDATES</span>
            <h3>Notifications</h3>
          </div>
          <span class="nav-quick-total">{{ notifications.length }} new</span>
        </div>
        <div class="nav-quick-list">
          <div
            v-for="notification in notifications"
            :key="`${notification.title}-${notification.time}`"
            class="nav-quick-item"
          >
            <span class="nav-quick-item-icon" :class="`is-${notification.type}`">
              <el-icon><Bell /></el-icon>
            </span>
            <span class="nav-quick-item-content">
              <span class="nav-quick-item-title">{{ notification.title }}</span>
              <span class="nav-quick-item-description">{{ notification.message }}</span>
              <span class="nav-quick-item-time">{{ notification.time }}</span>
            </span>
            <span class="nav-quick-unread-dot" aria-label="Unread"></span>
            <el-icon class="nav-quick-item-chevron" aria-hidden="true"><ArrowRight /></el-icon>
          </div>
        </div>
        <div class="nav-quick-panel-footer">
          <span>Recent activity</span>
          <button class="nav-quick-show-more" type="button">Show more</button>
        </div>
      </div>
    </el-popover>
  </div>
</template>
