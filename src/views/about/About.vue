<template>
  <main class="about-page">
    <header class="about-heading">
      <div class="brand-block">
        <img :src="logoUrl" alt="真寻 Bot" />
        <div>
          <p class="eyebrow">ZHENXUN BOT</p>
          <h1>更新与维护</h1>
          <p>查看运行版本，并从官方仓库检查真寻、资源和 WebUI 更新。</p>
        </div>
      </div>
      <div class="about-actions">
        <el-button icon="el-icon-refresh" :loading="checking" @click="checkUpdates(true)">检查更新</el-button>
        <el-badge :value="restartStatus.pending_count" :hidden="!restartStatus.pending_count">
          <el-button type="warning" plain icon="el-icon-refresh-right" :loading="restarting" :disabled="!restartStatus.launcher_managed" @click="restartWorker">重启真寻</el-button>
        </el-badge>
      </div>
    </header>

    <div v-if="restartStatus.pending_restart" class="restart-notice">
      <div>
        <strong>有 {{ restartStatus.pending_count }} 项修改等待重启</strong>
        <p>{{ pendingReasonText }}</p>
        <ul v-if="restartStatus.pending_items && restartStatus.pending_items.length" class="pending-items">
          <li v-for="(item, index) in restartStatus.pending_items" :key="item.operation_id || `${item.source}-${index}`">
            <span>{{ pendingItemLabel(item) }}</span>
            <code>{{ item.store_key || item.source }}</code>
          </li>
        </ul>
      </div>
      <span>{{ restartStatus.launcher_managed ? "可在此统一重启应用" : "当前不是 launcher 托管模式，请手动重启" }}</span>
    </div>
    <div v-if="statusStale" class="inline-alert warning">重启状态暂不可确认，页面保留上次已知状态；请恢复连接后重新检查。</div>

    <section class="update-section">
      <div class="section-heading">
        <div><h2>版本更新</h2><p>{{ checkedAtLabel }}</p></div>
        <div class="update-options">
          <el-select v-model="options.channel" size="small" @change="checkUpdates(true)">
            <el-option label="开发版 main" value="main" />
            <el-option label="正式版 Release" value="release" />
          </el-select>
          <el-popover placement="bottom-end" width="300" trigger="click">
            <div class="advanced-options">
              <label>更新方式</label>
              <el-radio-group v-model="options.method" size="mini">
                <el-radio-button label="download" :disabled="options.source === 'aliyun'">下载包</el-radio-button>
                <el-radio-button label="git">Git</el-radio-button>
              </el-radio-group>
              <label>更新源</label>
              <el-radio-group v-model="options.source" size="mini" @change="changeSource">
                <el-radio-button label="github">GitHub</el-radio-button>
                <el-radio-button label="aliyun">阿里云</el-radio-button>
              </el-radio-group>
              <p v-if="options.source === 'aliyun'">阿里云源只支持 Git 方式；需要下载包时请切换到 GitHub。</p>
              <el-checkbox v-model="options.force">强制覆盖本地源码改动</el-checkbox>
              <p>强制模式仍会先创建备份，但可能覆盖未提交代码。</p>
            </div>
            <el-button slot="reference" size="small" icon="el-icon-setting">高级设置</el-button>
          </el-popover>
        </div>
      </div>

      <div v-if="updateError" class="inline-alert error">{{ updateError }}</div>
      <div class="version-grid" v-loading="checking && !updateInfo">
        <article v-for="component in componentCards" :key="component.key" class="version-card">
          <div class="version-card-title">
            <span class="component-icon" :class="component.key"><i :class="component.icon"></i></span>
            <div><h3>{{ component.name }}</h3><span>{{ component.source }}</span></div>
            <el-tag size="mini" :type="versionTagType(component)">{{ versionTagLabel(component) }}</el-tag>
          </div>
          <dl>
            <div><dt>当前版本</dt><dd :title="component.currentVersion">{{ component.currentVersion }}</dd></div>
            <div><dt>远端版本</dt><dd :title="component.latestVersion">{{ component.latestVersion }}</dd></div>
          </dl>
          <div v-if="jobFor(component.key)" class="job-progress">
            <el-progress :percentage="jobFor(component.key).progress || 0" :status="jobProgressStatus(jobFor(component.key))" />
            <span>{{ jobStateLabel(jobFor(component.key)) }}</span>
            <span>{{ jobSourceLabel(jobFor(component.key)) }}</span>
          </div>
          <div v-if="component.key === 'webui' && !component.manifestAvailable" class="compatibility-note">
            {{ officialSourceUnavailable ? "无法读取远端版本清单，暂不允许更新 WebUI。" : "远端尚无版本清单，只显示 dist 提交摘要，暂不允许更新 WebUI。" }}
          </div>
          <div v-else-if="component.key === 'webui' && !component.compatible" class="compatibility-note">
            远端 WebUI 与当前真寻 API 版本不兼容，已阻止更新。
          </div>
          <div v-else-if="component.blocked" class="compatibility-note blocked-note">
            {{ component.blockReason || "该版本存在已知兼容性问题，已禁止更新。" }}
          </div>
          <div class="version-actions">
            <span>{{ component.ref ? `来源 ${component.ref}` : "官方仓库" }}</span>
            <span v-if="isPendingUpdate(component.key)" class="pending-actions">
              <el-button size="small" :loading="cancellingJobId === jobFor(component.key).job_id" :disabled="Boolean(applyingJobId || cancellingJobId)" @click="cancelUpdate(jobFor(component.key))">取消</el-button>
              <el-button type="primary" size="small" icon="el-icon-refresh-right" :loading="applyingJobId === jobFor(component.key).job_id" :disabled="Boolean(cancellingJobId || (applyingJobId && applyingJobId !== jobFor(component.key).job_id))" @click="applyUpdate(jobFor(component.key))">
                重启后应用
              </el-button>
            </span>
            <el-button v-else type="primary" size="small" :loading="isUpdating(component.key)" :disabled="!canUpdate(component)" @click="startUpdate(component)">
              {{ updateButtonLabel(component) }}
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <BackupPanel :launcher-managed="restartStatus.launcher_managed" />


    <section class="about-content">
      <article>
        <h2>项目介绍</h2>
        <p>真寻 Bot 是面向群聊场景的 NoneBot 应用。本 WebUI 提供运行状态、协议、插件、数据和系统配置的统一管理入口。</p>
        <a href="https://github.com/zhenxun-org/zhenxun_bot" target="_blank" rel="noopener noreferrer">查看真寻仓库 <i class="el-icon-top-right"></i></a>
      </article>
      <article>
        <h2>联系与反馈</h2>
        <p>部署问题、功能建议和使用反馈可以在社区或仓库 Issue 中提交。</p>
        <div class="link-row">
          <a href="https://qm.qq.com/q/mRNtLSl6uc" target="_blank" rel="noopener noreferrer">交流社区</a>
          <a href="https://github.com/zhenxun-org/zhenxun_bot/issues" target="_blank" rel="noopener noreferrer">提交 Issue</a>
        </div>
      </article>
      <article>
        <h2>开源协议</h2>
        <p>真寻和 WebUI 遵循各自仓库声明的开源协议。部署或再分发前请阅读对应 LICENSE。</p>
        <a href="https://github.com/zhenxun-org/zhenxun_bot/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">AGPL-3.0 License <i class="el-icon-top-right"></i></a>
      </article>
    </section>
    <footer>Made with care by 真寻社区</footer>
  </main>
