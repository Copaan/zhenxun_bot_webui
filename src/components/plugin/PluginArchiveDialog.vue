<template>
  <el-dialog
    title="外部安装插件"
    :visible="visible"
    width="720px"
    custom-class="plugin-archive-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    :before-close="close"
    append-to-body
  >
    <div class="archive-content" v-loading="busy && progress === null">
      <el-alert
        title="静态预检通过不代表代码安全"
        description="插件将拥有机器人进程的文件、网络及凭据访问权限。请只安装来源可信且已经审查的代码。"
        type="warning"
        :closable="false"
        show-icon
      />
      <div class="archive-upload">
        <input
          ref="fileInput"
          type="file"
          accept=".zip,.tar.gz"
          aria-label="插件压缩包"
          :disabled="busy || Boolean(preflight)"
          @change="selectFile"
        />
        <el-button :disabled="busy || !file || Boolean(preflight)" icon="el-icon-search" @click="inspect">
          预检
        </el-button>
      </div>
      <el-progress v-if="progress !== null" :percentage="progress" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />

      <section v-if="preflight" class="archive-review">
        <h3>{{ preflight.module }}</h3>
        <dl>
          <dt>安装目标</dt><dd>{{ preflight.target }}</dd>
          <dt>入口类型</dt><dd>{{ preflight.package ? "Python 包（__init__.py）" : "Python 模块" }}</dd>
          <dt>版本（静态声明）</dt><dd>{{ preflight.metadata.version || "未声明" }}</dd>
          <dt>压缩包 SHA-256</dt><dd class="archive-digest">{{ preflight.archive_digest }}</dd>
          <dt>归档内容</dt><dd>{{ preflight.entries }} 项 / {{ mib(preflight.expanded_bytes) }} MiB</dd>
          <dt>预检有效期</dt><dd>{{ new Date(preflight.expires_at * 1000).toLocaleString() }}</dd>
          <dt>依赖安装策略</dt><dd>{{ preflight.dependency_plan.source_build_confirmed ? "已授权可信安装源的依赖构建" : "优先 wheel；源码依赖需要单独确认" }}</dd>
          <dt>Python 版本要求</dt><dd>{{ (preflight.metadata.requires_python || []).join(", ") || "未声明" }}</dd>
        </dl>
        <ul v-if="dependencies.length" class="archive-dependencies">
          <li v-for="item in dependencies" :key="item.name">
            {{ item.name }}: {{ item.from ? `${item.from} -> ` : "" }}{{ item.to || item.version }}
          </li>
        </ul>
        <p v-else-if="preflight.dependency_plan.status !== 'blocked'">无需变更依赖版本。</p>
        <el-alert v-if="preflight.dependency_plan.diagnostic" type="warning" :closable="false"
          :title="dependencyError(preflight.dependency_plan.diagnostic)"
          :description="preflight.dependency_plan.diagnostic.detail" />
        <div v-if="preflight.dependency_plan.status === 'blocked' && preflight.dependency_plan.diagnostic.source_build_available" class="archive-actions">
          <el-checkbox v-model="sourceBuildTrusted" :disabled="busy">允许可信安装源的依赖执行源码构建；不执行上传包的安装脚本</el-checkbox>
          <el-button :disabled="busy || expired || !sourceBuildTrusted" @click="resolveDependencies">确认并继续依赖预检</el-button>
        </div>
        <el-button v-if="preflight.dependency_plan.status === 'blocked'" :disabled="busy || expired" @click="resolveDependencies(false)">重试 wheel 依赖预检</el-button>
        <template v-if="!result">
          <el-checkbox v-if="preflight.replace_required" v-model="replace" :disabled="busy">
            确认替换上述目标路径中的现有插件
          </el-checkbox>
          <el-checkbox v-model="trusted" :disabled="busy">
            我信任此第三方代码，并接受它对机器人运行环境的访问权限
          </el-checkbox>
          <p v-if="expired" role="status">预检已过期，请丢弃后重新上传。</p>
          <div class="archive-actions">
            <el-button :disabled="busy" icon="el-icon-delete" @click="discard">丢弃上传</el-button>
            <el-button type="primary" icon="el-icon-download" :disabled="!canConfirm" @click="confirm">
              确认安装（重启生效）
            </el-button>
          </div>
        </template>
      </section>

      <el-alert
        v-if="result"
        :title="result.restart_required ? '已暂存，等待重启' : '已复用原操作结果'"
        :description="result.restart_required ? '变更尚未生效，需重启并完成启动验证。丢弃上传不会撤销已提交的安装事务。' : '此次请求未重复安装，也未发起新的重启请求。'"
        type="info"
        :closable="false"
        show-icon
      />

      <section class="archive-installed">
        <div class="archive-heading">
          <h3>外部安装记录</h3>
          <el-button icon="el-icon-refresh" circle size="small" title="刷新安装记录" aria-label="刷新安装记录" :disabled="busy" @click="refresh" />
        </div>
        <p v-if="!installed.length">暂无已生效的外部安装记录。</p>
        <ul v-else class="archive-receipts">
          <li v-for="item in installed" :key="item.store_key">
            <div class="archive-receipt-name">
              <strong>{{ item.module }}</strong>
              <span>{{ item.installed_version || "版本未知" }}</span>
              <span v-if="item.pending">等待重启生效</span>
              <span v-else-if="item.current_digest !== item.source_digest">源码已变更或缺失</span>
            </div>
            <div class="archive-actions">
              <el-button size="small" icon="el-icon-refresh-right" :disabled="busy || item.pending || item.current_digest !== item.source_digest" @click="manage(item, 'load')">加载（重启生效）</el-button>
              <el-button size="small" type="danger" icon="el-icon-delete" :disabled="busy || item.pending || !item.current_digest" @click="manage(item, 'uninstall')">卸载</el-button>
            </div>
          </li>
        </ul>
      </section>
    </div>
    <span slot="footer">
      <el-button :disabled="busy" @click="close">关闭</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { v4 as uuidv4 } from "uuid"
