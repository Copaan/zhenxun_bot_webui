<template>
  <main class="proxy-page" v-loading="loading">
    <header class="proxy-header">
      <div><h1>网络代理</h1><el-tag v-if="dirty" type="warning" size="small">未保存修改</el-tag></div>
      <el-button icon="el-icon-refresh" :disabled="busy" @click="reload">重新加载</el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="saved.mode === 'legacy'" title="旧代理配置：继续沿用原有行为。首次保存新策略需要确认，不会自动升级为强制代理。" type="warning" :closable="false" show-icon />
    <section class="proxy-runtime" aria-label="当前生效状态">
      <div class="section-heading"><h2>当前生效状态</h2><el-tooltip content="刷新运行状态" placement="top"><el-button icon="el-icon-refresh" size="small" aria-label="刷新运行状态" :loading="statusLoading" :disabled="busy" @click="refreshStatus" /></el-tooltip></div>
      <dl><div><dt>模式</dt><dd>{{ runtime.current ? modeName(runtime.current.mode) : '未确认' }}</dd></div><div><dt>代理服务器</dt><dd>{{ runtime.current && runtime.current.url || '未配置' }}</dd></div><div><dt>活动请求引用 / 排空池</dt><dd>{{ runtime.active_requests || 0 }} / {{ runtime.retired_pools || 0 }}</dd></div></dl>
      <el-alert v-if="runtime.error_code" :title="errorText(runtime.error_code)" type="warning" :closable="false" />
      <div class="route-counts"><span v-for="(value, key) in runtime.route_counts" :key="key">{{ routeName(key) }} <strong>{{ value }}</strong></span></div>
      <div class="route-counts"><span v-for="(value, key) in runtime.clients" :key="`client-${key}`">{{ key }} <strong>{{ value === 'enabled' ? '已接管' : value === 'not_installed' ? '未安装' : value }}</strong></span></div>
    </section>
    <el-form v-if="revision" label-position="top" :disabled="busy" class="proxy-form">
      <section>
        <h2>代理策略</h2>
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
          <el-form-item label="用户名"><el-input v-model="draft.username" :placeholder="saved.has_auth ? '留空沿用同服务器认证' : '可选'" autocomplete="off" :disabled="draft.clear_auth" /></el-form-item>
          <el-form-item label="密码"><el-input v-model="draft.password" type="password" show-password :placeholder="saved.has_auth ? '留空沿用同服务器密码' : '可选'" autocomplete="new-password" :disabled="draft.clear_auth" /></el-form-item>
        </div>
        <div class="auth-status"><el-tag v-if="saved.has_auth" size="small">已保存认证</el-tag><el-checkbox v-model="draft.clear_auth">清除已保存认证</el-checkbox><span>更换服务器不会携带原认证</span></div>
      </section>
      <section v-if="draft.mode === 'selected'">
        <div class="section-heading"><h2>插件范围</h2><el-switch v-model="draft.core_enabled" active-text="本体受管请求走代理" /></div>
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
      <section><h2>直连例外</h2><el-form-item label="主机、域名后缀或 CIDR（每行一项）"><el-input v-model="draft.bypassText" type="textarea" :rows="5" spellcheck="false" /></el-form-item><p class="scope-note">域名后缀使用 .example.com；普通域名不因解析到私网而自动绕过。localhost 与回环地址始终直连。</p></section>
    </el-form>
    <section class="coverage"><h2>覆盖范围</h2><p>本体 HTTP、AI、仓库下载、插件商店 Git 和受管依赖安装，以及第三方 requests、HTTPX、aiohttp 和 yt-dlp 内置 HTTP 下载。商店与安装源下载属于本体管理请求。</p><p>不接管自定义 transport / connector、外部下载器、浏览器、自行运行的 Git / pip / uv、其他子进程或原始 Socket。aiohttp 当前支持 HTTP(S) 代理，SOCKS 明确阻断。不修改系统代理环境变量，测试结果按客户端分别显示。</p></section>
    <div v-if="probeResult" class="probe-result" role="status"><el-tag :type="probeResult.ok ? 'success' : 'danger'">{{ probeResult.ok ? '测试成功' : '测试失败' }}</el-tag><span>{{ errorText(probeResult.code) }} · {{ probeResult.duration_ms }} ms<span v-if="probeResult.stage"> · {{ { authentication: '认证阶段', target: '目标响应阶段', connection: '连接阶段', cleanup: '资源清理阶段' }[probeResult.stage] || '未确认阶段' }}</span></span></div>
    <footer class="proxy-actions"><span>新请求立即生效；进行中的传输继续使用原策略。</span><div><el-button icon="el-icon-position" :loading="probing" :disabled="busy || !revision || !draft.url" @click="probe">测试代理</el-button><el-button type="primary" icon="el-icon-check" :loading="saving" :disabled="busy || !revision || !dirty" @click="save">保存策略</el-button></div></footer>
  </main>
</template>

<script>
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"
import { handleApplyResult } from "@/utils/apply-result"