</template>

<script>
import logoUrl from "@/assets/image/logo.png"
import { hasDirtyState } from "@/utils/dirty-state"
import { reasonText } from "@/utils/plugin-operation"
import { requestRestartWithRecovery } from "@/utils/restart-flow"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import BackupPanel from "./BackupPanel.vue"

const COMPONENT_META = {
  bot: { name: "真寻", icon: "el-icon-cpu" },
  resource: { name: "RES 资源", icon: "el-icon-folder-opened" },
  webui: { name: "WebUI", icon: "el-icon-monitor" },
}

/**
 * 版本显示文本，读取不到的版本统一显示为“未知”
 * @param {string} value 后端返回的版本
 * @returns {string}
 */
function versionText(value) {
  return !value || value === "unknown" ? "未知" : value
}

const RESTART_REASON_LABELS = {
  plugin_change_requires_restart: "插件变更",
  plugin_restart_required: "插件变更",
  dependent_requires_restart: "依赖插件变更",
  import_time_config_consumer_requires_restart: "插件启动期配置",
  manual_dependencies_changed: "手动依赖变更",
  ai_runtime_restart_required: "AI 运行配置",
}

const ENVIRONMENT_KEY_LABELS = { DB_URL: "数据库连接", HOST: "监听地址", PORT: "监听端口", DRIVER: "驱动", EXT_PATH: "扩展插件目录" }

