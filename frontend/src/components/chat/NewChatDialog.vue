<script setup lang="ts">
// Start a personal chat, create a group, or (mode "add") add people to an existing group.
import { computed, ref, watch } from 'vue'
import { Check, Search } from '@element-plus/icons-vue'
import { useChatStore } from '../../stores/chatStore'
import ChatAvatar from './ChatAvatar.vue'

const props = withDefaults(
  defineProps<{ modelValue: boolean; mode?: 'personal' | 'group' | 'add'; excludeIds?: string[] }>(),
  { mode: 'personal', excludeIds: () => [] },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; done: [conversationId?: string, pickedIds?: string[]] }>()

const chat = useChatStore()
const tab = ref<'personal' | 'group'>('personal')
const query = ref('')
const groupName = ref('')
const groupDescription = ref('')
const picked = ref<string[]>([])

const isAdd = computed(() => props.mode === 'add')
const multi = computed(() => isAdd.value || tab.value === 'group')
const title = computed(() => (isAdd.value ? 'Add members' : 'New chat'))

const people = computed(() => {
  const q = query.value.trim().toLowerCase()
  return chat.users
    .filter((u) => !props.excludeIds.includes(u.id))
    .filter((u) => !q || `${u.name} ${u.role} ${u.department}`.toLowerCase().includes(q))
})

const canSubmit = computed(() => {
  if (isAdd.value) return picked.value.length > 0
  return tab.value === 'group' && groupName.value.trim().length > 0 && picked.value.length >= 2
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    tab.value = props.mode === 'group' ? 'group' : 'personal'
    query.value = ''
    groupName.value = ''
    groupDescription.value = ''
    picked.value = []
  },
)

function close() {
  emit('update:modelValue', false)
}

function onPick(userId: string) {
  if (!multi.value) {
    const id = chat.startPersonal(userId)
    emit('done', id)
    close()
    return
  }
  picked.value = picked.value.includes(userId) ? picked.value.filter((u) => u !== userId) : [...picked.value, userId]
}

function submit() {
  if (!canSubmit.value) return
  if (isAdd.value) {
    emit('done', undefined, [...picked.value])
  } else {
    const id = chat.createGroup(groupName.value, picked.value, groupDescription.value)
    emit('done', id)
  }
  close()
}

</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    class="chat-dialog"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-segmented
      v-if="!isAdd"
      v-model="tab"
      :options="[
        { label: 'Personal', value: 'personal' },
        { label: 'Group', value: 'group' },
      ]"
      block
      class="chat-dialog-tabs"
    />

    <div v-if="!isAdd && tab === 'group'" class="chat-dialog-group-fields">
      <el-input v-model="groupName" placeholder="Group name, e.g. Finance Closing" maxlength="40" show-word-limit />
      <el-input v-model="groupDescription" placeholder="Description (optional)" maxlength="120" />
    </div>

    <el-input v-model="query" :prefix-icon="Search" placeholder="Search people by name, role or department…" clearable class="chat-dialog-search" />

    <div v-if="multi && picked.length" class="chat-dialog-picked">
      <span v-for="id in picked" :key="id" class="chat-dialog-chip" @click="onPick(id)">
        {{ chat.user(id)?.name }} ×
      </span>
    </div>

    <ul class="chat-dialog-people">
      <li v-for="u in people" :key="u.id">
        <button type="button" class="chat-dialog-person" :class="{ 'is-picked': picked.includes(u.id) }" @click="onPick(u.id)">
          <ChatAvatar :name="u.name" :presence="u.presence" :size="36" />
          <span class="chat-dialog-person-text">
            <span class="chat-dialog-person-name">{{ u.name }}</span>
            <span class="chat-dialog-person-role">{{ u.role }} · {{ u.department }}</span>
          </span>
          <span v-if="multi" class="chat-dialog-check" :class="{ 'is-on': picked.includes(u.id) }">
            <el-icon v-if="picked.includes(u.id)"><Check /></el-icon>
          </span>
        </button>
      </li>
      <li v-if="!people.length" class="chat-dialog-empty">No people found.</li>
    </ul>

    <template v-if="multi" #footer>
      <span class="chat-dialog-hint">
        <template v-if="isAdd">{{ picked.length }} selected</template>
        <template v-else>{{ picked.length }} selected · pick at least 2 people</template>
      </span>
      <el-button @click="close">Cancel</el-button>
      <el-button type="primary" :disabled="!canSubmit" @click="submit">{{ isAdd ? 'Add members' : 'Create group' }}</el-button>
    </template>
  </el-dialog>
</template>
