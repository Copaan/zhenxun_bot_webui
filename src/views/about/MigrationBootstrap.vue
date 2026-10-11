<template>
  <section class="migration-bootstrap">
    <header class="bootstrap-heading">
      <div><h1 ref="heading" tabindex="-1">从迁移包恢复</h1><p>使用旧实例的 .zx 迁移包完成首次部署</p></div>
      <div class="bootstrap-actions"><slot name="header-actions" :blocked-reason="switchBlockedReason" /></div>
    </header>
    <div class="bootstrap-body">
      <template v-if="!authorized">
        <p>使用当前网页连接会话恢复，不需要先填写部署向导，也不需要额外迁移码。</p>
        <p role="status">{{ checking ? '正在检查迁移入口状态' : statusMessage }}</p>
        <el-button :loading="checking || busy" :disabled="busy" @click="enter">刷新状态</el-button>
      </template>
      <migration-panel v-if="panelMounted" v-show="authorized" ref="panel" first-deployment :active="active && authorized" @switch-state="panelBlockedReason = $event" @authorization-expired="authorizationExpired" />
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<script>
import { clearMigrationSession, migrationErrorMessage, migrationRequest } from "@/utils/migration"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import MigrationPanel from "./MigrationPanel.vue"
export default {
  components: { MigrationPanel },
  props: { active: { type: Boolean, default: true } },
  data: () => ({ available: false, ready: false, checking: false, statusMessage: "", authorized: false, panelMounted: false, panelBlockedReason: "", error: "", busy: false }),
  computed: {
    switchBlockedReason() { return this.busy ? "正在检查迁移入口，请等待完成" : this.authorized ? this.panelBlockedReason : "" },
  },
  watch: {
    active(value) { if (value) this.enter(); else this.stopReads() },
  },
  created() { this.statusSequence = 0; window.addEventListener("zhenxun-auth-expired", this.authorizationExpired); if (this.active) this.enter() },
  beforeDestroy() { window.removeEventListener("zhenxun-auth-expired", this.authorizationExpired); this.stopReads(); this.authorizationController?.abort() },
  methods: {
    focusHeading() { this.$refs.heading?.focus() },
    stopReads() { this.statusSequence++; this.statusController?.abort(); this.authorizationController?.abort(); this.checking = false; this.busy = false; this.ready = false },
    authorizationExpired() {
      this.stopReads(); this.authorized = false; clearMigrationSession()
      this.error = migrationErrorMessage(new Error("migration_login_required"))
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
        if (value.session_auth_version !== 2) throw new Error("migration_session_protocol_obsolete")
        this.available = value.available === true
        this.ready = this.available && value.ready === true
        this.statusMessage = this.ready ? "管理面已就绪，正在连接迁移服务" : migrationErrorMessage(new Error(value.reason || (this.available ? "migration_bootstrap_status_unconfirmed" : "migration_first_deployment_unavailable")))
        if (!this.available) this.authorized = false
        return this.ready
      } catch (error) {
        if (sequence !== this.statusSequence || this._isDestroyed || controller.signal.aborted) return false
        this.statusMessage = migrationErrorMessage(error)
        if (!this.error) this.error = this.statusMessage
        return false
      } finally { if (sequence === this.statusSequence && !this._isDestroyed) this.checking = false }
    },
    async enter() {
      if (!this.active || this.busy) return
      this.busy = true; this.error = ""
      const controller = this.authorizationController = new AbortController()
      try {
        if (!await this.refreshStatus() || controller.signal.aborted) return
        if (this.authorized) return
        if (!getAuthToken()) throw new Error("migration_setup_authorization_required")
        if (!hasValidAuthToken()) throw new Error("migration_login_required")
        if (controller.signal.aborted || this._isDestroyed) return
        this.$refs.panel?.bootstrapAuthorized(); this.panelMounted = true; this.authorized = true
      } catch (error) {
        if (controller.signal.aborted || this._isDestroyed) return
        this.error = migrationErrorMessage(error)
      } finally { if (!this._isDestroyed && this.authorizationController === controller) this.busy = false }
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
