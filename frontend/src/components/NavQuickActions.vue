<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Bell, ChatDotRound, Tickets } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'

const router = useRouter()
const route = useRoute()
const chat = useChatStore()

const approvalListOpen = ref(false)
const notificationsOpen = ref(false)

const approvals = [
  {
    module: 'Payment Request',
    reference: 'PR-2025-004',
    requester: 'Sarah Johnson',
  },
  {
    module: 'Purchase Order',
    reference: 'PO-2025-018',
    requester: 'Michael Chen',
  },
  {
    module: 'Payment Request',
    reference: 'PR-2025-006',
    requester: 'Emily Davis',
  },
]

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
        <button class="nav-icon-btn" type="button" aria-label="Approval list, 3 pending" title="Approval list">
          <el-icon><Tickets /></el-icon>
          <span class="nav-icon-count">{{ approvals.length }}</span>
        </button>
      </template>
      <div class="nav-quick-panel">
        <div class="nav-quick-panel-heading">
          <div>
            <span class="nav-quick-eyebrow">WORKFLOW</span>
            <h3>Approval List</h3>
          </div>
          <span class="nav-quick-total">{{ approvals.length }} pending</span>
        </div>
        <div class="nav-quick-list">
          <div
            v-for="approval in approvals"
            :key="approval.reference"
            class="nav-quick-item"
          >
            <span class="nav-quick-item-icon is-pending"><el-icon><Tickets /></el-icon></span>
            <span class="nav-quick-item-content">
              <span class="nav-quick-item-title">{{ approval.module }} <span>{{ approval.reference }}</span></span>
              <span class="nav-quick-item-requester">Request by {{ approval.requester }}</span>
            </span>
            <el-icon class="nav-quick-item-chevron" aria-hidden="true"><ArrowRight /></el-icon>
          </div>
        </div>
        <div class="nav-quick-panel-footer">
          <span>Pending approval requests</span>
          <button class="nav-quick-show-more" type="button">Show more</button>
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
