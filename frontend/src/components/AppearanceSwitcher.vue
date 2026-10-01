<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Moon, Setting, Sunny } from '@element-plus/icons-vue'
import { THEME_PRESETS, useThemeStore } from '../stores/themeStore'

const { t } = useI18n()
const themeStore = useThemeStore()
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)

function onSelectColor(key: string) {
  themeStore.setTheme(key)
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  if ((target as HTMLElement).closest?.('.appearance-popover')) return
  open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <el-popover trigger="click" placement="bottom-end" width="232" popper-class="appearance-popover" :visible="open" @update:visible="open = $event">
    <template #reference>
      <button ref="triggerRef" class="appearance-trigger" type="button" :title="t('appearance.settings')">
        <el-icon><Setting /></el-icon>
      </button>
    </template>

    <div class="appearance-panel">
      <div class="appearance-panel-title">{{ t('appearance.themeColor') }}</div>
      <div class="appearance-grid">
        <button
          v-for="t in THEME_PRESETS"
          :key="t.key"
          type="button"
          class="appearance-swatch-btn"
          :class="{ 'is-active': t.key === themeStore.theme }"
          :style="{ '--swatch-color': t.color }"
          :title="t.label"
          @click="onSelectColor(t.key)"
        >
          <span class="appearance-swatch-inner" />
        </button>
      </div>

      <div class="appearance-panel-title appearance-mode-title">{{ t('appearance.mode') }}</div>
      <div class="appearance-mode-toggle">
        <button
          type="button"
          class="appearance-mode-btn"
          :class="{ 'is-active': themeStore.mode === 'light' }"
          @click="themeStore.setMode('light')"
        >
          <el-icon><Sunny /></el-icon>
          {{ t('appearance.light') }}
        </button>
        <button
          type="button"
          class="appearance-mode-btn"
          :class="{ 'is-active': themeStore.mode === 'dark' }"
          @click="themeStore.setMode('dark')"
        >
          <el-icon><Moon /></el-icon>
          {{ t('appearance.dark') }}
        </button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.appearance-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--gray-400);
  cursor: pointer;
  padding: 0;
  font-size: 15px;
  transition: color 0.15s ease, background 0.15s ease;
}
.appearance-trigger:hover {
  color: var(--gray-700);
  background: var(--gray-100);
}
</style>

<style>
.appearance-popover.el-popover.el-popper {
  padding: 14px;
  border-radius: var(--radius-lg);
}

.appearance-panel-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.appearance-mode-title {
  margin-top: 16px;
}

.appearance-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.appearance-swatch-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  padding: 3px;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease;
}
.appearance-swatch-btn:hover {
  transform: scale(1.1);
}
.appearance-swatch-btn:hover .appearance-swatch-inner {
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 3.5px color-mix(in srgb, var(--swatch-color) 60%, transparent);
}
.appearance-swatch-btn.is-active .appearance-swatch-inner {
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 3.5px var(--swatch-color);
}
.appearance-swatch-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--swatch-color);
  transition: box-shadow 0.12s ease;
}
.appearance-swatch-btn.is-active .appearance-swatch-inner::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.08);
}

.appearance-mode-toggle {
  display: flex;
  gap: 8px;
  background: var(--gray-100);
  padding: 4px;
  border-radius: var(--radius-md);
}
.appearance-mode-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 0;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  color: var(--gray-500);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}
.appearance-mode-btn:hover {
  color: var(--gray-900);
}
.appearance-mode-btn.is-active {
  background: var(--bg-card);
  color: var(--brand);
  box-shadow: var(--shadow-sm);
}
</style>
