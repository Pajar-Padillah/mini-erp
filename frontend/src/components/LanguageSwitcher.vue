<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, type LocaleCode } from '../i18n'
import { useLocaleStore } from '../stores/localeStore'

const { t } = useI18n()
const localeStore = useLocaleStore()

function onSelect(code: LocaleCode) {
  localeStore.setLocale(code)
}
</script>

<template>
  <el-dropdown trigger="click" @command="onSelect">
    <button class="appearance-trigger" type="button" :title="t('locale.settings')">
      {{ localeStore.locale.toUpperCase() }}
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="l in SUPPORTED_LOCALES" :key="l.code" :command="l.code" :class="{ 'is-active': l.code === localeStore.locale }">
          {{ l.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
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
  font-size: 11px;
  font-weight: 700;
  transition: color 0.15s ease, background 0.15s ease;
}
.appearance-trigger:hover {
  color: var(--gray-700);
  background: var(--gray-100);
}
</style>

<style>
.el-dropdown-menu__item.is-active {
  color: var(--brand);
  font-weight: 600;
}
</style>
