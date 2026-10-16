<script setup lang="ts">
// Static mockup: nothing here is saved to the backend.
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCompanyStore } from '../stores/companyStore'
import { useAuthStore } from '../stores/authStore'

const props = defineProps<{ modelValue: boolean; name: string; initials: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const companyStore = useCompanyStore()
const auth = useAuthStore()
const activeTab = ref<'profile' | 'password'>('profile')

const profile = reactive({
  name: props.name,
  email: auth.user?.email ?? 'pajar.padillah@example.com',
  phone: '+62 812-3456-7890',
  role: 'Fullstack Developer',
  department: 'Information Technology',
})

const password = reactive({ current: '', next: '', confirm: '' })
const rules = computed(() => [
  { label: 'At least 8 characters', ok: password.next.length >= 8 },
  { label: 'Upper and lower case letters', ok: /[a-z]/.test(password.next) && /[A-Z]/.test(password.next) },
  { label: 'At least one number', ok: /\d/.test(password.next) },
  { label: 'Matches the confirmation', ok: !!password.next && password.next === password.confirm },
])
const canChangePassword = computed(() => !!password.current && rules.value.every((r) => r.ok))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    activeTab.value = 'profile'
    Object.assign(password, { current: '', next: '', confirm: '' })
  },
)

function close() {
  emit('update:modelValue', false)
}

function saveProfile() {
  ElMessage.success('Profile updated (mockup only, not saved)')
  close()
}

function changePassword() {
  if (!canChangePassword.value) return
  ElMessage.success('Password changed (mockup only, not saved)')
  close()
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="My Account"
    width="560px"
    class="profile-dialog"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="profile-hero">
      <el-avatar class="profile-hero-avatar" :size="56">{{ initials }}</el-avatar>
      <div class="profile-hero-meta">
        <div class="profile-hero-name">{{ profile.name }}</div>
        <div class="profile-hero-role">{{ profile.role }} · {{ profile.department }}</div>
        <div class="profile-hero-company">{{ companyStore.selectedCompany?.name ?? '-' }}</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="profile-tabs">
      <el-tab-pane label="Profile" name="profile">
        <el-form label-position="top" class="profile-form">
          <el-form-item label="Full name">
            <el-input v-model="profile.name" />
          </el-form-item>
          <el-form-item label="Email">
            <el-input v-model="profile.email" />
          </el-form-item>
          <el-form-item label="Phone">
            <el-input v-model="profile.phone" />
          </el-form-item>
          <el-form-item label="Role">
            <el-input :model-value="profile.role" disabled />
          </el-form-item>
          <el-form-item label="Department">
            <el-input :model-value="profile.department" disabled />
          </el-form-item>
          <el-form-item label="Company access">
            <el-input model-value="PT Sant Group Indonesia (all branches)" disabled />
          </el-form-item>
        </el-form>
        <div class="profile-actions">
          <el-button @click="close">Cancel</el-button>
          <el-button type="primary" @click="saveProfile">Save changes</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Change Password" name="password">
        <el-form label-position="top" class="profile-form is-single" @submit.prevent="changePassword">
          <el-form-item label="Current password">
            <el-input v-model="password.current" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-form-item label="New password">
            <el-input v-model="password.next" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item label="Confirm new password">
            <el-input v-model="password.confirm" type="password" show-password autocomplete="new-password" />
          </el-form-item>
        </el-form>
        <ul class="password-rules">
          <li v-for="rule in rules" :key="rule.label" :class="{ 'is-ok': rule.ok }">
            <span class="password-rule-dot" />{{ rule.label }}
          </li>
        </ul>
        <div class="profile-actions">
          <el-button @click="close">Cancel</el-button>
          <el-button type="primary" :disabled="!canChangePassword" @click="changePassword">Update password</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>
