<template>
  <main class="zx-page proxy-page" v-loading="loading">
    <header class="zx-page-header">
      <div><h1>网络代理</h1><p>为本体和插件的外网请求配置 HTTP、HTTPS 或 SOCKS5 代理。</p></div>
      <div class="zx-page-actions">
        <el-tag v-if="dirty" type="warning" size="small">未保存修改</el-tag>
        <el-button icon="el-icon-refresh" size="small" :disabled="busy" @click="reload">重新加载</el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="saved.mode === 'legacy'" title="旧代理配置：当前继续沿用原有行为。下方草稿默认为“关闭本体代理”，请选择新的代理模式后再保存。" type="warning" :closable="false" show-icon />
    <section class="zx-panel proxy-runtime" aria-label="当前生效状态">
      <div class="zx-section-heading"><h2>当前生效状态</h2><el-tooltip content="刷新运行状态" placement="top"><el-button icon="el-icon-refresh" size="small" aria-label="刷新运行状态" :loading="statusLoading" :disabled="busy" @click="refreshStatus" /></el-tooltip></div>
      <dl><div><dt>模式</dt><dd>{{ runtime.current ? modeName(runtime.current.mode) : '未确认' }}</dd></div><div><dt>代理服务器</dt><dd>{{ runtime.current && runtime.current.url || '未配置' }}</dd></div><div><dt>活动请求引用 / 排空池</dt><dd>{{ runtime.active_requests || 0 }} / {{ runtime.retired_pools || 0 }}</dd></div></dl>
      <el-alert v-if="runtime.error_code" :title="errorText(runtime.error_code)" type="warning" :closable="false" />
    </section>
    <el-form v-if="revision" label-position="top" :disabled="busy" class="proxy-form">
      <section class="zx-panel">
        <div class="zx-section-heading"><div><h2>代理策略</h2><p>选择代理生效范围并填写代理服务器。</p></div></div>
        <el-form-item label="模式">
          <el-radio-group v-model="draft.mode" class="mode-control">
            <el-radio-button label="disabled">关闭本体代理</el-radio-button>
            <el-radio-button label="global">全局强制代理</el-radio-button>
            <el-radio-button label="selected">指定插件代理</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-alert v-if="draft.mode !== 'disabled'" title="强制范围内的受管外网请求不允许直连回退；本机基础设施通信固定直连。" type="info" :closable="false" />
        <div class="server-grid">
          <el-form-item label="代理服务器"><el-input v-model.trim="draft.url" placeholder="http://127.0.0.1:7890" autocomplete="off" /></el-form-item>
          <el-form-item label="用户名"><el-input v-model="draft.username" placeholder="可选" autocomplete="off" /></el-form-item>
          <el-form-item label="密码"><el-input v-model="draft.password" placeholder="可选" autocomplete="new-password" show-password /></el-form-item>
        </div>
        <div class="auth-status"><span>更换代理服务器后会清空原用户名和密码，需要时请重新填写</span></div>
      </section>
      <section v-if="draft.mode === 'selected'" class="zx-panel">
        <div class="zx-section-heading"><h2>插件范围</h2><el-switch v-model="draft.core_enabled" active-text="本体受管请求走代理" /></div>
        <div class="plugin-toolbar"><el-input v-model="search" clearable prefix-icon="el-icon-search" placeholder="筛选插件名称或模块" /><el-button size="small" @click="selectVisible(true)">选择筛选结果</el-button><el-button size="small" @click="selectVisible(false)">取消筛选结果</el-button><span>已选 {{ draft.plugins.length }}</span></div>
        <div class="plugin-list" role="group" aria-label="代理插件">
          <label v-for="plugin in filteredPlugins" :key="plugin.module" class="plugin-row">
            <el-checkbox :value="draft.plugins.includes(plugin.module)" :disabled="busy" @change="togglePlugin(plugin.module, $event)" />
            <span><strong>{{ plugin.name }}</strong><code>{{ plugin.module }}</code><small v-if="plugin.observation !== 'observed'">尚未观测到受管请求</small></span>
            <el-tag size="mini" :type="plugin.missing ? 'warning' : 'info'">{{ plugin.missing ? '缺失，保留选择' : plugin.loaded ? '已加载' : '未加载' }}</el-tag>
          </label>
          <p v-if="!filteredPlugins.length">没有匹配的插件</p>
        </div>
        <p class="scope-note">父插件包含子插件；新插件默认不选中。调用归属仅在受管入口可观测，不代表插件的全部网络请求。</p>
      </section>
      <section class="zx-panel"><div class="zx-section-heading"><div><h2>排除地址</h2><p>匹配的地址始终直连，不经过代理。</p></div></div><el-form-item label="主机、域名后缀或 CIDR（每行一项）"><el-input v-model="draft.bypassText" type="textarea" :rows="5" spellcheck="false" /></el-form-item></section>
    </el-form>
    <div v-if="probeResult" class="probe-result" role="status"><el-tag :type="probeResult.ok ? 'success' : 'danger'">{{ probeResult.ok ? '测试成功' : '测试失败' }}</el-tag><span>{{ errorText(probeResult.code) }} · {{ probeResult.duration_ms }} ms<span v-if="probeResult.stage"> · {{ { authentication: '认证阶段', target: '目标响应阶段', connection: '连接阶段', cleanup: '资源清理阶段' }[probeResult.stage] || '未确认阶段' }}</span></span></div>
    <footer class="proxy-actions"><span>新请求立即生效；进行中的传输继续使用原策略。</span><div><el-button icon="el-icon-position" :loading="probing" :disabled="busy || !revision || !draft.url" @click="probe">测试代理</el-button><el-button type="primary" icon="el-icon-check" :loading="saving" :disabled="busy || !revision || !dirty" @click="save">保存策略</el-button></div></footer>
  </main>
