<template>
  <main class="protocol-page" v-loading="loading">
    <header class="page-heading">
      <div><p class="eyebrow">BOT CONNECTION</p><h1>机器人接入</h1><p>扫码或手动接入 QQ 官方机器人，并管理 OneBot 连接。</p></div>
      <div class="overall-status" :class="{ online: hasAnyConnection }"><span></span>{{ hasAnyConnection ? "已有机器人在线" : "暂无机器人在线" }}</div>
    </header>

    <nav class="platform-grid" aria-label="机器人类型">
      <button v-for="platform in platforms" :key="platform.key" type="button" class="platform-card" :class="{ active: selectedPlatform === platform.key }" @click="selectedPlatform = platform.key">
        <span class="platform-icon" :class="platform.key">{{ platform.short }}</span>
        <span><strong>{{ platform.name }}</strong><small>{{ platform.description }}</small></span>
        <el-tag size="mini" :type="platform.connected ? 'success' : 'info'">{{ platform.status }}</el-tag>
      </button>
    </nav>

    <section v-if="selectedPlatform === 'onebot_v11'" class="configuration-section">
      <div class="section-heading"><div><h2>OneBot V11</h2><p>协议端使用反向 WebSocket 主动连接真寻。</p></div><el-tag type="primary" effect="plain">反向 WebSocket</el-tag></div>
      <el-form class="form-grid" label-position="top">
        <el-form-item label="反向连接主机" class="span-2"><el-input v-model="onebotHost" placeholder="留空使用当前页面主机；仅主机名或 IP" maxlength="253" /></el-form-item>
        <el-form-item label="连接地址" class="span-2"><div class="copy-field"><code>{{ onebotWebSocketUrl }}</code><el-button size="small" icon="el-icon-document-copy" :disabled="!endpoint.url || !['tls_not_enabled', 'tls_certificate_identity_ok'].includes(endpoint.code)" @click="copyText(onebotWebSocketUrl)">复制</el-button></div></el-form-item>
        <el-form-item label="Access Token" class="span-2">
          <el-input v-model="onebotToken" show-password autocomplete="new-password" :placeholder="configuration.onebot.has_access_token ? '已配置，留空表示沿用当前值' : '建议设置 Token'" />
          <div class="field-actions"><span>协议端必须填写相同 Token，保存后重启生效。</span><el-button v-if="configuration.onebot.has_access_token" type="text" class="danger-text" @click="clearOnebotToken = !clearOnebotToken">{{ clearOnebotToken ? "取消清除" : "清除现有 Token" }}</el-button></div>
          <el-alert v-if="clearOnebotToken" type="warning" :closable="false" title="保存后将移除 OneBot Access Token。" />
        </el-form-item>
      </el-form>
      <el-alert v-if="onebotEndpointWarning" :title="onebotEndpointWarning" type="warning" show-icon :closable="false" />
      <p v-if="endpoint.certificate_domains && endpoint.certificate_domains.length">证书域名：{{ endpoint.certificate_domains.join('、') }}。所选域名需要在协议端解析到本体，直接使用 WSS，不依赖 308。</p>
      <el-button type="primary" :loading="saving" :disabled="!configuration.revision" @click="saveConfiguration">保存配置</el-button>
    </section>

    <section v-else class="qq-workspace">
      <div class="qq-mode-toolbar">
        <el-radio-group v-model="qqSetupMode" size="small">
          <el-radio-button label="scan"><i class="el-icon-full-screen"></i> 扫码接入</el-radio-button>
          <el-radio-button label="manual"><i class="el-icon-edit-outline"></i> 手动接入</el-radio-button>
        </el-radio-group>
        <div class="adapter-controls">
          <span>{{ qqForm.enabled ? "QQ 官方适配器已启用" : "QQ 官方适配器已停用" }}</span>
          <el-switch v-model="qqForm.enabled" />
          <el-button size="small" type="primary" :loading="saving" :disabled="!configuration.revision" @click="saveConfiguration">保存状态</el-button>
        </div>
      </div>

      <div v-if="configuredBotRows.length" class="connected-list">
        <div class="section-heading compact"><div><h3>已配置机器人</h3><p>状态、公开身份与QQ官方公共错误诊断。</p></div><el-button size="small" icon="el-icon-refresh" :loading="statusLoading" @click="loadStatus">刷新</el-button></div>
        <div class="connection-row" v-for="bot in configuredBotRows" :key="bot.app_id">
          <el-avatar :size="34" :src="bot.avatar_url || logoUrl" icon="el-icon-user-solid" />
          <span class="connection-identity"><strong>{{ bot.username || bot.app_id }}</strong><small>{{ bot.app_id }}</small></span>
          <span>QQ_Official · {{ bot.mode === "websocket" ? "WebSocket" : "Webhook" }}</span>
          <el-tag size="mini" :type="bot.connected ? 'success' : bot.state === 'failed' ? 'danger' : bot.state === 'disabled' ? 'info' : 'warning'">{{ qqStateLabel(bot) }}</el-tag>
          <el-button type="text" class="danger-text" icon="el-icon-delete" :loading="bot.configured.removing" @click="removeConfiguredBot(bot)">删除</el-button>
          <QQDiagnostic v-if="bot.error" class="connection-error" :error="bot.error" @copy="copyText" />
        </div>
      </div>

      <div v-if="qqSetupMode === 'scan'" class="scan-panel">
        <div class="scan-icon"><i class="el-icon-full-screen"></i></div>
        <div class="scan-copy">
          <el-tag size="mini" type="success" effect="plain">推荐</el-tag>
          <h2>扫码接入 QQ 官方机器人</h2>
          <p>使用手机 QQ 扫码，选择或创建机器人。完成后真寻会保存凭据，并通过官方 WebSocket 长连接接收消息。</p>
          <ul><li>无需填写 AppID、Secret 或 Gateway 地址</li><li>凭据仅由 QQ 官方服务与当前真寻实例处理</li></ul>
        </div>
        <el-button type="primary" icon="el-icon-full-screen" :loading="registration.starting" @click="startRegistration">扫码接入</el-button>
      </div>

      <div v-else class="manual-settings">
            <div class="section-heading"><div><h2>手动接入 QQ 官方机器人</h2><p>填写开放平台凭据，并选择官方 WebSocket 长连接或 Webhook。</p></div></div>
            <el-form :model="qqForm" label-position="top">
              <div v-if="hasWebhookBots" class="form-grid">
                <el-form-item label="Webhook 模式"><el-radio-group v-model="qqForm.webhook_mode" size="small"><el-radio-button label="external">自行 HTTPS 反代</el-radio-button><el-radio-button label="builtin_https">内置 HTTPS</el-radio-button></el-radio-group></el-form-item>
                <el-form-item label="公网 HTTPS 基础地址"><el-input v-model.trim="qqForm.public_base_url" placeholder="https://bot.example.com" /><p class="field-help">不要填写 <code>/qq/webhook</code>，系统会自动拼接。</p></el-form-item>
              </div>
              <div class="bot-list-heading"><div><h3>机器人凭据</h3><p>WebSocket 会自动获取 Gateway；Token 是旧配置兼容字段，可留空。</p></div><el-button size="small" icon="el-icon-plus" @click="addBot">添加 Bot</el-button></div>
              <div class="bot-grid">
                <article v-for="(bot, index) in qqForm.bots" :key="bot.localKey" class="bot-entry">
                  <header><strong>Bot {{ index + 1 }}</strong><el-button type="text" class="danger-text" icon="el-icon-delete" :loading="bot.removing" @click="removeBot(bot, index)">移除</el-button></header>
                  <el-form-item label="连接方式"><el-radio-group v-model="bot.use_websocket" size="small"><el-radio-button :label="true">WebSocket</el-radio-button><el-radio-button :label="false">Webhook</el-radio-button></el-radio-group><p class="field-help">Gateway 由 QQ 自动下发，不需要手动填写链接。</p></el-form-item>
                  <el-form-item label="AppID"><el-input v-model.trim="bot.id" placeholder="机器人 AppID" /></el-form-item>
                  <el-form-item label="Secret"><el-input v-model="bot.secret" show-password autocomplete="new-password" :placeholder="bot.has_secret ? '已保存，留空沿用' : 'AppSecret'" /></el-form-item>
                  <el-form-item label="Token（兼容旧配置，可选）"><el-input v-model="bot.token" show-password autocomplete="new-password" :placeholder="bot.has_token ? '已保存，留空沿用' : '可留空'" /></el-form-item>
                  <div class="probe-row"><span v-if="bot.probeResult" class="probe-success"><i class="el-icon-circle-check"></i> {{ bot.probeResult }}</span><span v-else-if="bot.has_secret && !bot.secret" class="muted">已保存的凭据会在提交时重新验证</span><span v-else class="muted">验证不会保存凭据</span><el-button size="small" :loading="bot.probing" :disabled="!canProbeBot(bot)" @click="probeBot(bot)">验证凭据</el-button></div>
                  <QQDiagnostic v-if="bot.probeError" class="probe-diagnostic" :error="bot.probeError" @copy="copyText" />
                </article>
                <div v-if="!qqForm.bots.length" class="bot-empty"><i class="el-icon-connection"></i><strong>还没有机器人凭据</strong><span>可以扫码接入，或点击“添加 Bot”手动填写。</span></div>
              </div>
              <div v-if="hasWebhookBots && qqForm.webhook_mode === 'builtin_https'" class="builtin-settings">
                <div class="section-heading compact"><div><h3>内置 HTTPS</h3><p>需要通过 <code>zx run</code> 启动，并提供可信 PEM 证书。</p></div><el-tag size="mini" :type="configuration.launcher_managed ? 'success' : 'warning'">{{ configuration.launcher_managed ? "Launcher 已托管" : "需要 Launcher" }}</el-tag></div>
                <div class="form-grid"><el-form-item label="监听地址"><el-input v-model.trim="qqForm.listen_host" placeholder="0.0.0.0" /></el-form-item><el-form-item label="HTTPS 端口"><el-input-number v-model="qqForm.listen_port" :min="1" :max="65535" controls-position="right" /></el-form-item><el-form-item label="证书链文件"><el-input v-model.trim="qqForm.tls_certfile" :placeholder="qqForm.has_tls_certfile ? '已配置，留空沿用' : 'C:\\certs\\fullchain.pem'" /></el-form-item><el-form-item label="私钥文件"><el-input v-model.trim="qqForm.tls_keyfile" show-password :placeholder="qqForm.has_tls_keyfile ? '已配置，留空沿用' : 'C:\\certs\\privkey.pem'" /></el-form-item></div>
              </div>
            </el-form>
            <div v-if="hasWebhookBots" class="callback-panel" :class="{ ready: callbackReady }"><div class="callback-state"><i :class="callbackReady ? 'el-icon-circle-check' : 'el-icon-warning-outline'"></i></div><div><strong>Webhook 入口状态</strong><p>{{ callbackDescription }}</p><p>运行配置：{{ status.qq_webhook_callback_url ? '已配置' : '未配置' }} · 入口：{{ status.qq_webhook_mode === 'external' ? '外部反代未验证' : status.qq_webhook_ingress?.state === 'ready' ? '已监听' : '未确认监听' }} · 账号：{{ status.qq_bots.some(bot => bot.mode === 'webhook' && bot.connected) ? '已连接' : '未连接' }} · 公网验证：未知</p><code v-if="callbackUrl">{{ callbackUrl }}</code></div><el-button v-if="callbackUrl" size="small" icon="el-icon-document-copy" @click="copyText(callbackUrl)">复制回调地址</el-button></div>
            <div class="manual-actions"><span>配置会先保存，是否立即重启将由你确认；禁用 QQ 时会保留原有凭据。</span><el-button type="primary" :loading="saving" :disabled="!configuration.revision" @click="saveConfiguration">保存配置</el-button></div>
      </div>
    </section>

    <el-dialog title="扫码接入 QQ 官方机器人" :visible.sync="registration.visible" width="min(420px, calc(100vw - 32px))" custom-class="qq-registration-dialog" :close-on-click-modal="false" :before-close="closeRegistration">
      <div class="qr-dialog-body">
        <div v-if="registration.status === 'completed'" class="registered-bot"><el-avatar :size="72" :src="registration.bot.avatar_url || logoUrl" icon="el-icon-user-solid" /><strong>{{ registration.bot.username || registration.bot.app_id }}</strong><span>AppID：{{ registration.bot.app_id }}</span></div>
        <div v-else class="qr-frame" :class="registration.status"><img v-if="registration.qrDataUrl" :src="registration.qrDataUrl" alt="QQ 官方机器人绑定二维码" /><i v-else-if="registration.starting" class="el-icon-loading"></i><i v-else class="el-icon-warning-outline"></i></div>
        <h3>{{ registrationTitle }}</h3><p>{{ registrationDescription }}</p>
        <el-alert v-if="registration.error" type="error" :closable="false" :title="registration.error" />
        <el-button v-if="registration.qrUrl && registration.status === 'pending'" type="text" @click="openRegistrationUrl">在当前设备打开 QQ 绑定页</el-button>
      </div>
      <span slot="footer" class="dialog-footer"><el-button v-if="registration.status === 'error' || registration.status === 'expired'" @click="startRegistration">重新生成</el-button><template v-if="registration.status === 'completed'"><el-button @click="closeRegistration">稍后处理</el-button><el-button type="primary" :disabled="!registration.restartAvailable" @click="restartRegistration">立即重启</el-button></template><el-button v-else @click="closeRegistration">取消</el-button></span>
    </el-dialog>
  </main>
