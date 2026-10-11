<template>
  <el-dialog
    :visible="operation.visible"
    :show-close="!operation.active"
    :close-on-click-modal="false"
    :close-on-press-escape="!operation.active"
    :before-close="close"
    width="min(420px, 94vw)"
    custom-class="plugin-operation-dialog"
  >
    <div class="operation-content" :class="`is-${operation.status}`">
      <i :class="iconClass"></i>
      <div>
        <h3>{{ operation.title }}</h3>
        <p>{{ operation.message }}</p>
        <strong v-if="operation.pluginName">{{ operation.pluginName }}</strong>
      </div>
    </div>
    <span v-if="!operation.active" slot="footer">
      <template v-if="operation.applyMode === 'restart_pending'">
        <el-button @click="close">稍后处理</el-button>
        <el-button v-if="operation.restartAvailable" type="primary" :loading="restarting" @click="restart">立即重启</el-button>
      </template>
      <el-button v-else type="primary" @click="close">完成</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { requestRestartWithRecovery } from "@/utils/restart-flow"

export default {
  name: "PluginOperationDialog",
  data() { return { restarting: false } },
  computed: {
    operation() {
      return this.$store.state.pluginOperation
    },
    iconClass() {
      if (this.operation.active) return "el-icon-loading"
      return this.operation.status === "success"
        ? "el-icon-circle-check"
        : "el-icon-warning-outline"
    },
  },
  methods: {
    async restart() {
      if (this.restarting) return
      this.restarting = true
      try {
        const started = await requestRestartWithRecovery(this, {
          request: () => this.postRequest(`${this.$root.prefix}/system/restart/apply-pending`, {}),
          recovery: {
            policy: "preserve",
            returnRoute: this.$route.fullPath,
            message: "插件变更将在新进程中生效。",
            accessUrls: this.operation.accessUrls,
            accessTargets: this.operation.accessTargets,
          },
        })
        if (started) this.close()
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "重启请求失败。")
      } finally {
        this.restarting = false
      }
    },
    close(done) {
      if (this.operation.active) return
      if (!['restart_pending', 'restart_requested', 'preparing', 'verifying', 'unknown', 'recovery_required'].includes(this.operation.applyMode)) sessionStorage.removeItem("zhenxun_plugin_operation")
      this.$store.commit("CLEAR_PLUGIN_OPERATION")
      if (typeof done === "function") done()
    },
  },
}
</script>

<style scoped>
.operation-content { display: flex; align-items: flex-start; gap: 16px; color: var(--text-color); }
.operation-content > i { margin-top: 2px; color: var(--primary-color); font-size: 34px; }
.operation-content.is-success > i { color: var(--success-color); }
.operation-content.is-error > i { color: var(--danger-color); }
h3 { margin: 0 0 7px; font-size: 18px; }
p { margin: 0 0 8px; color: var(--text-color-secondary); line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
strong { overflow-wrap: anywhere; }
</style>