</template>

<script>
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"
import { handleApplyResult } from "@/utils/apply-result"

const newDraft = () => ({ mode: "disabled", url: "", username: "", password: "", plugins: [], core_enabled: false, bypassText: "" })
const errors = {
  proxy_revision_conflict: "配置已被其他操作修改。草稿已保留，请核对后重新加载。",
  proxy_pools_draining: "旧连接池仍在排空，请在传输结束后重试；草稿已保留。",
  proxy_address_invalid: "代理地址无效，请使用带端口的 HTTP、HTTPS 或 SOCKS5 地址。",
  proxy_address_required: "请填写代理服务器地址。",
  proxy_use_separate_auth_fields: "请将认证信息填写在独立的用户名和密码字段中。",
  proxy_username_required: "填写密码时必须提供用户名。",
  proxy_bypass_invalid: "直连例外包含无效的主机、后缀或 CIDR。",
  proxy_auth_failed: "代理认证失败。", proxy_connection_failed: "代理连接失败，未回退直连。",
  proxy_connect_failed: "连接或 TLS 校验失败，未回退直连。", proxy_timeout: "测试超过 10 秒预算。",
  proxy_target_rejected: "验证目标返回失败状态。", proxy_probe_ok: "固定 HTTPS 目标验证通过",
  proxy_resources_unreleased: "存在尚未确认释放的连接池资源。", proxy_transport_unavailable: "代理传输不可用，请检查 SOCKS 依赖。",
  proxy_origin_forbidden: "请求来源不匹配，请从当前 WebUI 入口操作。",
  proxy_probe_busy: "已有探测正在执行或等待清理，请稍后重试。",
  proxy_probe_cleanup_unresolved: "探测资源尚未确认释放，请查看运行状态。",
  proxy_cleanup_budget_exhausted: "清理预算已耗尽，资源仍由本体跟踪。",
  proxy_legacy_confirmation_required: "旧代理配置迁移需要确认，请重新保存并确认。",
  proxy_configuration_invalid: "代理配置无效，请检查各项设置。",
  proxy_configuration_unavailable: "代理配置暂不可用，请稍后重试。",
  proxy_mode_invalid: "代理模式无效。",
  proxy_plugin_invalid: "插件范围包含无效的插件模块。",
  proxy_list_invalid: "插件或排除地址列表格式无效。",
  proxy_core_flag_invalid: "“本体受管请求走代理”设置无效。",
  proxy_runtime_stopping: "真寻正在停止，暂时无法修改代理。",
  proxy_tls_verification_required: "代理请求不允许关闭 TLS 证书校验。",
  proxy_request_failed: "请求失败，请检查网络或稍后重试。",
}
export default {
  name: "NetworkProxy",
  data: () => ({ loading: false, saving: false, probing: false, statusLoading: false, statusSequence: 0, revision: "", saved: {}, runtime: {}, draft: newDraft(), baseline: "", plugins: [], search: "", error: "", probeResult: null, sequence: 0 }),
  computed: {
    busy() { return this.loading || this.saving || this.probing },
    dirty() { return Boolean(this.baseline && this.normalizeDraft(this.draft) !== this.baseline) },
    filteredPlugins() {
      const rows = new Map(this.plugins.map((item) => [item.module, item]))
      this.draft.plugins.forEach((module) => { if (!rows.has(module)) rows.set(module, { module, name: module, missing: true }) })
      const query = this.search.trim().toLowerCase()
      return [...rows.values()].filter((item) => `${item.name} ${item.module}`.toLowerCase().includes(query))
    },
  },
  watch: {
    dirty(value) { setDirtyState("network-proxy", value) },
    draft: { deep: true, handler() { this.probeResult = null } },
    "draft.url"(url) {
      if (url === (this.saved.url || "")) return
      if (this.draft.username === (this.saved.username || "") && this.draft.password === (this.saved.password || "")) {
        this.draft.username = ""
        this.draft.password = ""
      }
    },
  },
  mounted() { this.load() },
  beforeDestroy() { this.sequence++; this.statusSequence++; clearDirtyState("network-proxy") },
  methods: {
    normalizeDraft(draft) {
      return JSON.stringify({
        ...draft,
        mode: draft.mode || "disabled",
        plugins: [...(draft.plugins || [])].map(String).sort(),
        bypassText: String(draft.bypassText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).join("\n"),
      })
    },
    modeName(mode) { return { disabled: "关闭本体代理", global: "全局强制代理", selected: "指定插件代理", legacy: "旧代理配置" }[mode] || "未确认" },
    errorText(code) { return errors[code] || code || "请求失败" },
    capture(error) {
      const detail = error?.response?.data?.detail
      this.error = typeof detail === "string" ? this.errorText(detail) : this.errorText(detail?.code || (error?.response?.status === 409 ? "proxy_revision_conflict" : "proxy_request_failed"))
    },
    async refreshStatus() {
      if (this.statusLoading || this.busy) return
      const seq = ++this.statusSequence
      this.statusLoading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/network-proxy/status`, {}, { suppressErrorToast: true })
        if (seq !== this.statusSequence) return
        if (!response.suc) throw new Error()
        this.runtime = response.data
      } catch (error) { if (seq === this.statusSequence) { this.runtime = {}; this.capture(error) } }
      finally { if (seq === this.statusSequence) this.statusLoading = false }
    },
    async reload() {
      if (this.busy) return
      if (this.dirty) { try { await this.$confirm("重新加载将丢弃本页未保存修改。", "确认重新加载", { type: "warning" }) } catch (_) { return } }
      await this.load()
    },
    accept(data) {
      this.statusSequence++; this.statusLoading = false
      this.revision = data.revision
      this.saved = data.saved
      this.runtime = data.runtime || {}
      this.draft = { ...newDraft(), ...Object.fromEntries(["url", "username", "password", "plugins", "core_enabled"].map((key) => [key, data.saved[key] ?? newDraft()[key]])), mode: data.saved.mode === "legacy" ? "disabled" : data.saved.mode, bypassText: (data.saved.bypass || []).join("\n") }
      this.baseline = this.normalizeDraft(this.draft)
      this.error = data.saved.error_code ? this.errorText(data.saved.error_code) : ""
    },
    async load() {
      const seq = ++this.sequence
      this.loading = true
      try {
        const config = await this.getRequest(`${this.$root.prefix}/network-proxy/configuration`, {}, { suppressErrorToast: true })
        const plugins = await this.getRequest(`${this.$root.prefix}/network-proxy/plugins`, {}, { suppressErrorToast: true })
        if (seq !== this.sequence) return
        if (!config.suc || !plugins.suc) throw new Error()
        this.plugins = plugins.data.plugins || []
        this.accept(config.data)
      } catch (error) { if (seq === this.sequence) { this.runtime = {}; this.capture(error) } }
      finally { if (seq === this.sequence) this.loading = false }
    },
    togglePlugin(module, checked) { this.draft.plugins = checked ? [...new Set([...this.draft.plugins, module])] : this.draft.plugins.filter((item) => item !== module) },
    selectVisible(checked) { this.filteredPlugins.forEach((item) => this.togglePlugin(item.module, checked)) },
    payload() { return { ...this.draft, username: this.draft.username, password: this.draft.password, bypass: this.draft.bypassText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), expected_revision: this.revision } },
    async save() {
      if (this.busy || !this.dirty) return
      this.saving = true
      const seq = ++this.sequence
      try {
        const payload = this.payload()
        if (this.saved.mode === "legacy") { try { await this.$confirm(payload.mode === "disabled" ? "将关闭本体代理，原有代理配置不再生效。" : `将旧配置改为“${this.modeName(payload.mode)}”，仅作用于受管请求。`, "确认迁移代理策略", { type: "warning" }) } catch (_) { return } payload.confirm_legacy = true }
        const response = await this.putRequest(`${this.$root.prefix}/network-proxy/configuration`, payload, { suppressErrorToast: true })
        if (seq !== this.sequence) return
        if (!response.suc || response.data?.apply_mode === "failed") throw new Error()
        this.accept(response.data)
        await handleApplyResult(this, response)
      } catch (error) { if (seq === this.sequence) this.capture(error) }
      finally { if (seq === this.sequence) this.saving = false }
    },
    async probe() {
      if (this.busy) return
      this.probing = true; this.error = ""
      const seq = ++this.sequence
      try {
        const response = await this.postRequest(`${this.$root.prefix}/network-proxy/probe`, this.payload(), { suppressErrorToast: true })
        if (seq === this.sequence) { if (!response.suc) throw new Error(); this.probeResult = response.data }
      } catch (error) { if (seq === this.sequence) this.capture(error) }
      finally { if (seq === this.sequence) this.probing = false }
    },
  },
}
</script>

<style scoped>
.proxy-page > .el-alert { margin-bottom: 14px; }
.proxy-runtime dl { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 20px; margin: 14px 0 0; }
.proxy-runtime dt { margin-bottom: 6px; color: var(--text-color-secondary); font-size: 12px; }
.proxy-runtime dd { margin: 0; color: var(--text-color); font-weight: 500; overflow-wrap: anywhere; }
.proxy-runtime .el-alert { margin-top: 14px; }
.proxy-form .zx-section-heading { margin-bottom: 16px; }
.proxy-form .el-alert { margin-bottom: 12px; }
.server-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; margin-top: 8px; }
.server-grid .el-form-item { min-width: 0; margin-bottom: 8px; }
.auth-status, .scope-note, .probe-result { color: var(--text-color-secondary); font-size: 12px; line-height: 1.7; }
.probe-result { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
.plugin-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.plugin-toolbar .el-button + .el-button { margin-left: 0; }
.plugin-toolbar > .el-input { flex: 1; min-width: 180px; max-width: 320px; }
.plugin-toolbar > span { color: var(--text-color-secondary); font-size: 12px; }
.plugin-list { max-height: 360px; margin-top: 14px; overflow-y: auto; border: 1px solid var(--border-color-light); border-radius: 6px; }
.plugin-list > p { margin: 0; padding: 16px; color: var(--text-color-secondary); text-align: center; }
.plugin-row { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--border-color-light); cursor: pointer; }
.plugin-row:last-child { border-bottom: none; }
.plugin-row:hover { background: var(--bg-color-hover); }
.plugin-row > span:not(.el-tag) { flex: 1; min-width: 0; }
.plugin-row strong, .plugin-row code { display: block; overflow-wrap: anywhere; }
.plugin-row strong { color: var(--text-color); font-size: 14px; font-weight: 500; }
.plugin-row code { margin-top: 2px; color: var(--text-color-secondary); font-size: 12px; }
.plugin-row small { color: var(--text-color-secondary); font-size: 11px; }
.scope-note { margin: 10px 0 0; }
.proxy-form .el-form-item:last-child { margin-bottom: 0; }
.proxy-actions { position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color-secondary); }
.proxy-actions > span { color: var(--text-color-secondary); font-size: 12px; }
.proxy-actions > div { display: flex; gap: 8px; }
.proxy-actions .el-button + .el-button { margin-left: 0; }
@media (max-width: 700px) {
  .server-grid, .proxy-runtime dl { grid-template-columns: 1fr; gap: 12px; }
  .mode-control { display: flex; flex-direction: column; width: 100%; }
  .mode-control ::v-deep .el-radio-button__inner { width: 100%; border: 1px solid var(--border-color); border-radius: 0; }
  .plugin-toolbar > .el-input { flex-basis: 100%; max-width: none; }
  .plugin-row { gap: 8px; }
  .plugin-row .el-tag { max-width: 104px; height: auto; white-space: normal; }
  .proxy-actions > div { width: 100%; }
  .proxy-actions .el-button { flex: 1; }
}
</style>
