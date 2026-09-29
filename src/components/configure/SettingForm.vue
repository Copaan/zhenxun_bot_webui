<template>
  <main class="setup-shell">
    <section class="setup-workspace" v-loading="initializing">
      <header class="setup-header">
        <div class="brand-block">
          <img :src="logoUrl" alt="真寻" class="brand-logo" />
          <div>
            <p class="brand-kicker">ZHENXUN BOT</p>
            <h1 ref="heading" tabindex="-1">首次配置</h1>
            <p>完成本体运行所需的基础设置</p>
          </div>
        </div>
        <div class="setup-header-actions">
          <span class="state-badge">{{ stateLabel }}</span>
          <slot name="header-actions" :blocked-reason="switchBlockedReason" />
        </div>
      </header>

      <div v-if="!claimed && serverState === 'restart_pending'" class="pending-layout">
        <i class="el-icon-refresh pending-icon" />
        <span class="section-number">配置已保存</span>
        <h2>真寻正在等待重启</h2>
        <p>当前浏览器没有可用的重启票据。可手动重启进程，然后重新检查服务状态。</p>
        <el-button type="primary" @click="loadStatus()">重新检查</el-button>
      </div>

      <div v-else-if="!claimed" class="claim-layout">
        <div class="claim-copy">
          <span class="section-number">需要控制台授权</span>
          <h2>从本次启动的控制台打开连接链接</h2>
          <p>
            连接链接会自动完成安全验证并返回这里。链接仅在当前真寻进程运行期间有效，请勿分享。
          </p>
        </div>
        <div class="claim-form">
          <i class="el-icon-link access-icon" />
          <p class="inline-result" :class="{ error: accessError }">
            <i :class="accessError ? 'el-icon-circle-close' : 'el-icon-info'" />
            {{ accessError || "等待控制台连接授权。" }}
          </p>
          <el-button
            type="primary"
            class="primary-action"
            @click="loadStatus()"
          >
            重新检查状态
          </el-button>
        </div>
      </div>

      <template v-else>
        <el-steps :active="step" finish-status="success" class="desktop-steps">
          <el-step title="管理员" />
          <el-step title="数据服务" />
          <el-step title="监听地址" />
          <el-step title="检查并启动" />
        </el-steps>
        <div class="mobile-progress">
          <span>步骤 {{ step + 1 }} / 4</span>
          <strong>{{ stepTitles[step] }}</strong>
          <el-progress :percentage="(step + 1) * 25" :show-text="false" />
        </div>

        <div class="step-body">
          <section v-show="step === 0" class="step-section">
            <div class="step-intro">
              <span class="section-number">01</span>
              <h2>管理员账户</h2>
              <p>该账户仅用于登录当前 WebUI。</p>
            </div>
            <el-form ref="accountForm" :model="account" label-position="top">
              <div class="field-grid two-columns">
                <el-form-item label="用户名" required>
                  <el-input
                    v-model.trim="account.username"
                    maxlength="128"
                    autocomplete="username"
                  />
                </el-form-item>
                <el-form-item label="超级用户 ID">
                  <el-input
                    v-model="account.superusers"
                    placeholder="多个 ID 使用逗号或换行分隔"
                  />
                </el-form-item>
                <el-form-item label="管理密码" required>
                  <el-input
                    v-model="account.password"
                    type="password"
                    show-password
                    autocomplete="new-password"
                  />
                </el-form-item>
                <el-form-item label="确认密码" required>
                  <el-input
                    v-model="account.confirmPassword"
                    type="password"
                    show-password
                    autocomplete="new-password"
                  />
                </el-form-item>
              </div>
              <ul class="password-rules">
                <li v-for="rule in passwordRules" :key="rule.label" :class="{ met: rule.met }">
                  <i :class="rule.met ? 'el-icon-circle-check' : 'el-icon-remove-outline'" />
                  {{ rule.label }}
                </li>
              </ul>
            </el-form>
          </section>

          <section v-show="step === 1" class="step-section">
            <div class="step-intro">
              <span class="section-number">02</span>
              <h2>数据库与缓存</h2>
              <p>SQLite 和内存缓存适合大多数单机部署。</p>
            </div>

            <label class="field-label">数据库类型</label>
            <div class="choice-grid database-choices">
              <button
                v-for="option in databaseOptions"
                :key="option.value"
                type="button"
                class="choice-item"
                :class="{ active: database.mode === option.value }"
                @click="selectDatabaseMode(option.value)"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
                <em v-if="option.recommended">推荐</em>
              </button>
            </div>

            <el-form label-position="top" class="service-form">
              <el-form-item v-if="database.mode === 'sqlite'" label="数据库文件">
                <el-input v-model.trim="database.path" />
                <p class="field-hint">路径必须位于真寻项目目录内。</p>
              </el-form-item>
              <div v-else-if="database.mode !== 'url'" class="field-grid database-fields">
                <el-form-item label="地址">
                  <el-input v-model.trim="database.host" />
                </el-form-item>
                <el-form-item label="端口">
                  <el-input-number v-model="database.port" :min="1" :max="65535" controls-position="right" />
                </el-form-item>
                <el-form-item label="用户名">
                  <el-input v-model="database.username" autocomplete="off" />
                </el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="database.password" type="password" show-password autocomplete="new-password" />
                </el-form-item>
                <el-form-item label="数据库名" class="database-name">
                  <el-input v-model.trim="database.database" />
                </el-form-item>
              </div>
              <el-form-item v-else label="高级连接 URL">
                <el-input v-model="database.url" type="password" show-password autocomplete="off" />
                <p class="field-hint">仅在已有完整 DSN 时使用，不会显示在检查结果中。</p>
              </el-form-item>
            </el-form>
            <probe-result :result="results.database" />
            <el-button
              class="probe-button"
              :loading="probing.database"
              @click="probeDatabase"
            >
              <i class="el-icon-connection" /> 测试数据库
            </el-button>

            <div class="section-divider" />
            <label class="field-label">缓存模式</label>
            <el-radio-group v-model="cache.mode" class="segmented-control">
              <el-radio-button label="MEMORY">内存缓存</el-radio-button>
              <el-radio-button label="NONE">关闭缓存</el-radio-button>
              <el-radio-button label="REDIS">Redis</el-radio-button>
            </el-radio-group>
            <div v-if="cache.mode === 'REDIS'" class="field-grid redis-fields">
              <el-form label-position="top">
                <el-form-item label="Redis 地址"><el-input v-model.trim="cache.host" /></el-form-item>
              </el-form>
              <el-form label-position="top">
                <el-form-item label="端口"><el-input-number v-model="cache.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
              </el-form>
              <el-form label-position="top">
                <el-form-item label="密码"><el-input v-model="cache.password" type="password" show-password autocomplete="new-password" /></el-form-item>
              </el-form>
            </div>
            <probe-result :result="results.cache" />
            <el-button
              class="probe-button"
              :loading="probing.cache"
              @click="probeCache"
            >
              <i class="el-icon-connection" /> 测试缓存
            </el-button>
          </section>

          <section v-show="step === 2" class="step-section">
            <div class="step-intro">
              <span class="section-number">03</span>
              <h2>监听地址</h2>
              <p>选择哪些设备可以访问 WebUI，不影响协议端配置。</p>
            </div>
            <div class="choice-grid network-choices">
              <button
                v-for="option in networkOptions"
                :key="option.value"
                type="button"
                class="choice-item"
                :class="{ active: network.mode === option.value }"
                @click="network.mode = option.value"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
                <em v-if="option.recommended">推荐</em>
              </button>
            </div>
            <el-form label-position="top" class="network-form">
              <div class="field-grid two-columns">
                <el-form-item v-if="network.mode === 'custom'" label="自定义本机地址">
                  <el-input v-model.trim="network.host" placeholder="192.168.1.10 或 ::1" />
                </el-form-item>
                <el-form-item label="端口">
                  <el-input-number v-model="network.port" :min="1" :max="65535" controls-position="right" />
                </el-form-item>
              </div>
            </el-form>
            <div v-if="detectedAddresses.length" class="detected-addresses">
              <span>检测到的局域网地址</span>
              <code v-for="address in detectedAddresses" :key="address">{{ address }}</code>
            </div>
            <probe-result :result="results.network" />
            <el-button
              class="probe-button"
              :loading="probing.network"
              @click="probeNetwork"
            >
              <i class="el-icon-connection" /> 测试监听
            </el-button>
          </section>

          <section v-show="step === 3" class="step-section review-section">
            <div class="step-intro">
              <span class="section-number">04</span>
              <h2>检查并启动</h2>
              <p>保存时后端会再次执行全部检查，不依赖浏览器中的结果。</p>
            </div>
            <div class="checklist">
              <div v-for="item in reviewItems" :key="item.key" class="check-row">
                <i :class="reviewIcon(item.status)" />
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.message }}</span>
                </div>
                <b :class="item.status">{{ reviewStatus(item.status) }}</b>
              </div>
            </div>
            <el-checkbox v-if="hasWarnings" v-model="acceptWarnings" class="warning-confirm">
              我已了解以上警告，仍要继续
            </el-checkbox>
            <p v-if="applyError" class="inline-result error">
              <i class="el-icon-circle-close" /> {{ applyError }}
            </p>
          </section>
        </div>

        <footer class="setup-actions">
          <el-button v-if="step > 0" @click="step -= 1">上一步</el-button>
          <span />
          <el-button v-if="step < 3" type="primary" @click="nextStep">下一步</el-button>
          <button
            v-else
            type="primary"
            class="final-action"
            :disabled="serverState !== 'restart_pending' && !canApply"
            @click="saveAndRestart"
          >
            <i v-if="applying" class="el-icon-loading" />
            {{ applying ? "正在处理" : serverState === "restart_pending" ? "立即重启" : "保存配置" }}
          </button>
        </footer>
      </template>
    </section>

  </main>