</template>

<script>
import QQDiagnostic from "@/components/protocol/QQDiagnostic.vue"
import { apiErrorDetail, apiErrorDiagnostic } from "@/utils/api-error"
import { handleApplyResult, notifyRestartStatusChanged } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"
import logoUrl from "@/assets/image/logo.png"
import {
  requestRestartWithRecovery,
} from "@/utils/restart-flow"

let botKey = 0
const emptyBot = () => ({ localKey: `bot-${++botKey}`, id: "", token: "", secret: "", use_websocket: true, has_token: false, has_secret: false, probing: false, removing: false, probeResult: "", probeError: null })
const emptyRegistration = () => ({ visible: false, starting: false, registrationId: "", qrDataUrl: "", qrUrl: "", status: "idle", error: "", interval: 2, expiresAt: 0, bot: {}, restartAvailable: false, accessUrls: [], accessTargets: [] })

export default {
  name: "ProtocolSetting",
  components: { QQDiagnostic },
  data() {
    return {
      selectedPlatform: "qq_official", loading: false, saving: false, statusLoading: false,
      status: { onebot_v11_connected: false, qq_official_enabled: false, qq_official_connected: false, qq_webhook_mode: "external", qq_webhook_callback_url: null, connections: [], qq_bots: [], onebot_v11_reverse_ws_path: "/onebot/v11/ws", qq_webhook_path: "/qq/webhook" },
      configuration: { revision: "", launcher_managed: false, onebot: { has_access_token: false }, qq: { bots: [] } },
      onebotToken: "", onebotHost: "", clearOnebotToken: false, qqSetupMode: "scan", logoUrl, registration: emptyRegistration(), registrationTimer: null,
      qqForm: { enabled: false, bots: [], webhook_mode: "external", public_base_url: "", listen_host: "0.0.0.0", listen_port: 443, tls_certfile: "", tls_keyfile: "", has_tls_certfile: false, has_tls_keyfile: false },
      originalProtocol: "",
    }
  },
  computed: {
    endpoint() { return this.status.onebot_endpoint?.url ? this.status.onebot_endpoint : this.configuration.onebot.endpoint || {} },
    onebotWebSocketUrl() { return this.endpoint.url || "连接地址暂不可用" },
    onebotEndpointWarning() { const messages = { tls_certificate_name_mismatch: "连接主机不在证书名称中，协议端会拒绝 TLS 连接。请设置匹配证书的域名。", tls_certificate_time_invalid: "证书尚未生效或已过期，请更换有效证书。", tls_certificate_unavailable: "无法检查证书，请核对本体证书配置。", tls_not_enabled: "当前连接未加密，Token 将明文传输。" }; return messages[this.endpoint.code] || "" },
    hasAnyConnection() { return this.status.connections.length > 0 },
    hasWebhookBots() { return this.qqForm.bots.some((bot) => !bot.use_websocket) },
    configuredBotRows() {
      return this.qqForm.bots
        .filter((bot) => bot.id)
        .map((configured) => {
          const runtime = this.status.qq_bots.find((item) => item.app_id === configured.id) || {}
          return {
            app_id: configured.id,
            mode: configured.use_websocket ? "websocket" : "webhook",
            state: this.qqForm.enabled ? runtime.state || "connecting" : "disabled",
            connected: Boolean(runtime.connected),
            username: runtime.username || "",
            avatar_url: runtime.avatar_url || "",
            error: runtime.error || null,
            configured,
          }
        })
    },
    platforms() { return [{ key: "qq_official", short: "QQ", name: "QQ 官方机器人", description: "扫码接入 · 官方 WebSocket", connected: this.status.qq_official_connected, status: this.status.qq_official_connected ? "已连接" : this.qqForm.enabled ? "等待连接" : "未接入" }, { key: "onebot_v11", short: "OB", name: "OneBot V11", description: "高级接入 · 反向 WebSocket", connected: this.status.onebot_v11_connected, status: this.status.onebot_v11_connected ? "已连接" : "未连接" }] },
    callbackUrl() { return this.status.qq_webhook_callback_url || (this.qqForm.public_base_url ? `${this.qqForm.public_base_url.replace(/\/$/, "")}/qq/webhook` : "") },
    callbackReady() { return Boolean(this.callbackUrl && this.status.qq_webhook_ingress?.state === "ready" && this.status.qq_bots.some((bot) => bot.mode === "webhook" && bot.connected)) },
    callbackDescription() { if (!this.status.qq_official_enabled) return "QQ适配器尚未启用，已保存的修改需要重启生效。"; if (!this.status.qq_webhook_callback_url) return "当前运行配置没有公网回调地址。"; if (this.status.qq_webhook_mode === "external") return "外部HTTPS反代状态尚未验证；账号在线不代表公网回调可达。"; if (this.status.qq_webhook_ingress?.state !== "ready") return "内置HTTPS入口尚未确认监听，请检查生命周期中的入口状态。"; if (!this.callbackReady) return "内置HTTPS入口已监听，Webhook账号尚未就绪。"; return "内置HTTPS入口已监听且Webhook账号在线；公网DNS、证书信任与平台回调仍需验证。" },
    registrationTitle() { return { pending: "等待扫码", completed: "机器人接入成功", expired: "二维码已过期", error: "接入未完成" }[this.registration.status] || "正在创建二维码" },
    registrationDescription() { if (this.registration.status === "completed") return this.registration.restartAvailable ? "配置已安全保存。可以立即重启，也可以稍后从顶部重启真寻。" : "配置已安全保存，请手动重启真寻后连接机器人。"; if (this.registration.status === "expired") return "请重新生成二维码后再扫描。"; if (this.registration.status === "error") return "可以重试当前操作或重新生成二维码。"; return "使用手机 QQ 扫描二维码，并按页面提示选择或创建机器人。" },
  },
  async mounted() { await Promise.all([this.loadConfiguration(), this.loadStatus()]) },
  beforeDestroy() { this.clearRegistrationTimer(); clearDirtyState("protocol-configuration") },
  watch: {
    qqForm: { deep: true, handler() { this.updateDirtyState() } },
    onebotToken() { this.updateDirtyState() },
    onebotHost() { this.updateDirtyState() },
    clearOnebotToken() { this.updateDirtyState() },
  },
  methods: {
    async loadConfiguration() {
      this.loading = true
      try { const response = await this.getRequest(`${this.$root.prefix}/protocol/configuration`, {}, { suppressErrorToast: true }); if (!response || !response.suc) throw new Error(response && response.info); this.configuration = response.data; this.onebotHost = response.data.onebot.reverse_ws_host || ""; const qq = response.data.qq; this.qqForm = { enabled: qq.enabled, bots: (qq.bots || []).map((bot) => ({ ...emptyBot(), ...bot, use_websocket: Boolean(qq.bot_modes?.[bot.id]) })), webhook_mode: qq.webhook_mode || "external", public_base_url: qq.public_base_url || "", listen_host: qq.listen_host || "0.0.0.0", listen_port: qq.listen_port || 443, tls_certfile: "", tls_keyfile: "", has_tls_certfile: qq.has_tls_certfile, has_tls_keyfile: qq.has_tls_keyfile }; this.$nextTick(() => { this.originalProtocol = this.protocolSnapshot(); clearDirtyState("protocol-configuration") }) }
      catch (error) { this.$message.error(apiErrorDetail(error, "机器人配置读取失败。")) } finally { this.loading = false }
    },
    async loadStatus() { this.statusLoading = true; try { const response = await this.getRequest(`${this.$root.prefix}/protocol/status`, {}, { suppressErrorToast: true }); if (response && response.suc) this.status = response.data } finally { this.statusLoading = false } },
    protocolSnapshot() { return JSON.stringify({ onebotHost: this.onebotHost, onebotToken: this.onebotToken, clearOnebotToken: this.clearOnebotToken, qq: { ...this.qqForm, bots: this.qqForm.bots.map(({ probing, removing, probeResult, probeError, localKey, ...bot }) => bot) } }) },
    updateDirtyState() { if (this.originalProtocol) setDirtyState("protocol-configuration", this.protocolSnapshot() !== this.originalProtocol) },
    clearRegistrationTimer() { if (this.registrationTimer) window.clearTimeout(this.registrationTimer); this.registrationTimer = null },
    async startRegistration() {
      this.clearRegistrationTimer(); if (this.registration.registrationId) await this.cancelRegistrationSession(); this.registration = { ...emptyRegistration(), visible: true, starting: true, status: "starting" }
      try { const response = await this.postRequest(`${this.$root.prefix}/protocol/qq/registration/start`, {}, { suppressErrorToast: true }); if (!response || !response.suc) throw new Error(response && response.info); const QRModule = await import(/* webpackChunkName: "qrcode" */ "qrcode"); const QRCode = QRModule.default || QRModule; const qrDataUrl = await QRCode.toDataURL(response.data.qr_url, { width: 260, margin: 1, errorCorrectionLevel: "M" }); this.registration = { visible: true, starting: false, registrationId: response.data.registration_id, qrDataUrl, qrUrl: response.data.qr_url, status: "pending", error: "", interval: response.data.interval || 2, expiresAt: Date.now() + (response.data.expires_in || 600) * 1000 }; this.scheduleRegistrationPoll(0) }
      catch (error) { this.registration.starting = false; this.registration.status = "error"; this.registration.error = apiErrorDetail(error, "二维码生成失败，请稍后重试。") }
    },
    scheduleRegistrationPoll(delay) { this.clearRegistrationTimer(); this.registrationTimer = window.setTimeout(() => this.pollRegistration(), delay == null ? this.registration.interval * 1000 : delay) },
    async pollRegistration() {
      if (!this.registration.registrationId || this.registration.status !== "pending") return
      if (Date.now() >= this.registration.expiresAt) { this.registration.status = "expired"; return }
      try { const response = await this.postRequest(`${this.$root.prefix}/protocol/qq/registration/${encodeURIComponent(this.registration.registrationId)}/poll`, {}, { suppressErrorToast: true }); if (!response || !response.suc) throw new Error(response && response.info); if (response.data.status === "expired") { this.registration.status = "expired"; return } if (response.data.status !== "completed") { this.scheduleRegistrationPoll((response.data.retry_after || this.registration.interval) * 1000); return } this.registration = { ...this.registration, status: "completed", registrationId: "", qrDataUrl: "", qrUrl: "", bot: response.data.bot || {}, restartAvailable: Boolean(response.data.restart_available), accessUrls: response.data.access_urls || [], accessTargets: response.data.access_targets || [] }; this.configuration.revision = response.data.revision; notifyRestartStatusChanged(); await this.loadConfiguration() }
      catch (error) { this.registration.status = "error"; this.registration.error = apiErrorDetail(error, "扫码状态查询失败，请重试。") }
    },
    async cancelRegistrationSession() { const id = this.registration.registrationId; this.registration.registrationId = ""; if (!id) return; try { await this.deleteRequest(`${this.$root.prefix}/protocol/qq/registration/${encodeURIComponent(id)}`, {}, { suppressErrorToast: true }) } catch (error) { /* 服务端会自动清理过期会话。 */ } },
    async closeRegistration(done) { this.clearRegistrationTimer(); await this.cancelRegistrationSession(); this.registration.visible = false; if (typeof done === "function") done() },
    openRegistrationUrl() { if (this.registration.qrUrl) window.open(this.registration.qrUrl, "_blank", "noopener,noreferrer") },
    addBot() { this.qqForm.bots.push(emptyBot()) },
    async removeBot(bot, index) {
      if (!bot.id || !bot.has_secret) { this.qqForm.bots.splice(index, 1); return }
      try { await this.$confirm("此操作只会从真寻本地配置中移除凭据，不会删除QQ开放平台中的机器人。", "移除机器人", { type: "warning", confirmButtonText: "确认移除" }) } catch (error) { return }
      bot.removing = true
      try {
        const url = `${this.$root.prefix}/protocol/qq/bots/${encodeURIComponent(bot.id)}?expected_revision=${encodeURIComponent(this.configuration.revision)}`
        const response = await this.deleteRequest(url, {}, { suppressErrorToast: true })
        if (!response || !response.suc) throw new Error(response && response.info)
        this.configuration.revision = response.data.revision
        this.qqForm.bots.splice(index, 1)
        this.qqForm.enabled = response.data.qq_enabled
        this.originalProtocol = this.protocolSnapshot(); clearDirtyState("protocol-configuration")
        await handleApplyResult(this, response, {
          restartPrompt: "机器人已移除，需要重启后停止当前连接。",
          restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
          returnRoute: "/protocol",
        })
      } catch (error) { this.$message.error(apiErrorDetail(error, "机器人移除失败。")) }
      finally { bot.removing = false }
    },
    removeConfiguredBot(row) {
      const index = this.qqForm.bots.indexOf(row.configured)
      if (index >= 0) return this.removeBot(row.configured, index)
    },
    canProbeBot(bot) { return Boolean(bot.id && (bot.secret || bot.has_secret)) },
    async probeBot(bot) { bot.probing = true; bot.probeResult = ""; bot.probeError = null; try { const response = await this.postRequest(`${this.$root.prefix}/protocol/qq/probe`, { id: bot.id, token: bot.token || null, secret: bot.secret || null }, { suppressErrorToast: true }); if (!response || !response.suc) throw new Error(response && response.info); bot.probeResult = response.data.username || response.data.bot_id || "凭据有效" } catch (error) { bot.probeError = apiErrorDiagnostic(error, "凭据验证失败。") } finally { bot.probing = false } },
    async saveConfiguration() {
      this.saving = true
      try { const response = await this.putRequest(`${this.$root.prefix}/protocol/configuration`, { expected_revision: this.configuration.revision, onebot_reverse_ws_host: this.onebotHost, onebot_access_token: this.onebotToken || null, clear_onebot_access_token: this.clearOnebotToken, qq_enabled: this.qqForm.enabled, qq_bots: this.qqForm.bots.map((bot) => ({ id: bot.id, token: bot.token || null, secret: bot.secret || null, use_websocket: bot.use_websocket })), qq_webhook_mode: this.qqForm.webhook_mode, qq_webhook_public_base_url: this.qqForm.public_base_url, qq_webhook_listen_host: this.qqForm.listen_host, qq_webhook_listen_port: this.qqForm.listen_port, qq_webhook_tls_certfile: this.qqForm.tls_certfile, qq_webhook_tls_keyfile: this.qqForm.tls_keyfile }); if (!response || !response.suc) throw new Error(response && response.info); this.configuration.revision = response.data.revision; this.originalProtocol = this.protocolSnapshot(); clearDirtyState("protocol-configuration"); await handleApplyResult(this, response, { restartPrompt: "协议配置已保存，需要重启后生效。", restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}), returnRoute: "/protocol", recoveryMessage: "协议端将在新进程中使用更新后的配置。" }) }
      catch (error) { this.$message.error(apiErrorDetail(error, "机器人配置保存失败。")) } finally { this.saving = false }
    },
    async restartRegistration() {
      if (!this.registration.restartAvailable) return
      await requestRestartWithRecovery(this, {
        request: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
        recovery: { policy: "preserve", returnRoute: "/protocol", message: "QQ 官方机器人将在新进程中建立 WebSocket 长连接。", accessUrls: this.registration.accessUrls, accessTargets: this.registration.accessTargets },
      })
      this.registration.visible = false
    },
    qqStateLabel(bot) { return bot.connected ? "在线" : { disabled: "已停用", authorizing: "鉴权中", gateway: "获取Gateway", connecting: "连接中", reconnecting: "重连中", failed: "连接失败" }[bot.state] || "等待连接" },
    async copyText(value) { try { await navigator.clipboard.writeText(value) } catch (error) { const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove() } this.$message.success("已复制") },
  },
}
</script>