const FALLBACK_REASON_LABELS = {
  resource_file_locked: "资源文件被占用，热更新未完成",
  resource_render_drain_timeout: "资源仍在渲染中，热更新未完成",
}

const UPDATE_ERROR_LABELS = {
  working_tree_dirty: "本地源码有未提交的改动。如确认覆盖，请在「高级设置」中勾选「强制覆盖本地源码改动」后重试",
  health_check_failed_rolled_back: "新版本启动后健康检查未通过，已自动回滚到更新前的版本",
  health_check_failed_rollback_failed: "新版本启动后健康检查未通过，且自动回滚失败，请从 data/update/backups 中的备份手动恢复",
  update_interrupted: "更新任务被中断（进程已重启或退出），请重新发起更新",
  update_in_progress: "已有更新任务正在进行",
  pending_update_exists: "已有等待重启应用的更新，请先重启应用",
  update_not_pending: "没有等待应用的更新",
  release_not_found: "未找到对应的正式版发布",
  release_blocked: "该正式版不比当前版本新或无法比较版本号，已禁止更新",
  git_transport_failed: "连接 Git 仓库失败，请检查网络或切换更新源",
  official_git_clone_failed: "拉取官方仓库失败",
  archive_path_escape: "更新包包含非法路径，已拒绝",
  archive_root_invalid: "更新包目录结构无效",
  staged_package_incomplete: "更新包内容不完整",
  webui_manifest_invalid: "WebUI 版本清单无效",
  webui_api_incompatible: "WebUI 与当前真寻 API 版本不兼容",
  webui_assets_incomplete: "WebUI 文件不完整",
  dependency_tool_unavailable: "找不到 uv，无法同步依赖",
  dependency_sync_failed: "依赖同步失败",
  project_root_mismatch: "更新包与当前项目目录不一致",
  staged_path_invalid: "待应用的更新包路径无效",
  pending_component_invalid: "待应用的更新组件无效",
  backup_path_invalid: "更新备份路径无效",
  invalid_job_id: "更新任务编号无效",
  job_not_found: "未找到更新任务",
  job_unreadable: "更新任务记录无法读取",
  resource_install_state_invalid: "资源安装记录损坏",
  resource_git_baseline_unavailable: "无法读取资源目录的 Git 基线",
  resource_link_forbidden: "资源包包含符号链接，已拒绝",
  resource_entry_limit: "资源包文件数量超出限制",
  resource_special_file_forbidden: "资源包包含特殊文件，已拒绝",
  resource_path_conflict: "资源路径冲突",
  resource_font_missing: "资源包缺少字体文件",
  resource_theme_missing: "资源包缺少主题文件",
  resource_version_incompatible: "资源版本与当前真寻不兼容",
  resource_metadata_invalid: "资源元数据无效",
  resource_overwrite_confirmation_required: "本地资源有改动，需要确认覆盖",
  resource_target_changed: "资源文件在更新期间被修改",
  resource_candidate_changed: "待安装的资源文件在更新期间被修改",
  resource_rollback_blocked: "资源回滚被阻止",
  resource_archive_limit: "资源包大小超出限制",
  resource_archive_path_invalid: "资源包包含非法路径",
  resource_archive_root_invalid: "资源包目录结构无效",
}

/**
 * 待重启原因的显示文本，任务编号等内部标识不直接显示
 * @param {string} reason 后端返回的待重启原因
 * @returns {string}
 */
function restartReasonLabel(reason) {
  const value = String(reason || "")
  if (value.startsWith("update:")) return "版本更新"
  if (value.startsWith("environment:")) {
    const key = value.slice("environment:".length)
    return ENVIRONMENT_KEY_LABELS[key] || `环境配置 ${key}`
  }
  if (RESTART_REASON_LABELS[value]) return RESTART_REASON_LABELS[value]
  const text = reasonText(value)
  return text !== value ? text.replace(/。$/, "") : "其他待重启修改"
}