const newDraft = () => ({ mode: "disabled", url: "", username: "", password: "", clear_auth: false, plugins: [], core_enabled: false, bypassText: "" })
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
}
export default {
  name: "NetworkProxy",
  data: () => ({ loading: false, saving: false, probing: false, statusLoading: false, statusSequence: 0, revision: "", saved: {}, runtime: {}, draft: newDraft(), baseline: "", plugins: [], search: "", error: "", probeResult: null, sequence: 0 }),
  computed: {
    busy() { return this.loading || this.saving || this.probing },
    dirty() { return Boolean(this.baseline && JSON.stringify(this.draft) !== this.baseline) },
    filteredPlugins() {
      const rows = new Map(this.plugins.map((item) => [item.module, item]))
      this.draft.plugins.forEach((module) => { if (!rows.has(module)) rows.set(module, { module, name: module, missing: true }) })
      const query = this.search.trim().toLowerCase()
      return [...rows.values()].filter((item) => `${item.name} ${item.module}`.toLowerCase().includes(query))
    },
  },
  watch: { dirty(value) { setDirtyState("network-proxy", value) }, draft: { deep: true, handler() { this.probeResult = null } } },
  mounted() { this.load() },
  beforeDestroy() { this.sequence++; this.statusSequence++; clearDirtyState("network-proxy") },
  methods: {
    modeName(mode) { return { disabled: "关闭本体代理", global: "全局强制代理", selected: "指定插件代理", legacy: "旧代理配置" }[mode] || "未确认" },
    routeName(route) { return { forced_proxy: "强制代理", explicit_proxy: "显式代理", legacy_proxy: "旧代理", direct: "直连", local_direct: "本地直连", proxy_error: "代理失败" }[route] || route },
    errorText(code) { return errors[code] || code || "请求失败" },
    capture(error) { this.error = this.errorText(error?.response?.data?.detail?.code || (error?.response?.status === 409 ? "proxy_revision_conflict" : "proxy_request_failed")) },
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
      this.draft = { ...newDraft(), ...Object.fromEntries(["url", "plugins", "core_enabled"].map((key) => [key, data.saved[key] ?? newDraft()[key]])), mode: data.saved.mode === "legacy" ? "disabled" : data.saved.mode, bypassText: (data.saved.bypass || []).join("\n") }
      this.baseline = JSON.stringify(this.draft)
      if (data.saved.mode === "legacy") this.baseline = JSON.stringify({ ...this.draft, mode: "legacy" })
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
    payload() { return { ...this.draft, username: this.draft.username || null, password: this.draft.password || null, bypass: this.draft.bypassText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), expected_revision: this.revision } },
    async save() {
      if (this.busy || !this.dirty) return
      this.saving = true
      const seq = ++this.sequence
      try {
        const payload = this.payload()
        if (this.saved.mode === "legacy") { try { await this.$confirm(`将旧配置改为“${this.modeName(payload.mode)}”，仅作用于受管请求。`, "确认迁移代理策略", { type: "warning" }) } catch (_) { return } payload.confirm_legacy = true }
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
.proxy-page { padding: 24px; color: #303b3d; max-width: 1400px; margin: auto; }
.proxy-header, .section-heading, .proxy-actions, .plugin-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.proxy-header > div { display: flex; align-items: center; gap: 16px; }
h1 { font-size: 24px; margin: 0; } h2 { font-size: 17px; margin: 0 0 18px; }
.proxy-page > .el-alert { margin-top: 16px; }
section { border-bottom: 1px solid #e1e7e5; padding: 24px 0; }
.proxy-runtime { background: #f2f7f5; padding: 20px; margin-top: 24px; }
dl { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 20px; margin: 0; }
dt { color: #667475; font-size: 12px; margin-bottom: 6px; } dd { margin: 0; overflow-wrap: anywhere; }
.route-counts, .auth-status, .probe-result { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
.server-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 20px; margin-top: 20px; }
.server-grid .el-form-item { margin-bottom: 8px; min-width: 0; }
.auth-status, .scope-note, .coverage p, .proxy-actions > span { color: #667475; font-size: 13px; line-height: 1.7; }
.plugin-toolbar > .el-input { max-width: 320px; flex: 1; min-width: 180px; }
.plugin-list { max-height: 360px; overflow-y: auto; margin-top: 16px; border-top: 1px solid #e1e7e5; }
.plugin-row { display: flex; align-items: center; gap: 14px; min-height: 56px; border-bottom: 1px solid #e1e7e5; padding: 10px 4px; box-sizing: border-box; }
.plugin-row > span:not(.el-tag) { flex: 1; min-width: 0; } .plugin-row strong, .plugin-row code { display: block; overflow-wrap: anywhere; }
.plugin-row code { color: #748080; font-size: 12px; margin-top: 3px; } .plugin-row strong { font-size: 14px; } .plugin-row small { color: #748080; font-size: 11px; }
.proxy-actions { padding: 24px 0; } .proxy-actions > div { display: flex; gap: 10px; } .proxy-actions .el-button + .el-button { margin-left: 0; }
@media (max-width: 700px) {
  .proxy-page { padding: 16px 12px; } .server-grid, dl { grid-template-columns: 1fr; gap: 12px; }
  .proxy-runtime { padding: 16px; } .mode-control { display: flex; flex-direction: column; width: 100%; }
  .mode-control /deep/ .el-radio-button__inner { width: 100%; border: 1px solid #dcdfe6; border-radius: 0; }
  .section-heading { align-items: flex-start; flex-direction: column; } .plugin-toolbar { justify-content: flex-start; }
  .plugin-toolbar > .el-input { max-width: none; flex-basis: 100%; } .plugin-toolbar .el-button + .el-button { margin-left: 0; }
  .plugin-row { gap: 8px; } .plugin-row .el-tag { max-width: 104px; white-space: normal; height: auto; }
  .proxy-actions > div { width: 100%; } .proxy-actions .el-button { flex: 1; }
}
</style>
