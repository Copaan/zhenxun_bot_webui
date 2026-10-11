<template>
  <section v-if="items.length" class="candidate-resources">
    <h3>临时候选库</h3>
    <p>迁移结果与临时库清理分别记录。仅清理本次任务创建、已不再使用的库。</p>
    <article v-for="item in items" :key="item.preflight_id">
      <p>{{ item.name }} · {{ state(item.state) }}{{ item.expired ? ' · 预检已过期' : '' }}</p>
      <code>{{ item.preflight_id }}</code>
      <p v-if="item.cleanup_error || item.creation_error">{{ item.cleanup_error || item.creation_error }}</p>
      <el-button size="small" :disabled="disabled || busy" @click="selected = item.preflight_id; connection = ''; error = ''">核验并清理</el-button>
    </article>
    <el-form v-if="selected" label-position="top" @submit.native.prevent="cleanup">
      <el-form-item label="目标数据库连接 URL（包含当前凭据和原 TLS 参数，仅用于本次清理）"><el-input v-model="connection" type="password" autocomplete="new-password" :disabled="busy" /></el-form-item>
      <p v-if="error" role="alert">{{ error }}</p>
      <el-button :loading="busy" :disabled="disabled || !connection" @click="cleanup">确认核验并清理临时库</el-button>
      <el-button :disabled="busy" @click="selected = ''; connection = ''">取消</el-button>
    </el-form>
  </section>
</template>

<script>
import { migrationErrorMessage, migrationRequest } from '@/utils/migration'
export default {
  props: { items: { type: Array, default: () => [] }, disabled: Boolean, request: { type: Function, default: migrationRequest } },
  data: () => ({ selected: '', connection: '', busy: false, error: '' }),
  beforeDestroy() { this.connection = ''; this.controller?.abort(); this.$emit('operation-state', '') },
  methods: {
    state(value) { return { creating: '创建结果待核验', created: '等待使用或清理', cleanup_failed: '清理待重试', dropping: '删除结果待核验', cleaned: '已清理' }[value] || value },
    async cleanup() {
      if (this.busy || this.disabled || !this.connection) return
      this.busy = true; this.error = ''; this.$emit('operation-state', '正在核验并清理临时候选库')
      const controller = this.controller = new AbortController()
      try {
        await this.request(`/preflights/${this.selected}/confirm`, { method: 'post', signal: controller.signal, data: { candidate_action: 'cleanup', private: { database: { candidate_mode: 'auto', target_url: this.connection } } } })
        if (this._isDestroyed) return
        this.connection = ''; this.selected = ''; this.$emit('refresh')
      } catch (error) { if (!this._isDestroyed) this.error = migrationErrorMessage(error, '清理尚未确认，资源记录仍保留，可重新授权后重试') }
      finally { if (!this._isDestroyed) { this.busy = false; this.$emit('operation-state', '') } }
    },
  },
}
</script>

<style scoped>
.candidate-resources { overflow-wrap: anywhere; margin: 16px 0; }
article { padding: 10px 0; border-bottom: 1px solid #ebeef5; }
code { display: block; margin-bottom: 8px; }
</style>
