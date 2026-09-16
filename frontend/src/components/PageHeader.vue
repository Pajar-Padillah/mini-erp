<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'

defineProps<{ title: string; subtitle?: string; breadcrumb?: { label: string; to: string }; showBack?: boolean }>()
const router = useRouter()
</script>

<template>
  <div class="page-header">
    <div class="page-header-left">
      <el-button v-if="showBack" class="page-back-btn" :icon="ArrowLeft" circle @click="router.back()" />
      <div>
        <div v-if="breadcrumb" class="page-breadcrumb">
          <router-link :to="breadcrumb.to">{{ breadcrumb.label }}</router-link>
        </div>
        <h2>
          {{ title }}
          <slot name="badges" />
        </h2>
        <div v-if="subtitle" class="page-subtitle">{{ subtitle }}</div>
      </div>
    </div>
    <div class="page-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
