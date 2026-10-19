<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, SwitchButton, User } from '@element-plus/icons-vue'
import CompanySwitcher from './CompanySwitcher.vue'
import ProfileDialog from './ProfileDialog.vue'
import { useAuthStore } from '../stores/authStore'
import { useTabsStore } from '../stores/tabsStore'

const router = useRouter()
const auth = useAuthStore()
const tabsStore = useTabsStore()

const props = withDefaults(defineProps<{ name?: string }>(), { name: undefined })
const name = computed(() => props.name ?? auth.user?.name ?? 'Oliver Bennett')
const email = computed(() => auth.user?.email ?? 'oliver.bennett@example.com')

const initials = computed(() =>
  name.value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join(''),
)

const profileOpen = ref(false)
const menu = ref<{ handleOpen: () => void } | null>(null)

async function onCommand(command: 'profile' | 'logout') {
  if (command === 'profile') {
    profileOpen.value = true
    return
  }
  try {
    await ElMessageBox.confirm('Are you sure you want to log out?', 'Log out', {
      confirmButtonText: 'Log out',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
    auth.logout()
    tabsStore.tabs = tabsStore.tabs.filter((t) => !t.closable)
    tabsStore.persist()
    await router.replace({ name: 'login' })
    ElMessage.success('You have been logged out')
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="user-avatar">
    <button type="button" class="user-avatar-initials-btn" aria-label="Open user menu" @click="menu?.handleOpen()">
      <el-avatar class="user-avatar-initials" :size="36">{{ initials }}</el-avatar>
    </button>
    <div class="user-avatar-meta">
      <el-dropdown ref="menu" trigger="click" placement="bottom-start" popper-class="user-menu-popper" @command="onCommand">
        <button type="button" class="user-avatar-name-btn" aria-label="Open user menu">
          <span class="user-avatar-name">{{ name }}</span>
          <el-icon class="user-avatar-name-caret"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <div class="user-menu-header">
            <div class="user-menu-name">{{ name }}</div>
            <div class="user-menu-email">{{ email }}</div>
          </div>
          <el-dropdown-menu>
            <el-dropdown-item command="profile" :icon="User">Profile</el-dropdown-item>
            <el-dropdown-item command="logout" :icon="SwitchButton" divided class="user-menu-logout">Logout</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <CompanySwitcher />
    </div>
    <ProfileDialog v-model="profileOpen" :name="name" :initials="initials" />
  </div>
</template>