/**
 * 更新失败原因的显示文本，未收录的错误码原样显示
 * @param {string} error 后端返回的错误码，可能带“:”或“: ”分隔的详情
 * @returns {string}
 */
function updateErrorText(error) {
  if (!error) return "未知错误"
  const value = String(error)
  const index = value.indexOf(":")
  const code = index >= 0 ? value.slice(0, index) : value
  const detail = index >= 0 ? value.slice(index + 1).trim() : ""
  const label = UPDATE_ERROR_LABELS[code]
  if (!label) return value
  return detail ? `${label}（${detail}）` : label
}

export default {
  name: "AboutPage",
  components: { BackupPanel },
  data() {
    return {
      logoUrl, checking: false, updateInfo: null, updateError: "",
      options: { channel: "main", method: "git", source: "aliyun", force: false },
      jobs: {}, pollTimer: null, pollSequence: 0, restarting: false, applyingJobId: "", cancellingJobId: "", destroyed: false, statusStale: false, unsubscribeNetwork: null,
      restartStatus: { launcher_managed: false, pending_restart: false, pending_count: 0, pending_reasons: [], pending_items: [] },
    }
  },
  computed: {
    checkedAtLabel() {
      if (!this.updateInfo || !this.updateInfo.checked_at) return "尚未检查远端版本"
      return `检查时间 ${new Date(this.updateInfo.checked_at).toLocaleString()}`
    },
    componentCards() {
      const components = (this.updateInfo && this.updateInfo.components) || {}
      return ["bot", "resource", "webui"].map((key) => {
        const item = components[key] || {}
        return { key, ...COMPONENT_META[key], currentVersion: versionText(item.current_version), latestVersion: versionText(item.latest_version), comparable: item.comparable !== false, updateAvailable: Boolean(item.update_available), blocked: Boolean(item.blocked), blockReason: item.block_reason || "", manifestAvailable: item.manifest_available !== false, compatible: item.compatible !== false, ref: item.ref, source: "官方仓库" }
      })
    },
    officialSourceUnavailable() { return Boolean(this.updateInfo?.errors?.includes("official_source_unavailable")) },
    pendingReasonText() {
      const labels = [...new Set((this.restartStatus.pending_reasons || []).map(restartReasonLabel))]
      return labels.join("、") || "启动期配置已经保存"
    },
  },
  mounted() {
    const activeJobId = sessionStorage.getItem("zhenxun_update_job_id")
    if (activeJobId) this.pollJob(activeJobId, true)
    this.loadRestartStatus()
    window.addEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
    this.onVisibility = () => {
      if (document.hidden) {
        this.pollSequence += 1
        if (this.pollTimer) window.clearTimeout(this.pollTimer)
        this.pollTimer = null
      } else {
        const activeJobId = sessionStorage.getItem("zhenxun_update_job_id")
        if (activeJobId) this.pollJob(activeJobId, true)
      }
    }
    this.onAuthExpired = () => {
      this.pollSequence += 1
      if (this.pollTimer) window.clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.unsubscribeNetwork = onBusinessNetworkChange((frozen) => {
      if (frozen) this.onAuthExpired()
      else if (!document.hidden) {
        const activeJobId = sessionStorage.getItem("zhenxun_update_job_id")
        if (activeJobId) this.pollJob(activeJobId, true)
      }
    })
    document.addEventListener("visibilitychange", this.onVisibility)
    window.addEventListener("zhenxun-auth-expired", this.onAuthExpired)
    this.checkUpdates(false)
  },
  beforeDestroy() {
    this.destroyed = true
    this.pollSequence += 1
    if (this.pollTimer) window.clearTimeout(this.pollTimer)
    this.pollTimer = null
    this.unsubscribeNetwork?.()
    document.removeEventListener("visibilitychange", this.onVisibility)
    window.removeEventListener("zhenxun-auth-expired", this.onAuthExpired)
    window.removeEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
  },
  methods: {
    pendingItemLabel(item) {
      const actions = { install: "安装插件", update: "更新插件", uninstall: "卸载插件" }
      return actions[item.action] || "待应用修改"
    },
    changeSource(source) { if (source === "aliyun") this.options.method = "git" },
    async checkUpdates(refresh) {
      this.checking = true; this.updateError = ""
      try {
        const response = refresh
          ? await this.postRequest(`${this.$root.prefix}/system/update/check`, { channel: this.options.channel })
          : await this.getRequest(`${this.$root.prefix}/system/update/status`, { channel: this.options.channel })
        if (!response || !response.suc) throw new Error(response && response.info)
        this.updateInfo = response.data
        this.statusStale = false
        if (response.data.errors && response.data.errors.length) this.updateError = "官方版本服务暂时不可用，请稍后重试。"
        if (response.data.pending_job && response.data.pending_job.job_id) this.pollJob(response.data.pending_job.job_id)
      } catch (error) { this.updateError = error.response?.data?.detail || error.message || "版本信息获取失败。" }
      finally { this.checking = false }
    },
    jobFor(component) { return this.jobs[component] },
    versionTagType(component) {
      if (component.blocked) return "danger"
      if (component.updateAvailable) return "warning"
      return component.comparable ? "success" : "info"
    },
    versionTagLabel(component) {
      if (component.blocked) return "已屏蔽"
      if (component.updateAvailable) return "可更新"
      return component.comparable ? "已是最新" : "版本未知"
    },
    isPendingUpdate(component) { return this.jobFor(component)?.state === "pending_restart" },
    isUpdating(component) { const job = this.jobFor(component); return Boolean(job && !["completed", "failed", "cancelled"].includes(job.state)) },
    updateButtonLabel(component) { if (!component.updateAvailable) return "重新安装"; return component.key === "resource" ? "更新资源" : component.key === "webui" ? "更新并刷新" : "下载更新" },
    canUpdate(component) { if (component.blocked || this.isUpdating(component.key) || component.latestVersion === "未知") return false; return component.key !== "webui" || (component.manifestAvailable && component.compatible) },
    jobProgressStatus(job) { if (job.state === "failed") return "exception"; if (job.state === "completed") return "success"; return undefined },
    jobStateLabel(job) {
      const labels = { queued: "等待执行", preparing: "正在下载并校验", staged: "更新包已就绪", pending_restart: job.fallback_reason ? `${FALLBACK_REASON_LABELS[job.fallback_reason] || "资源热更新未完成"}，等待重启应用` : job.restart_available ? "已下载，等待确认重启应用" : "已下载，等待手动重启应用", restart_requested: "正在重启并应用", applying: job.component === "resource" ? "正在热更新资源" : "正在应用更新", verifying: "正在验证新版本", completed: job.apply_mode === "hot_reloaded" ? "资源已热更新" : "更新完成", cancelled: "已取消，暂存的更新文件已删除", failed: `更新失败：${updateErrorText(job.error)}` }
      return labels[job.state] || job.state
    },
    jobSourceLabel(job) {
      if (!job) return ""
      const source = job.effective_source || job.source
      const label = source === "aliyun" ? "阿里云" : "GitHub"
      return (job.attempted_sources || []).length > 1
        ? `阿里云传输失败，已回退 ${label}`
        : `实际来源：${label}`
    },
    async startUpdate(component) {
      const force = component.key === "bot" && this.options.force
      const warning = force ? "强制更新会覆盖官方管理范围内的本地源码改动。系统会先创建备份，是否继续？" : `将从官方仓库更新${component.name}，是否继续？`
      try { await this.$confirm(warning, "确认更新", { type: force ? "warning" : "info", confirmButtonText: "继续更新" }) } catch (error) { return }
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/update/jobs`, { component: component.key, channel: this.options.channel, method: this.options.method, source: this.options.source, force })
        if (!response || !response.suc) throw new Error(response && response.info)
        this.$set(this.jobs, component.key, response.data)
        sessionStorage.setItem("zhenxun_update_job_id", response.data.job_id)
        this.pollJob(response.data.job_id)
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "更新任务创建失败。") }
    },
    async loadRestartStatus() {
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/restart/status`, {}, { suppressErrorToast: true })
        if (!response?.suc) throw new Error(response?.info || "重启状态暂不可确认")
        this.restartStatus = response.data
        this.statusStale = false
      } catch (error) {
        this.statusStale = true
      }
    },
    async restartWorker() {
      if (!this.restartStatus.launcher_managed || this.restarting) return
      const warning = hasDirtyState() ? "当前页面有尚未保存的修改，重启后会丢失。是否继续？" : "重启会短暂断开所有 Bot 和 WebUI 连接，是否继续？"
      try { await this.$confirm(warning, "确认重启", { type: "warning", confirmButtonText: "确认重启" }) } catch (error) { return }
      this.restarting = true
      try { await requestRestartWithRecovery(this, { request: () => this.postRequest(`${this.$root.prefix}/system/restart`, {}), recovery: { policy: "preserve", returnRoute: "/about", message: "正在等待 launcher 启动新的真寻进程。" } }) }
      catch (error) { this.$message.error(error.response?.data?.detail || error.message || "重启请求失败。") }
      finally { this.restarting = false }
    },
    async applyUpdate(job) {
      if (!job?.job_id || this.applyingJobId) return
      this.applyingJobId = job.job_id
      try {
        await requestRestartWithRecovery(this, {
          request: () => this.postRequest(`${this.$root.prefix}/system/update/jobs/${job.job_id}/apply`, {}),
          recovery: { policy: "preserve", returnRoute: "/about", message: "正在重启并应用已校验的更新。" },
        })
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "更新应用请求失败。")
      } finally {
        if (this.applyingJobId === job.job_id) this.applyingJobId = ""
      }
    },
    /**
     * 取消等待重启应用的更新，删除暂存文件并撤销待重启标记
     * @param {object} job 更新任务
     */
    async cancelUpdate(job) {
      if (!job?.job_id || this.cancellingJobId || this.applyingJobId) return
      try { await this.$confirm("将删除已下载的更新文件，之后重启不会再应用这次更新。", "取消更新", { type: "warning", confirmButtonText: "取消更新", cancelButtonText: "保留" }) } catch (error) { return }
      this.cancellingJobId = job.job_id
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/update/jobs/${job.job_id}/cancel`, {})
        if (!response || !response.suc) throw new Error(response && response.info)
        this.pollSequence += 1
        if (this.pollTimer) window.clearTimeout(this.pollTimer)
        this.pollTimer = null
        this.$set(this.jobs, response.data.component, response.data)
        sessionStorage.removeItem("zhenxun_update_job_id")
        this.$message.success(response.info || "已取消待应用的更新。")
        window.dispatchEvent(new Event("zhenxun-restart-status-changed"))
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "取消更新失败。") }
      finally { this.cancellingJobId = "" }
    },
    pollJob(jobId, immediate = false, retryCount = 0) {
      if (this.destroyed || document.hidden || isBusinessNetworkFrozen()) return
      if (this.pollTimer) window.clearTimeout(this.pollTimer)
      const sequence = ++this.pollSequence
      this.pollTimer = window.setTimeout(async () => {
        if (this.destroyed || sequence !== this.pollSequence || document.hidden || isBusinessNetworkFrozen()) return
        try {
          const response = await this.getRequest(`${this.$root.prefix}/system/update/jobs/${jobId}`, {}, { suppressErrorToast: true })
          if (!response || !response.suc) throw new Error(response && response.info)
          const job = response.data; this.$set(this.jobs, job.component, job)
          if (!["completed", "failed", "pending_restart", "cancelled"].includes(job.state)) this.pollJob(jobId, false, 0)
          else if (job.state === "completed") { sessionStorage.removeItem("zhenxun_update_job_id"); this.$message.success(job.apply_mode === "hot_reloaded" ? "资源已热更新，无需重启。" : `${COMPONENT_META[job.component].name}更新完成。`); await this.checkUpdates(true); await this.loadRestartStatus() }
          else if (job.state === "failed") { sessionStorage.removeItem("zhenxun_update_job_id"); this.$message.error(this.jobStateLabel(job)) }
        } catch (error) {
          if (this.destroyed || sequence !== this.pollSequence || document.hidden || isBusinessNetworkFrozen()) return
          if (retryCount < 3) this.pollJob(jobId, false, retryCount + 1)
          else this.updateError = "更新任务状态暂时无法读取，请稍后点击检查更新。"
        }
      }, immediate ? 0 : 1500)
    },
  },
}
</script>

<style lang="scss" scoped>
.about-page { min-height: 100%; padding: 4px 8px 34px; color: var(--text-color); }
.about-heading, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.about-actions { display: flex; align-items: center; gap: 10px; }.restart-notice { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 14px; padding: 12px 14px; border-left: 3px solid #c59027; background: rgba(197,144,39,.09); }.restart-notice strong, .restart-notice p { margin: 0; }.restart-notice p, .restart-notice > span { margin-top: 4px; color: var(--text-color-secondary); font-size: 12px; }
.pending-items { display: grid; gap: 4px; margin: 9px 0 0; padding: 0; list-style: none; }.pending-items li { display: flex; min-width: 0; align-items: baseline; gap: 8px; font-size: 12px; }.pending-items code { overflow-wrap: anywhere; color: var(--text-color-secondary); }
.about-heading { padding-bottom: 24px; border-bottom: 1px solid var(--border-color-light); }
.brand-block { display: flex; align-items: center; gap: 22px; min-width: 0; }.brand-block img { width: 190px; height: auto; }
.eyebrow { margin: 0 0 4px; color: var(--primary-color); font-size: 12px; font-weight: 700; letter-spacing: .14em; } h1 { margin: 0; font-size: 30px; }
.brand-block p:last-child, .section-heading p { margin: 7px 0 0; color: var(--text-color-secondary); }
.update-section { padding: 26px 0 30px; border-bottom: 1px solid var(--border-color-light); }.section-heading h2, .about-content h2 { margin: 0; font-size: 20px; }
.update-options { display: flex; gap: 8px; }.update-options .el-select { width: 150px; }.advanced-options { display: flex; flex-direction: column; gap: 10px; }.advanced-options label { color: var(--text-color-secondary); font-size: 12px; }.advanced-options p { margin: 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }
.inline-alert { margin-top: 14px; padding: 10px 12px; border-radius: 6px; font-size: 13px; }.inline-alert.error { color: var(--danger-color, #e05260); background: rgba(224, 82, 96, .09); }.inline-alert.warning { color: var(--warning-color, #a87316); background: rgba(197, 144, 39, .09); }
.version-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; min-height: 190px; margin-top: 16px; }
.version-card { display: flex; min-width: 0; flex-direction: column; padding: 18px; border: 1px solid var(--border-color-light); border-radius: 7px; background: var(--bg-color-secondary); }
.version-card-title { display: flex; align-items: center; gap: 11px; min-width: 0; }.version-card-title > div { min-width: 0; flex: 1; }.version-card-title h3 { overflow: hidden; margin: 0 0 3px; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }.version-card-title span { color: var(--text-color-secondary); font-size: 12px; }
.component-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 7px; color: #fff; font-size: 18px; background: #5d77a5; }.component-icon.resource { background: #3b916f; }.component-icon.webui { background: #c0527f; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0; } dl div { min-width: 0; } dt { color: var(--text-color-secondary); font-size: 12px; } dd { overflow: hidden; margin: 5px 0 0; font-family: Consolas, monospace; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.job-progress { margin: 0 0 14px; }.job-progress > span, .compatibility-note { display: block; margin-top: 6px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }.compatibility-note { margin: 0 0 14px; color: #b7791f; }
.blocked-note { color: var(--danger-color, #e05260); }
.version-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border-color-light); }.pending-actions { display: flex; flex: none; gap: 8px; }.version-actions > span:not(.pending-actions) { overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.about-content { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 28px; padding: 30px 0; }.about-content article { min-width: 0; }.about-content p { color: var(--text-color-secondary); line-height: 1.75; }.about-content a { color: var(--primary-color); text-decoration: none; }.link-row { display: flex; flex-wrap: wrap; gap: 16px; }
footer { padding-top: 18px; border-top: 1px solid var(--border-color-light); color: var(--text-color-secondary); text-align: center; font-size: 13px; }
@media (max-width: 1050px) { .version-grid { grid-template-columns: 1fr 1fr; }.about-content { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px) { .about-page { padding-right: 2px; padding-left: 2px; }.about-heading, .section-heading, .restart-notice { align-items: stretch; flex-direction: column; }.about-actions { flex-wrap: wrap; }.brand-block { align-items: flex-start; flex-direction: column; }.brand-block img { width: 150px; }.update-options { flex-wrap: wrap; }.version-grid, .about-content { grid-template-columns: 1fr; } }
</style>
