<template>
  <section class="migration-bootstrap">
    <header class="bootstrap-heading">
      <div><h1 ref="heading" tabindex="-1">从迁移包恢复</h1><p>使用旧实例的 .zx 迁移包完成首次部署</p></div>
      <div class="bootstrap-actions"><slot name="header-actions" :blocked-reason="switchBlockedReason" /></div>
    </header>
    <div class="bootstrap-body">
      <template v-if="!authorized">
        <p>在目标实例本机控制台运行 <code>uv run zx migration authorize</code>，输入一次性授权码。此授权仅用于迁移，与首次配置认领相互独立。</p>
        <p role="status">{{ checking ? '正在检查迁移入口状态' : statusMessage }}</p>
        <el-input v-model="code" type="password" autocomplete="new-password" placeholder="本机控制台授权码" :disabled="busy || !ready" />
        <el-button type="primary" :loading="busy" :disabled="!ready || checking || !code.trim()" @click="authorize">授权并选择迁移包</el-button>
        <el-button :loading="checking" :disabled="busy" @click="refreshStatus">刷新状态</el-button>
      </template>
      <migration-panel v-if="panelMounted" v-show="authorized" ref="panel" first-deployment :active="active && authorized" @switch-state="panelBlockedReason = $event" @authorization-expired="authorizationExpired" />
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<script>
import { authorizeMigration, clearMigrationSession, migrationErrorMessage, migrationRequest } from "@/utils/migration"
import MigrationPanel from "./MigrationPanel.vue"
export default {
  components: { MigrationPanel },
  props: { active: { type: Boolean, default: true } },
  data: () => ({ available: false, ready: false, checking: false, statusMessage: "", authorized: false, panelMounted: false, panelBlockedReason: "", code: "", error: "", busy: false }),
  computed: {
    switchBlockedReason() { return this.busy ? "正在提交迁移授权，请等待完成" : this.authorized ? this.panelBlockedReason : "" },
  },
  watch: {
    active(value) { if (value) this.refreshStatus(); else this.stopReads() },
  },
  created() { this.statusSequence = 0; if (this.active) this.refreshStatus() },
  beforeDestroy() { this.stopReads(); this.authorizationController?.abort(); clearMigrationSession() },
  methods: {
    focusHeading() { this.$refs.heading?.focus() },
    stopReads() { this.statusSequence++; this.statusController?.abort(); this.checking = false; this.ready = false },
    authorizationExpired() {
      this.authorized = false; clearMigrationSession()
      this.error = migrationErrorMessage(new Error("migration_login_required"))
      if (this.active) this.refreshStatus()
    },
    async refreshStatus() {
      if (!this.active) return false
      const sequence = ++this.statusSequence
      this.statusController?.abort()
      const controller = this.statusController = new AbortController()
      this.checking = true; this.ready = false
      try {
        const value = await migrationRequest("/bootstrap/status", { signal: controller.signal })
        if (sequence !== this.statusSequence || this._isDestroyed || !this.active) return false
        this.available = value.available === true
        this.ready = this.available && value.ready === true
        this.statusMessage = this.ready ? "管理面已就绪，可以授权并恢复迁移包" : migrationErrorMessage(new Error(value.reason || (this.available ? "migration_bootstrap_status_unconfirmed" : "migration_first_deployment_unavailable")))
        if (!this.available) { this.authorized = false; clearMigrationSession() }
        return this.ready
      } catch (error) {
        if (sequence !== this.statusSequence || this._isDestroyed || controller.signal.aborted) return false
        this.statusMessage = migrationErrorMessage(error)
        if (!this.error) this.error = this.statusMessage
        return false
      } finally { if (sequence === this.statusSequence && !this._isDestroyed) this.checking = false }
    },
    async authorize() {
      if (!this.active || this.busy || this.checking || !this.ready || !this.code.trim()) return
      this.busy = true; this.error = ""
      const controller = this.authorizationController = new AbortController()
      try {
        if (!await this.refreshStatus() || controller.signal.aborted) return
        await authorizeMigration(this.code.trim(), { signal: controller.signal })
        if (controller.signal.aborted || this._isDestroyed) return
        this.code = ""; this.$refs.panel?.bootstrapAuthorized(); this.panelMounted = true; this.authorized = true
      } catch (error) {
        if (controller.signal.aborted || this._isDestroyed) return
        this.error = migrationErrorMessage(error)
        await this.refreshStatus()
      } finally { if (!this._isDestroyed) this.busy = false }
    },
  },
}
</script>

<style scoped>
.migration-bootstrap { max-width: 960px; margin: auto; background: #fff; border: 1px solid #e8e9ee; border-radius: 8px; box-shadow: 0 18px 54px rgba(61, 66, 84, 0.1); color: #30333a; }
.bootstrap-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 24px 32px; border-bottom: 1px solid #eceef2; }
.bootstrap-heading h1 { margin: 0; font-family: "fzrzFont", sans-serif; font-size: 25px; }
.bootstrap-heading p { margin: 5px 0 0; color: #7b7f89; }
.bootstrap-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.bootstrap-body { padding: 20px 32px 32px; }
.migration-bootstrap p { line-height: 1.7; overflow-wrap: anywhere; }
.bootstrap-body > .el-button { margin-top: 12px; }
@media (max-width: 700px) {
  .migration-bootstrap { border: 0; border-radius: 0; box-shadow: none; }
  .bootstrap-heading { flex-wrap: wrap; padding: 18px 16px; gap: 12px; }
  .bootstrap-actions { align-items: flex-start; width: 100%; }
  .bootstrap-body { padding: 16px; }
}
</style>