</template>

<script>
import logoUrl from "@/assets/image/logo.png"
import { buildRestartTargets } from "@/utils/restart-targets"
import { confirmAndRestart } from "@/utils/restart-flow"

const SETUP_TOKEN_KEY = "zhenxunSetupToken"
const RESTART_RECEIPT_KEY = "zhenxunSetupRestartReceipt"
const RESTART_TARGETS_KEY = "zhenxunSetupRestartTargets"

const ProbeResult = {
  name: "ProbeResult",
  props: { result: { type: Object, default: null } },
  render(h) {
    if (!this.result) return h("div", { class: "probe-result idle" }, "尚未测试")
    return h(
      "div",
      { class: ["probe-result", this.result.status] },
      [
        h("i", {
          class:
            this.result.status === "error"
              ? "el-icon-circle-close"
              : this.result.status === "warning"
              ? "el-icon-warning-outline"
              : "el-icon-circle-check",
        }),
        h("span", this.result.message),
        h("b", `${this.result.latency_ms} ms`),
      ]
    )
  },
}

export default {
  name: "SettingForm",
  components: { ProbeResult },
  props: { active: { type: Boolean, default: true } },
  data() {
    return {
      logoUrl,
      initializing: true,
      serverState: "unconfigured",
      claimed: false,
      accessError: "",
      step: 0,
      stepTitles: ["管理员", "数据服务", "监听地址", "检查并启动"],
      account: { username: "admin", password: "", confirmPassword: "", superusers: "" },
      database: {
        mode: "sqlite",
        path: "data/db/zhenxun.db",
        host: "127.0.0.1",
        port: 3306,
        username: "",
        password: "",
        database: "zhenxun",
        url: "",
      },
      cache: { mode: "MEMORY", host: "127.0.0.1", port: 6379, password: "" },
      network: { mode: "lan", host: "", port: 8080 },
      detectedAddresses: [],
      results: { database: null, cache: null, network: null },
      probing: { database: false, cache: false, network: false },
      acceptWarnings: false,
      applying: false,
      applyError: "",
      restartUrls: [],
      databaseOptions: [
        { value: "sqlite", label: "SQLite", description: "无需独立服务，适合单机", recommended: true },
        { value: "mysql", label: "MySQL", description: "连接已有 MySQL 服务" },
        { value: "postgres", label: "PostgreSQL", description: "适合长期和高负载部署" },
        { value: "url", label: "连接 URL", description: "高级自定义配置" },
      ],
      networkOptions: [
        { value: "local", label: "仅本机", description: "只允许当前设备访问" },
        { value: "lan", label: "局域网", description: "同一网络设备均可访问", recommended: true },
        { value: "custom", label: "自定义", description: "绑定指定本机网卡地址" },
      ],
    }
  },
  computed: {
    switchBlockedReason() {
      if (this.applying) return "正在保存配置或确认重启，请等待完成"
      if (this.serverState === "restart_pending") return "配置已保存，请完成当前重启流程"
      if (Object.values(this.probing).some(Boolean)) return "正在检测连接，请等待完成"
      if (this.initializing) return "正在核对配置状态"
      return ""
    },
    setupToken() {
      return window.sessionStorage.getItem(SETUP_TOKEN_KEY) || ""
    },
    setupHeaders() {
      return { headers: { "X-Setup-Token": this.setupToken } }
    },
    stateLabel() {
      return {
        unconfigured: "等待配置",
        partial: "配置待修复",
        restart_pending: "等待重启",
        configured: "已配置",
      }[this.serverState]
    },
    passwordRules() {
      const password = this.account.password
      return [
        { label: "至少 8 位", met: password.length >= 8 },
        { label: "包含大写字母", met: /[A-Z]/.test(password) },
        { label: "包含小写字母", met: /[a-z]/.test(password) },
        { label: "包含数字", met: /[0-9]/.test(password) },
        { label: "两次输入一致", met: !!password && password === this.account.confirmPassword },
      ]
    },
    accountReady() {
      return !!this.account.username && this.passwordRules.every((rule) => rule.met)
    },
    reviewItems() {
      return [
        { key: "account", label: "管理员账户", status: this.accountReady ? "ok" : "error", message: this.accountReady ? "密码规则和确认均已通过" : "账户或密码规则尚未完成" },
        { key: "database", label: "数据库", status: this.results.database ? this.results.database.status : "error", message: this.results.database ? this.results.database.message : "尚未执行真实连接测试" },
        { key: "cache", label: "缓存", status: this.results.cache ? this.results.cache.status : "error", message: this.results.cache ? this.results.cache.message : "尚未执行缓存检查" },
        { key: "network", label: "监听地址", status: this.results.network ? this.results.network.status : "error", message: this.results.network ? this.results.network.message : "尚未执行监听检查" },
      ]
    },
    hasWarnings() {
      return this.reviewItems.some((item) => item.status === "warning")
    },
    canApply() {
      const noErrors = this.reviewItems.every((item) => item.status !== "error")
      return noErrors && (!this.hasWarnings || this.acceptWarnings)
    },
  },
  watch: {
    active(value) {
      if (value) this.loadStatus(false)
      else this.cancelReads()
    },
    database: { deep: true, handler() { this.results.database = null } },
    cache: { deep: true, handler() { this.results.cache = null } },
    network: { deep: true, handler() { this.results.network = null } },
  },
  created() { this.readSequence = 0; this.requestControllers = new Set() },
  mounted() { if (this.active) this.loadStatus() },
  beforeDestroy() { this.cancelReads(); for (const controller of this.requestControllers) controller.abort(); this.requestControllers.clear() },
  methods: {
    focusHeading() { this.$refs.heading?.focus() },
    cancelReads() { this.readSequence++; this.statusController?.abort(); this.initializing = false },
    async loadStatus(loadDraft = true) {
      if (!this.active) return
      const sequence = ++this.readSequence
      this.statusController?.abort()
      const controller = this.statusController = new AbortController()
      this.initializing = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/configure/status`, null, { signal: controller.signal })
        if (sequence !== this.readSequence || !this.active) return
        this.serverState = response.data.state
        if (this.serverState === "configured") {
          this.clearSetupState()
          this.$router.replace("/")
          return
        }
        if (this.serverState === "restart_pending") {
          const receipt = window.sessionStorage.getItem(RESTART_RECEIPT_KEY)
          if (this.setupToken && receipt) {
            try { this.restartUrls = JSON.parse(window.sessionStorage.getItem(RESTART_TARGETS_KEY) || "[]") } catch (error) { this.restartUrls = [] }
            this.claimed = true
            this.step = 3
          }
          return
        }
        if (this.setupToken) {
          this.claimed = true
          if (loadDraft === true) await this.loadDraft(sequence, controller.signal)
        }
      } catch (error) {
        if (sequence === this.readSequence && !controller.signal.aborted) this.accessError = "配置状态读取失败，请重新检查状态。"
      } finally {
        if (sequence === this.readSequence) this.initializing = false
      }
    },
    clearSetupState() {
      window.sessionStorage.removeItem(SETUP_TOKEN_KEY)
      window.sessionStorage.removeItem(RESTART_RECEIPT_KEY)
      window.sessionStorage.removeItem(RESTART_TARGETS_KEY)
    },
    async loadDraft(sequence, signal) {
      try {
        const response = await this.getRequest(
          `${this.$root.prefix}/configure/draft`,
          null,
          { ...this.setupHeaders, signal, suppressErrorToast: true }
        )
        if (sequence !== this.readSequence || !this.active) return
        const draft = response.data
        this.account.username = draft.username || "admin"
        Object.assign(this.database, draft.database || {})
        Object.assign(this.cache, draft.cache || {})
        Object.assign(this.network, draft.network || {})
        this.detectedAddresses = draft.detected_addresses || []
      } catch (error) {
        if (sequence !== this.readSequence || signal.aborted) return
        if (error.response && [401, 409].includes(error.response.status)) {
          this.clearSetupState()
          this.claimed = false
          this.accessError =
            "配置授权已失效，请重新打开本次启动控制台中的连接链接。"
        }
      }
    },
    nextStep() {
      if (this.step === 0 && !this.accountReady) {
        this.$message.warning("请先完成管理员账户和密码规则")
        return
      }
      if (this.step === 1 && (!this.results.database || !this.results.cache)) {
        this.$message.warning("请手动测试数据库和缓存")
        return
      }
      if (this.step === 2 && !this.results.network) {
        this.$message.warning("请先测试监听地址")
        return
      }
      this.step += 1
    },
    selectDatabaseMode(mode) {
      this.database.mode = mode
      if (mode === "mysql") this.database.port = 3306
      if (mode === "postgres") this.database.port = 5432
    },
    async runProbe(key, path, payload) {
      if (!this.active || this.probing[key]) return false
      const controller = new AbortController(); this.requestControllers.add(controller)
      this.probing[key] = true
      try {
        const response = await this.postRequest(`${this.$root.prefix}/configure/probe/${path}`, payload, { ...this.setupHeaders, signal: controller.signal })
        if (controller.signal.aborted || this._isDestroyed) return false
        this.results[key] = response.data
        return response.data.status !== "error"
      } catch (error) {
        if (!controller.signal.aborted && !this._isDestroyed) this.results[key] = { status: "error", message: "连接检测失败，请重新检测。" }
        return false
      } finally {
        this.requestControllers.delete(controller)
        if (!this._isDestroyed) this.probing[key] = false
      }
    },
    probeDatabase() {
      return this.runProbe("database", "database", { database: this.database })
    },
    probeCache() {
      return this.runProbe("cache", "cache", { cache: this.cache })
    },
    probeNetwork() {
      return this.runProbe("network", "network", { network: this.network })
    },
    normalizedSuperusers() {
      return [...new Set(this.account.superusers.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean))]
    },
    reviewIcon(status) {
      if (status === "ok") return "el-icon-circle-check ok"
      if (status === "warning") return "el-icon-warning-outline warning"
      return "el-icon-circle-close error"
    },
    reviewStatus(status) {
      return { ok: "正常", warning: "警告", error: "未通过" }[status]
    },
    async saveAndRestart() {
      if (!this.active || this.applying || !this.canApply) return
      if (this.serverState === "restart_pending") {
        const receipt = window.sessionStorage.getItem(RESTART_RECEIPT_KEY)
        if (receipt) await this.restartSavedConfiguration(receipt, false)
        return
      }
      this.applying = true
      const controller = new AbortController(); this.requestControllers.add(controller)
      this.applyError = ""
      try {
        const response = await this.postRequest(
          `${this.$root.prefix}/configure/apply`,
          {
            username: this.account.username,
            password: this.account.password,
            confirm_password: this.account.confirmPassword,
            superusers: this.normalizedSuperusers(),
            database: this.database,
            cache: this.cache,
            network: this.network,
            accept_warnings: this.acceptWarnings,
          },
          { ...this.setupHeaders, signal: controller.signal }
        )
        if (controller.signal.aborted || this._isDestroyed) return
        if (!response.suc) {
          this.applyError = response.info || "最终检查未通过。"
          if (response.data) {
            Object.assign(this.results, response.data)
          }
          return
        }
        this.serverState = "restart_pending"
        this.restartUrls = this.buildRestartUrls(response.data.access_urls || [])
        window.sessionStorage.setItem(RESTART_RECEIPT_KEY, response.data.restart_receipt)
        window.sessionStorage.setItem(RESTART_TARGETS_KEY, JSON.stringify(this.restartUrls))
        await this.restartSavedConfiguration(response.data.restart_receipt, true)
      } catch (error) {
        if (controller.signal.aborted || this._isDestroyed) return
        this.applyError = (error.response && error.response.data && error.response.data.detail) || "保存配置时发生错误。"
      } finally {
        this.requestControllers.delete(controller)
        if (!this._isDestroyed) this.applying = false
      }
    },
    async restartSavedConfiguration(receipt, askConfirmation) {
      const policy = this.network.mode === "lan" ? "network" : this.network.mode
      const options = {
        prompt: "首次配置已保存，需要重启后才能开始使用真寻。",
        request: () => this.postRequest(
          `${this.$root.prefix}/configure/restart`,
          { receipt },
          this.setupHeaders
        ),
        recovery: {
          policy,
          preferredUrl: this.restartUrls[0] || "",
          accessUrls: this.restartUrls,
          returnRoute: "/",
          message: "首次配置已保存，正在等待新进程完成启动。",
          setup: true,
        },
      }
      if (askConfirmation) return confirmAndRestart(this, options)
      return confirmAndRestart(this, {
        ...options,
        prompt: "配置已经保存，确认现在重启真寻吗？",
      })
    },
    buildRestartUrls(urls) {
      return buildRestartTargets({
        mode: this.network.mode,
        customHost: this.network.host,
        port: this.network.port,
        accessUrls: urls,
      })
    },
  },
}
</script>

<style lang="scss" scoped>
.setup-shell { display: flex; height: 100%; min-height: 0; padding: 32px 20px; overflow: hidden; background: linear-gradient(145deg, #f7f8fb 0%, #fff4f7 100%); color: #30333a; }
.setup-workspace { display: flex; width: min(960px, 100%); height: min(860px, 100%); min-height: 0; margin: auto; flex-direction: column; overflow: hidden; background: #fff; border: 1px solid #e8e9ee; border-radius: 8px; box-shadow: 0 18px 54px rgba(61, 66, 84, 0.1); }
.setup-header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid #eceef2; }
.setup-header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: 16px; }
.brand-block { display: flex; align-items: center; gap: 18px; }
.brand-logo { width: 108px; height: 52px; object-fit: contain; }
.brand-kicker { margin: 0 0 2px; color: #c74e80; font-size: 11px; font-weight: 800; }
h1, h2, p { margin: 0; }
h1 { font-family: "fzrzFont", sans-serif; font-size: 25px; letter-spacing: 0; }
.brand-block p:last-child, .step-intro p, .claim-copy p { margin-top: 5px; color: #7b7f89; line-height: 1.7; }
.state-badge { padding: 6px 10px; border: 1px solid #f0b1ca; border-radius: 4px; color: #b93d70; background: #fff4f8; font-size: 12px; }
.claim-layout { display: grid; min-height: 0; flex: 1 1 auto; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; padding: 64px 72px; overflow-y: auto; }
.pending-layout { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 48px; overflow-y: auto; text-align: center; }
.pending-layout p { max-width: 520px; margin-bottom: 8px; color: #7b7f89; line-height: 1.7; }
.pending-icon { color: #c74e80; font-size: 38px; }
.claim-copy h2, .step-intro h2 { margin-top: 8px; font-size: 23px; }
.section-number { color: #c74e80; font-size: 12px; font-weight: 800; }
.claim-form { padding-left: 36px; border-left: 1px solid #e6e8ed; }
.access-icon { display: block; margin-bottom: 20px; color: #d85f82; font-size: 34px; }
.primary-action { width: 100%; height: 44px; margin-top: 12px; }
.desktop-steps { flex: 0 0 auto; padding: 26px 48px 10px; }
.mobile-progress { display: none; }
.step-body { min-height: 0; flex: 1 1 auto; padding: 28px 56px 18px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.step-section { max-width: 780px; margin: 0 auto; }
.step-intro { margin-bottom: 28px; }
.field-grid { display: grid; gap: 0 18px; }
.two-columns { grid-template-columns: 1fr 1fr; }
.database-fields { grid-template-columns: 1.4fr 0.6fr; }
.database-name { grid-column: 1 / -1; }
.password-rules { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; padding: 0; list-style: none; color: #969aa4; font-size: 12px; }
.password-rules li.met { color: #3b9d68; }
.field-label { display: block; margin-bottom: 10px; font-weight: 700; }
.choice-grid { display: grid; gap: 10px; margin-bottom: 22px; }
.database-choices { grid-template-columns: repeat(4, 1fr); }
.network-choices { grid-template-columns: repeat(3, 1fr); }
.choice-item { position: relative; min-height: 82px; padding: 14px; border: 1px solid #dfe2e8; border-radius: 6px; color: #343740; background: #fff; text-align: left; cursor: pointer; }
.choice-item:hover, .choice-item.active { border-color: #dc6d9b; background: #fff7fa; }
.choice-item strong, .choice-item span { display: block; }
.choice-item span { margin-top: 6px; color: #858995; font-size: 12px; line-height: 1.45; }
.choice-item em { position: absolute; top: 8px; right: 8px; color: #c74e80; font-size: 10px; font-style: normal; }
.field-hint { margin-top: 5px; color: #90949e; font-size: 12px; }
.probe-button { width: 132px; margin-top: 8px; }
.probe-result { display: flex; align-items: center; gap: 8px; min-height: 34px; margin-top: 4px; color: #8a8e98; font-size: 13px; }
.probe-result b { margin-left: auto; font-size: 11px; }
.probe-result.ok { color: #318c5a; }
.probe-result.warning { color: #be7918; }
.probe-result.error { color: #c74343; }
.section-divider { height: 1px; margin: 26px 0 20px; background: #eceef2; }
.segmented-control { margin-bottom: 18px; }
.redis-fields { grid-template-columns: 1.2fr 0.7fr 1.2fr; }
.detected-addresses { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 12px; color: #747984; font-size: 12px; }
.detected-addresses code { padding: 4px 7px; border-radius: 3px; background: #eef1f5; }
.checklist { border-top: 1px solid #e8eaf0; }
.check-row { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; min-height: 72px; border-bottom: 1px solid #e8eaf0; }
.check-row > i { font-size: 20px; }
.check-row div strong, .check-row div span { display: block; }
.check-row div span { margin-top: 5px; color: #7d818b; font-size: 12px; }
.check-row b { font-size: 12px; }
.ok { color: #318c5a; }
.warning { color: #be7918; }
.error { color: #c74343; }
.warning-confirm { margin-top: 20px; }
.inline-result { margin: 10px 0; font-size: 13px; }
.setup-actions { z-index: 2; display: grid; flex: 0 0 auto; grid-template-columns: 120px 1fr 150px; gap: 12px; padding: 18px 56px 24px; border-top: 1px solid #eceef2; background: #fff; box-shadow: 0 -8px 20px rgba(61, 66, 84, 0.04); }
.setup-actions .el-button { min-height: 40px; }
.final-action { min-height: 40px; border: 1px solid #cf588a; border-radius: 4px; color: #fff; background: #cf588a; cursor: pointer; }
.final-action:disabled { border-color: #e5bdce; background: #e5bdce; cursor: not-allowed; }
::v-deep .el-button--primary { border-color: #cf588a; background: #cf588a; }
::v-deep .el-input-number { width: 100%; }

@media (max-width: 700px) {
  .setup-shell { padding: 0; background: #fff; }
  .setup-workspace { width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
  .setup-header { padding: 18px 16px; flex-wrap: wrap; gap: 12px; }
  .setup-header-actions { width: 100%; margin-left: 0; align-items: flex-start; }
  .brand-logo { width: 82px; height: 42px; }
  .brand-block p:last-child, .state-badge { display: none; }
  .claim-layout { display: block; min-height: 0; padding: 48px 22px; }
  .claim-form { margin-top: 34px; padding: 0; border: 0; }
  .desktop-steps { display: none; }
  .mobile-progress { display: block; flex: 0 0 auto; padding: 18px 18px 4px; }
  .mobile-progress span, .mobile-progress strong { display: block; margin-bottom: 7px; }
  .mobile-progress span { color: #a24a70; font-size: 11px; }
  .step-body { min-height: 0; padding: 24px 18px 16px; }
  .two-columns, .database-fields, .redis-fields, .database-choices, .network-choices { grid-template-columns: 1fr; }
  .database-name { grid-column: auto; }
  .choice-item { min-height: 70px; }
  .setup-actions { grid-template-columns: 1fr 1fr; padding: 12px 18px max(12px, env(safe-area-inset-bottom)); background: #fff; }
  .setup-actions span { display: none; }
  .setup-actions .el-button:last-child { grid-column: 2; }
}
</style>