import { deleteRequest, getRequest, postRequest } from "@/utils/api"

const errors = {
  archive_format_unsupported: "仅支持 .zip 和 .tar.gz 压缩包。",
  archive_upload_limit: "压缩包不能超过 100 MiB。",
  archive_expansion_limit: "解压内容超过 500 MiB 限制。",
  archive_entry_limit: "归档条目超过 10000 项限制。",
  archive_path_unsafe: "归档包含不安全或不受支持的路径。",
  archive_path_collision: "归档包含大小写冲突或文件与目录冲突。",
  archive_duplicate_entry: "归档包含重复条目。",
  archive_special_entry: "归档包含链接、设备或其他特殊文件。",
  archive_encrypted: "不支持加密压缩包。",
  archive_invalid: "压缩包无效或已损坏。",
  archive_empty: "压缩包为空。",
  archive_truncated: "压缩包内容不完整。",
  archive_size_mismatch: "归档条目大小与声明不一致。",
  archive_directory_payload: "归档目录包含不合法的数据。",
  archive_zip_directory_unsupported: "无法安全解析 ZIP 目录，请重新打包。",
  archive_metadata_limit: "归档元数据超过安全限制。",
  archive_module_invalid: "插件模块名不是有效的 Python 标识符。",
  archive_package_name_missing: "无法确定插件包名，请保留插件所在目录。",
  archive_multiple_plugins: "检测到多个候选插件，请只上传一个插件。",
  archive_package_declaration_invalid: "打包声明中的插件路径无效或不存在，请检查 pyproject.toml。",
  archive_poetry_dependency_unsupported: "Poetry 依赖包含不受支持的路径、VCS、下载地址或自定义安装源，请提供静态版本声明。",
  archive_poetry_constraint_unsupported: "Poetry 版本约束无法安全转换，请改为标准版本范围。",
  archive_poetry_platform_unsupported: "Poetry 平台限制不受支持，请使用标准环境标记。",
  archive_plugin_not_identified: "未识别到单个 Python 插件文件或包。",
  archive_wrapper_limit: "归档目录嵌套过深，请保留单层包装目录或 src 目录。",
  archive_python_invalid: "候选插件包含无法解析的 Python 源码。",
  archive_python_source_limit: "Python 源码超过静态检查大小限制。",
  archive_python_incompatible: "插件声明的 Python 版本要求与当前运行环境不兼容。",
  archive_requires_python_invalid: "插件的 Python 版本要求声明无效。",
  archive_dependency_metadata_limit: "依赖元数据超过安全限制。",
  archive_dependency_metadata_invalid: "依赖元数据格式无效。",
  archive_dynamic_dependencies: "不支持动态生成的依赖声明。",
  archive_dependency_format_unsupported: "依赖声明格式不受支持，请提供静态 requirements 或 PEP 621 声明。",
  archive_setup_dependencies_unsupported: "不执行 setup.py 或 setup.cfg 推导依赖，请提供无构建脚本的静态归档。",
  archive_requirement_unsupported: "依赖包含不受支持的选项、URL 或 NoneBot 1 包。",
  archive_wheel_dependencies_unresolved: "依赖解析失败，请重新预检并查看具体原因。",
  archive_dependency_plan_not_ready: "依赖预检尚未通过，请先解决显示的失败项。",
  archive_source_build_not_applicable: "当前失败不是可通过源码构建解决的依赖问题。",
  proxy_configuration_unavailable: "全局代理配置不可用，请先修复代理。",
  installer_trusted_index_invalid: "可信安装源地址无效；远程安装源必须使用 HTTPS。",
  proxy_installer_protocol_unsupported: "依赖安装器不支持当前代理协议。",
  archive_dependency_forbidden: "依赖计划包含不允许覆盖的环境管理包。",
  archive_dependency_conflict: "归档依赖与当前固定版本或其他已安装归档的依赖要求冲突。为避免破坏已有插件，已拒绝变更。",
  archive_dependency_receipt_incomplete: "已有归档安装记录缺少依赖根或固定版本证据，无法安全变更依赖。请先核对并修复安装记录；不会自动放行缺失的依赖证据。",
  archive_dependency_receipt_invalid: "归档安装记录中的依赖证据无效或前后不一致，已拒绝操作。请检查归档来源并重新建立安装记录。",
  archive_dependency_timeout: "依赖解析超时，请稍后重新预检。",
  environment_drift: "当前依赖环境存在漂移，请先修复环境。",
  core_dependency_conflict: "插件依赖与受保护的核心依赖冲突。",
  cross_store_dependency_conflict: "依赖与其他待生效商店操作冲突。",
  plugin_transaction_not_mutable: "当前事务不可修改，请先处理已有操作。",
  archive_source_build_transaction_conflict: "依赖构建授权缺失、安装源已变化或与现有事务冲突，请核对后重新预检。",
  archive_builtin_forbidden: "禁止覆盖或遮蔽内置插件。",
  archive_target_link: "安装目标包含符号链接或 Windows 目录联接，已拒绝操作。",
  archive_target_collision: "目标存在同名、大小写或文件与包类型冲突。",
  archive_target_managed_elsewhere: "该目标已由其他商店管理，不能通过归档接管。",
  archive_target_pending: "该插件已有待生效操作，请先完成或取消原事务。",
  archive_preflight_not_found: "预检不存在或不属于当前登录会话。",
  archive_preflight_expired: "预检已过期，请重新上传。",
  archive_preflight_capacity: "暂存归档数量已达上限，请先丢弃其他上传。",
  archive_confirmation_required: "请确认归档摘要并接受第三方代码风险。",
  archive_digest_changed: "暂存归档或候选源码摘要发生变化，请重新上传。",
  archive_target_changed: "安装目标发生变化，请刷新并重新预检。",
  archive_replace_required: "目标插件已存在，必须明确确认替换。",
  archive_environment_changed: "环境或待生效事务发生变化，请重新预检。",
  archive_receipt_not_found: "未找到此插件的外部安装记录。",
  archive_receipt_invalid: "安装记录与目标路径不一致，已阻止操作。",
  archive_origin_forbidden: "请求来源与管理页面地址不匹配。",
  archive_session_required: "需要有效的登录会话，请重新登录。",
  plugin_operation_in_progress: "其他插件操作正在进行，请稍后重试。",
  plugin_operation_id_conflict: "操作标识冲突，请刷新页面后重试。",
  archive_inspection_failed: "静态检查未完成，请检查压缩包后重试。",
  archive_inspection_timeout: "静态检查超时，请缩小压缩包后重试。",
}