<style lang="scss" scoped>
.protocol-page { height: 100%; overflow-y: auto; padding: 4px 6px 84px; color: var(--text-color); }.page-heading, .section-heading, .bot-list-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }.page-heading { margin-bottom: 22px; }.page-heading h1 { margin: 4px 0 7px; font-size: 30px; }.page-heading p, .section-heading p, .bot-list-heading p { margin: 0; color: var(--text-color-secondary); line-height: 1.6; }.eyebrow { color: var(--primary-color) !important; font-size: 12px; font-weight: 700; letter-spacing: .14em; }
.overall-status { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--border-color-light); border-radius: 20px; color: var(--text-color-secondary); }.overall-status span { width: 8px; height: 8px; border-radius: 50%; background: var(--text-color-placeholder); }.overall-status.online { color: var(--success-color); }.overall-status.online span { background: var(--success-color); }
.platform-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }.platform-card { display: flex; align-items: center; gap: 12px; min-height: 76px; padding: 13px 15px; border: 1px solid var(--border-color-light); border-radius: 7px; color: var(--text-color); background: var(--bg-color-secondary); cursor: pointer; text-align: left; }.platform-card.active { border-color: var(--primary-color); box-shadow: 0 3px 12px rgba(255,107,149,.1); }.platform-card > span:nth-child(2) { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }.platform-card small { color: var(--text-color-secondary); }.platform-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 7px; color: #fff; font-weight: 700; background: #7564dd; }.platform-icon.qq_official { background: #0891b2; }
.configuration-section, .scan-panel, .connected-list, .manual-settings { padding: 22px; border: 1px solid var(--border-color-light); border-radius: 7px; background: var(--bg-color-secondary); }.scan-panel { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 20px; }.scan-icon { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 7px; color: #087f96; background: rgba(8,145,178,.1); font-size: 28px; }.scan-copy h2 { margin: 8px 0 6px; }.scan-copy p { margin: 0; color: var(--text-color-secondary); line-height: 1.6; }.scan-copy ul { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 10px 0 0; padding-left: 18px; color: var(--text-color-secondary); font-size: 12px; }
.connected-list { margin-top: 14px; }.connection-row { display: grid; grid-template-columns: auto minmax(140px, auto) 1fr auto auto; align-items: center; gap: 10px; padding: 13px 0; border-top: 1px solid var(--border-color-light); }.connection-identity { display: flex; min-width: 0; flex-direction: column; gap: 2px; }.connection-identity small, .connection-row > span:nth-child(3) { color: var(--text-color-secondary); }.connection-error { grid-column: 2 / -1; width: 100%; }
.qq-mode-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; padding: 12px 14px; border: 1px solid var(--border-color-light); border-radius: 7px; background: var(--bg-color-secondary); }.adapter-controls { display: flex; align-items: center; gap: 10px; color: var(--text-color-secondary); font-size: 13px; }
.advanced-settings { margin-top: 14px; border: 0; }.advanced-title { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }.advanced-settings ::v-deep .el-collapse-item__header { padding: 0 14px; border: 1px solid var(--border-color-light); color: var(--text-color); background: var(--bg-color-secondary); }.advanced-settings ::v-deep .el-collapse-item__wrap { border: 0; background: transparent; }.advanced-settings ::v-deep .el-collapse-item__content { padding: 12px 0 0; }
.section-heading { padding-bottom: 18px; border-bottom: 1px solid var(--border-color-light); }.section-heading h2, .bot-list-heading h3, .section-heading h3 { margin: 0 0 5px; }.section-heading.compact { padding-bottom: 12px; }.switch-line { display: flex; align-items: center; gap: 10px; }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; padding-top: 18px; }.span-2 { grid-column: span 2; }.copy-field { display: flex; gap: 8px; padding: 8px 8px 8px 12px; border: 1px solid var(--border-color-light); border-radius: 5px; background: var(--bg-color); }.copy-field code { min-width: 0; flex: 1; overflow-wrap: anywhere; }.field-actions, .probe-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; color: var(--text-color-secondary); font-size: 12px; }.danger-text { color: var(--danger-color, #e05260) !important; }.field-help { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 12px; }
.bot-list-heading { align-items: center; margin-top: 16px; padding: 18px 0 12px; }.bot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.bot-entry { min-width: 0; padding: 16px; border: 1px solid var(--border-color-light); border-radius: 7px; background: var(--bg-color); }.bot-entry header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }.bot-empty { display: flex; grid-column: 1 / -1; min-height: 150px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; border: 1px dashed var(--border-color-light); border-radius: 7px; color: var(--text-color-secondary); }.bot-empty i { color: var(--primary-color); font-size: 30px; }.bot-empty strong { color: var(--text-color); }.probe-success { color: var(--success-color); }.probe-diagnostic { margin-top: 10px; }.muted { color: var(--text-color-secondary); }.builtin-settings { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-color-light); }.callback-panel { display: flex; align-items: center; gap: 14px; margin-top: 20px; padding: 16px; border: 1px solid rgba(214,158,46,.4); border-radius: 7px; background: rgba(214,158,46,.06); }.callback-panel.ready { border-color: rgba(56,161,105,.4); background: rgba(56,161,105,.06); }.callback-state { font-size: 27px; color: #c59027; }.callback-panel.ready .callback-state { color: var(--success-color); }.callback-panel > div:nth-child(2) { min-width: 0; flex: 1; }.callback-panel p { margin: 4px 0; color: var(--text-color-secondary); }.callback-panel code { overflow-wrap: anywhere; color: var(--text-color); }
.manual-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-color-light); }.manual-actions span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.qr-dialog-body { display: flex; align-items: center; flex-direction: column; text-align: center; }.qr-frame { display: grid; width: 282px; height: 282px; place-items: center; border: 1px solid var(--border-color-light); border-radius: 7px; background: #fff; }.qr-frame img { display: block; width: 260px; height: 260px; }.qr-frame > i { color: #8a9099; font-size: 38px; }.registered-bot { display: flex; align-items: center; flex-direction: column; gap: 7px; padding: 12px 0 4px; }.registered-bot span { color: var(--text-color-secondary); font-size: 12px; }.qr-dialog-body h3 { margin: 18px 0 7px; }.qr-dialog-body p { margin: 0 0 10px; color: var(--text-color-secondary); line-height: 1.6; }.qr-dialog-body .el-alert { margin-top: 8px; text-align: left; }
@media (max-width: 900px) { .platform-grid, .form-grid, .bot-grid { grid-template-columns: 1fr; }.span-2 { grid-column: span 1; }.scan-panel { grid-template-columns: auto 1fr; }.scan-panel > .el-button { grid-column: 2; justify-self: start; }.callback-panel { align-items: flex-start; flex-direction: column; } }
@media (max-width: 640px) { .page-heading, .section-heading, .bot-list-heading, .qq-mode-toolbar, .adapter-controls { align-items: stretch; flex-direction: column; }.configuration-section, .scan-panel, .connected-list, .manual-settings { padding: 16px; }.scan-panel { display: flex; align-items: stretch; flex-direction: column; }.scan-icon { width: 48px; height: 48px; }.scan-copy ul { display: block; }.connection-row { grid-template-columns: auto 1fr auto; }.connection-row > span:nth-child(3) { display: none; }.connection-row > .danger-text { grid-column: 3; grid-row: 1; }.connection-error { grid-column: 1 / -1; }.manual-actions { align-items: stretch; flex-direction: column; }.manual-actions span { margin: 0; }.field-actions, .probe-row { align-items: flex-start; flex-direction: column; }.qr-frame { width: min(282px, 78vw); height: min(282px, 78vw); }.qr-frame img { width: min(260px, 72vw); height: min(260px, 72vw); } }
</style>
