<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Message } from '@element-plus/icons-vue'
import EnvBadge from '../components/EnvBadge.vue'
import { useAuthStore } from '../stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ email: '', password: '', remember: true })
const rules: FormRules = {
  email: [
    { required: true, message: 'Email is required', trigger: 'blur' },
    { type: 'email', message: 'Enter a valid email address', trigger: 'blur' },
  ],
  password: [{ required: true, message: 'Password is required', trigger: 'blur' }],
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  loading.value = true
  try {
    await auth.login(form.email, form.password, form.remember)
    ElMessage.success(`Welcome back, ${auth.user?.name}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } finally {
    loading.value = false
  }
}

function forgotPassword() {
  ElMessage.info('Password reset is not available in the mockup.')
}
</script>

<template>
  <div class="login-page">
    <section class="login-brand" aria-hidden="true">
      <div class="login-brand-logo">
        <div class="app-logo-mark"><img class="app-logo-image" src="/sant-logo.png" alt="" /></div>
        <span class="app-logo-title">SANT <span class="accent">SUITE</span></span>
      </div>
      <div class="login-brand-copy">
        <h1>One place for every branch of the business.</h1>
        <p>Sales, purchasing, inventory, finance and people, consolidated across PT Sant Group Indonesia and its branches.</p>
        <ul class="login-brand-points">
          <li>Group view across all branches</li>
          <li>Sales to cash, end to end</li>
          <li>Real-time stock per branch</li>
        </ul>
      </div>
      <div class="login-brand-foot">© {{ new Date().getFullYear() }} PT Sant Group Indonesia</div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-card-head">
          <div>
            <h2>Sign in</h2>
            <p>Welcome back. Enter your account details to continue.</p>
          </div>
          <EnvBadge />
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="login-form" @submit.prevent="submit">
          <el-form-item label="Email" prop="email">
            <el-input v-model="form.email" :prefix-icon="Message" placeholder="name@company.com" autocomplete="username" size="large" />
          </el-form-item>
          <el-form-item label="Password" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              show-password
              placeholder="Enter your password"
              autocomplete="current-password"
              size="large"
              @keydown.enter.prevent="submit"
            />
          </el-form-item>
          <div class="login-form-row">
            <el-checkbox v-model="form.remember">Remember me</el-checkbox>
            <button type="button" class="login-link" @click="forgotPassword">Forgot password?</button>
          </div>
          <el-button type="primary" size="large" class="login-submit" native-type="submit" :loading="loading">
            Sign in
          </el-button>
        </el-form>

        <div class="login-hint">Mockup: any email and password will sign you in.</div>
      </div>
    </section>
  </div>
</template>