export default {
  name: "PluginArchiveDialog",
  props: { visible: Boolean },
  data() {
    return {
      file: null, preflight: null, busy: false, progress: null, sourceBuildTrusted: false, sequence: 0,
      trusted: false, replace: false, error: "", result: null,
      installed: [], now: Date.now(), timer: null, actionIds: {},
    }
  },
  computed: {
    base() { return `${this.$root.prefix}/plugin/archive` },
    expired() { return this.preflight && this.now >= this.preflight.expires_at * 1000 },
    canConfirm() {
      return this.preflight && !this.expired && !this.busy && this.trusted &&
        this.preflight.dependency_plan.status !== "blocked" &&
        (!this.preflight.replace_required || this.replace)
    },
    dependencies() {
      const changes = this.preflight?.dependency_plan?.package_changes || {}
      return [...(changes.added || []), ...(changes.changed || [])]
    },
  },
  mounted() {
    this.refresh()
    this.timer = setInterval(() => { this.now = Date.now() }, 1000)
  },
  beforeDestroy() { this.sequence++; clearInterval(this.timer) },
  methods: {
    dependencyError(diagnostic) {
      const messages = {
        archive_dependency_network: "无法连接依赖安装源，请检查代理及网络。",
        archive_dependency_proxy_auth: "代理认证失败。",
        archive_dependency_index_auth: "依赖安装源拒绝访问，请检查认证及权限。",
        archive_dependency_tls: "安装源 TLS 验证失败。",
        archive_dependency_python: "当前 Python 版本不满足依赖要求。",
        archive_dependency_conflict: "依赖版本与现有环境约束冲突。",
        archive_dependency_source_required: "没有可用 wheel，可确认后尝试从可信源构建依赖。",
        archive_dependency_disk_full: "磁盘空间不足。",
      }
      return messages[diagnostic.code] || "依赖解析未通过，请查看原因。"
    },
    async resolveDependencies(sourceBuild = true) {
      sourceBuild = sourceBuild !== false
      if (this.busy || (sourceBuild && !this.sourceBuildTrusted) || this.expired) return
      const sequence = ++this.sequence
      const id = this.preflight.preflight_id
      this.busy = true
      this.error = ""
      try {
        const resolved = this.check(await postRequest(`${this.base}/preflight/${id}/resolve`, {
          archive_digest: this.preflight.archive_digest, confirm_dependency_source_build: sourceBuild,
        }, { suppressErrorToast: true }))
        if (sequence === this.sequence && this.preflight?.preflight_id === id) this.preflight = resolved
      } catch (error) { if (sequence === this.sequence) this.fail(error) }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    mib(value) { return (value / 1024 / 1024).toFixed(1) },
    fail(error) {
      const detail = error.response?.data?.detail
      const code = detail?.code || detail
      this.error = errors[code] || (error.response?.status === 401 ? "登录会话已失效，请重新登录。" : "归档操作失败，请重新预检后重试。")
      if (Array.isArray(detail?.candidates)) this.error += ` 候选路径：${detail.candidates.join("、")}`
    },
    check(response) {
      if (!response?.suc) throw new Error(response?.info || "归档请求失败")
      return response.data
    },
    selectFile(event) {
      this.error = ""
      this.file = event.target.files[0] || null
      if (this.file && (!/\.(zip|tar\.gz)$/i.test(this.file.name) || this.file.size > 100 * 1024 * 1024)) {
        this.error = "请选择不超过 100 MiB 的 .zip 或 .tar.gz 压缩包。"
        this.file = null
        event.target.value = ""
      }
    },
    async inspect() {
      const sequence = ++this.sequence
      this.busy = true
      this.error = ""
      this.progress = 0
      try {
        const inspected = this.check(await postRequest(
          `${this.base}/preflight?filename=${encodeURIComponent(this.file.name)}`,
          this.file,
          {
            headers: { "Content-Type": "application/octet-stream" },
            suppressErrorToast: true,
            onUploadProgress: (event) => {
              this.progress = event.total ? Math.min(100, Math.round(event.loaded / event.total * 100)) : 0
              if (this.progress === 100) this.progress = null
            },
          }
        ))
        if (sequence === this.sequence) this.preflight = inspected
      } catch (error) { if (sequence === this.sequence) this.fail(error) }
      finally { if (sequence === this.sequence) { this.busy = false; this.progress = null } }
    },
    async confirm() {
      if (!this.canConfirm) return
      const sequence = ++this.sequence
      this.busy = true
      this.error = ""
      try {
        const result = this.check(await postRequest(`${this.base}/preflight/${this.preflight.preflight_id}/confirm`, {
          archive_digest: this.preflight.archive_digest,
          replace: this.replace,
          confirm_third_party_code: this.trusted,
        }, { suppressErrorToast: true }))
        if (sequence !== this.sequence) return
        this.result = result
        this.$emit("changed")
      } catch (error) { if (sequence === this.sequence) this.fail(error) }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    async discard() {
      this.busy = true
      this.error = ""
      try {
        await deleteRequest(`${this.base}/preflight/${this.preflight.preflight_id}`, null, { suppressErrorToast: true })
        this.preflight = null
        this.result = null
        this.file = null
        this.trusted = false
        this.replace = false
        this.$refs.fileInput.value = ""
      } catch (error) {
        if ([404, 410].includes(error.response?.status)) this.preflight = null
        else this.fail(error)
      } finally { this.busy = false }
    },
    async refresh() {
      try { this.installed = this.check(await getRequest(`${this.base}/installed`)) }
      catch (error) { this.fail(error) }
    },
    async manage(item, action) {
      try {
        await this.$confirm(`确认${action === "load" ? "加载" : "卸载"}插件 ${item.module}？操作将在下次重启后生效。`, "确认外部插件操作", { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" })
      } catch (_) { return }
      this.busy = true
      this.error = ""
      const key = `${item.store_key}:${action}:${item.current_digest}`
      if (!this.actionIds[key]) this.actionIds[key] = uuidv4().replace(/-/g, "")
      try {
        this.result = this.check(await postRequest(`${this.base}/${action}`, {
          store_key: item.store_key, operation_id: this.actionIds[key],
          expected_digest: item.current_digest, confirmed: true,
        }, { suppressErrorToast: true }))
        this.$emit("changed")
        await this.refresh()
      } catch (error) { this.fail(error) }
      finally { this.busy = false }
    },
    async close() {
      if (this.busy) return
      if (this.preflight) {
        await this.discard()
        if (this.preflight) return
      }
      this.$emit("close")
    },
  },
}
</script>

<style>
.plugin-archive-dialog { max-width: calc(100% - 24px); border-radius: 8px; }
.archive-content { color: var(--text-color); }
.archive-content h3 { font-size: 16px; margin: 0 0 12px; }
.archive-upload, .archive-actions, .archive-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.archive-upload { margin: 20px 0; }
.archive-upload input { flex: 1; width: 100%; min-width: 180px; }
.archive-review, .archive-installed { margin-top: 24px; border-top: 1px solid var(--border-color-light); padding-top: 20px; }
.archive-review dl { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 8px; }
.archive-review dd { margin: 0; overflow-wrap: anywhere; }
.archive-review .el-checkbox { display: flex; margin: 14px 0; white-space: normal; }
.archive-review .el-checkbox__label { white-space: normal; overflow-wrap: anywhere; }
.archive-digest { font-family: monospace; }
.archive-dependencies { max-height: 180px; overflow: auto; overflow-wrap: anywhere; }
.archive-heading { justify-content: space-between; }
.archive-receipts { list-style: none; padding: 0; }
.archive-receipts li { display: flex; gap: 12px; justify-content: space-between; flex-wrap: wrap; padding: 12px 0; border-bottom: 1px solid var(--border-color-light); }
.archive-receipt-name { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.archive-content .el-alert { margin-top: 12px; }
@media (max-width: 480px) {
  .archive-review dl { grid-template-columns: minmax(0, 1fr); }
  .archive-review dt { font-weight: 600; }
  .archive-actions .el-button { margin-left: 0; }
}
</style>
