<template>
  <div class="configuration-center" v-loading="loading">
    <div class="configuration-toolbar">
      <div>
        <h2>运行配置</h2>
        <p>仅部分基础项（日志等级、昵称、超级用户、超时、代理等）保存后立即生效，其余需重启 Bot；每项的“生效方式”标明具体要求。</p>
      </div>
      <el-button icon="el-icon-refresh" :disabled="Boolean(saving)" @click="reloadSummary">重新加载</el-button>
    </div>

    <div class="configuration-connection">
      <details><summary><i class="el-icon-connection"></i> 网络入口<span v-if="networkStatus.network_runtime"> · {{ (networkStatus.network_runtime.scheme || '待确认').toUpperCase() }}</span><span v-if="networkStatus.network_configured && networkStatus.network_configured.pending_restart"> · 待重启</span><span v-if="networkStatus.network_runtime && networkStatus.network_runtime.http_state === 'degraded'"> · 入口降级</span></summary><NetworkStatus :status="networkStatus" /></details>
      <el-button type="text" icon="el-icon-position" @click="$router.push('/network-proxy', () => {}, (error) => $message.error(error.message))">网络代理设置</el-button>
    </div>
    <el-tabs v-model="section">
      <el-tab-pane label="环境配置" name="env">
        <p class="environment-source">配置来源 <code>{{ envSourceFile }}</code> · 机器人连接在「机器人接入」、数据库与缓存在「数据与缓存」页面设置，插件变量在「自定义变量」中维护</p>
        <SettingsLayout v-model="envCategory" :query="envSearch" :groups="envCategories" @search="envSearch = $event">
          <section v-for="group in envCategories.filter(item => item.key !== 'custom')" v-show="envSearch.trim() ? group.count > 0 : envCategory === group.key" :key="group.key">
            <header class="settings-group-heading"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><el-tag size="mini" type="info">{{ group.count }} 项</el-tag></header>
            <div v-if="!group.fields.length" class="category-empty">此分类暂无配置项</div>
            <template v-for="field in group.fields"><SchemaField v-show="envMatches(field)" :key="field.key" presentation="settings" :value="envFields[field.key]" :schema="field.schema" :root-schema="field.schema['x-root-schema'] || field.schema" :label="envLabel(field)" :path="field.key" :ui="envFieldUi(field)" :query="envSearch" :readonly-reason="field.readonly_reason || envDisabledReason(field)" :issues="envIssues" @input="setEnvField(field.key, $event)">
              <template #meta><div v-if="envFieldChanged(field.key)" class="field-effect changed-indicator">未保存修改</div></template>
              <template #details><div>生效方式：{{ effectMeta(field.apply_effect).label }}</div><div v-if="field.schema_sources && field.schema_sources.length">来源：{{ field.schema_sources.join('、') }}</div><div v-if="field.external_environment_present">启动环境也声明了此变量，重启时请核对外部环境设置。</div></template>
              <template #status><div class="setting-runtime"><span>当前运行</span><code>{{ runtimeText(field) }}</code></div><p v-if="field.overridden" class="setting-status-note">当前运行值与启动环境变量一致，和文件设置不同。重启时请同时核对启动环境。</p><p v-else-if="!envFieldChanged(field.key) && envStateText(field)" class="setting-status-note" :class="{ neutral: field.apply_state === 'unknown' }">{{ envStateText(field) }}</p></template>
            </SchemaField></template>
          </section>
          <section v-show="envSearch.trim() ? customSearchCount > 0 : envCategory === 'custom'" class="custom-env-section">
            <header class="settings-group-heading">
              <div><h3>自定义环境变量</h3><p>第三方插件或外部服务使用的变量。插件声明过的变量保存时会按声明类型校验，保存后需要重启生效。</p></div>
              <el-button size="small" icon="el-icon-plus" @click="addCustomEnv">添加变量</el-button>
            </header>
            <div v-if="customEnv.length" class="custom-env-list">
              <div v-for="(item, index) in customEnv" :key="item.clientId" v-show="customMatches(item)" class="custom-env-row" :class="{ deleted: item.deleted }">
                <el-input v-model="item.key" placeholder="变量名称" :disabled="!item.isNew || item.deleted" @input="markEnvDirty" />
                <el-input v-model="item.value" placeholder="变量值" :type="isSecretPath(item.key) ? 'password' : 'text'" :show-password="isSecretPath(item.key)" :disabled="item.deleted" @input="markEnvDirty" />
                <el-tag size="mini" type="warning">需要重启</el-tag>
                <el-button v-if="item.deleted" size="small" @click="restoreCustomEnv(item)">撤销</el-button>
                <el-button v-else type="danger" plain size="small" icon="el-icon-delete" @click="removeCustomEnv(item, index)">删除</el-button>
              </div>
            </div>
            <div v-else class="custom-env-empty">尚未配置自定义环境变量</div>
            <div v-if="customEnvError" class="inline-error">{{ customEnvError }}</div>
          </section>
          <template #footer><div class="save-description"><strong>{{ envChangeCount ? envChangeCount + ' 项未保存修改' : '没有未保存的修改' }}</strong><span v-if="envSaveHint" class="save-hint">{{ envSaveHint }}</span></div><el-button :disabled="!envChangeCount || Boolean(saving)" @click="resetEnvironment">撤销修改</el-button><el-button type="primary" :disabled="!envChangeCount || Boolean(customEnvError)" :loading="saving === 'env'" @click="saveEnv">保存环境配置</el-button></template>
        </SettingsLayout>
      </el-tab-pane>

      <el-tab-pane label="其他配置" name="simple">
        <p class="environment-source">插件的配置请在「插件列表」中打开插件详情修改，这里只列出不属于插件列表中插件的配置组。<el-button type="text" @click="$router.push('/plugin', () => {}, (error) => $message.error(error.message))">前往插件列表</el-button></p>
        <div class="plugin-config-workbench">
          <aside class="config-groups">
            <el-input v-model="groupSearch" clearable prefix-icon="el-icon-search" placeholder="搜索配置组或配置项" size="small" />
            <template v-for="part in groupSections">
              <h4 :key="`title-${part.key}`" class="group-category">{{ part.title }} · {{ part.groups.length }}</h4>
              <button v-for="group in part.groups" :key="group.module" :class="{ active: selectedGroup === group.module }" @click="selectedGroup = group.module; selectedOrphan = ''">
                <strong>{{ group.name }}<i v-if="simpleChanges[group.module]" class="unsaved-dot" title="有未保存修改"></i></strong>
                <span>{{ group.module }} · {{ group.fields.length }} 项<template v-if="(group.plugins || []).length > 1"> · {{ group.plugins.length }} 个插件共用</template></span>
              </button>
            </template>
            <el-collapse v-if="orphanGroups.length" v-model="orphanPanel" class="orphan-groups">
              <el-collapse-item name="orphaned"><template slot="title">孤立配置 · {{ orphanGroups.length }} 组</template>
                <button v-for="group in filteredOrphanGroups" :key="`orphan-${group.module}`" :class="{ active: selectedOrphan === group.module }" @click="selectOrphan(group)">
                  <strong>{{ group.name }}</strong><span>{{ group.module }} · {{ group.fields.length }} 项</span>
                </button>
              </el-collapse-item>
            </el-collapse>
            <div v-if="!groupSections.length" class="group-empty">没有匹配的配置组</div>
          </aside>
          <section v-if="currentGroup" class="current-config-group">
            <div class="config-form-scroll">
              <ConfigGroupEditor :key="selectedGroup" :group="currentGroup" :issues="pluginIssues" @change="pluginIssues = []" @validity-change="setInvalid" />
            </div>
            <div class="action-bar config-action-bar">
              <span>{{ Object.keys(simpleChanges).length ? `${Object.keys(simpleChanges).length} 个配置组有未保存修改` : "未知配置组和字段会原样保留" }}</span>
              <el-button type="primary" icon="el-icon-check" :loading="saving === 'simple'" :disabled="pluginInvalidCount > 0 || !Object.keys(simpleChanges).length" @click="saveSimple">保存配置</el-button>
            </div>
          </section>
          <section v-else-if="selectedOrphanGroup" class="current-config-group orphan-config-panel">
            <header class="group-heading"><div><h3>{{ selectedOrphanGroup.name }}</h3><p>{{ selectedOrphanGroup.module }} · 文件中保留的未注册配置</p></div><el-button size="small" icon="el-icon-document" @click="section = 'raw'">查看配置原文</el-button></header>
            <el-alert :title="selectedOrphanGroup.readonly_reason || '该配置组当前没有对应的已加载插件。内容会保留，不会自动写入运行配置。'" type="warning" :closable="false" show-icon />
            <pre class="orphan-preview">{{ JSON.stringify(selectedOrphanGroup.raw_value || Object.fromEntries(selectedOrphanGroup.fields.map(field => [field.key, field.value])), null, 2) }}</pre>
          </section>
          <section v-else class="current-config-empty"><i class="el-icon-setting"></i><p>选择一个配置组开始编辑</p></section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="配置原文" name="raw" lazy>
        <el-alert title="原文可能包含 Token、密码和 Secret。请勿截图、分享或粘贴到外部服务。" type="warning" :closable="false" show-icon />
        <div class="raw-switch">
          <el-radio-group :value="rawFile" size="small" :disabled="Boolean(saving)" @input="loadRaw">
            <el-radio-button label="env">{{ envSourceFile || '环境文件' }}</el-radio-button>
            <el-radio-button label="simple">config.yaml</el-radio-button>
          </el-radio-group>
          <el-button size="small" icon="el-icon-refresh" @click="loadRaw(rawFile)">重新读取</el-button>
        </div>
        <el-input v-model="rawContent" type="textarea" :rows="22" resize="vertical" class="raw-editor" spellcheck="false" />
        <div v-if="rawError" class="inline-error">{{ rawError }}</div>
        <ul v-if="rawIssues.length" class="validation-issues">
          <li v-for="(issue, index) in rawIssues" :key="`${issue.code}-${index}`">
            <code v-if="issue.line">第 {{ issue.line }} 行<span v-if="issue.column">:{{ issue.column }}</span></code>
            <span>{{ issue.message }}</span>
          </li>
        </ul>
        <div class="action-bar">
          <span>保存前会重新校验语法和 revision</span>
          <el-button :loading="validating" :disabled="!rawReady" @click="validateRaw">校验</el-button>
          <el-button type="primary" :loading="saving === 'raw'" :disabled="!rawReady" @click="saveRaw">保存</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<script>
import SettingsLayout from "@/components/config/SettingsLayout.vue"
import { environmentCategories } from "@/components/config/settings-ui"
import ConfigGroupEditor from "@/components/config/ConfigGroupEditor.vue"
import SchemaField from "@/components/config/SchemaField.vue"
import { fieldMatches, isSecretPath, validateField } from "@/components/config/schema-utils"
import { changeIssues, collectChanges, groupMatches, markSaved, normalizeGroups, saveSimpleConfig } from "@/components/config/simple-config"
import NetworkStatus from "@/components/system/NetworkStatus.vue"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

export default {
  name: "ConfigurationCenter",
  components: { ConfigGroupEditor, SchemaField, NetworkStatus, SettingsLayout },
  data() {
    return {
      envCategory: "access", networkStatus: {}, rawLoading: false, envSearch: "", envIssues: [],
      loading: false, saving: "", validating: false, section: "env", envRevision: "", simpleRevision: "", envFields: {}, originalEnvFields: {}, envDescriptors: [], envSourceFile: "", customEnv: [], originalCustomEnv: [], customEnvError: "", customEnvSequence: 0, groups: [], groupSearch: "", selectedGroup: "", launcherManaged: false,
      rawFile: "env", rawContent: "", rawOriginal: "", rawRevision: "", rawError: "", rawIssues: [], rawLoaded: {}, pluginInvalid: {}, pluginIssues: [], orphanPanel: [], selectedOrphan: "",
      envFieldDefinitions: [
        { key: "HOST", label: "监听地址", placeholder: "0.0.0.0", help: "0.0.0.0 允许局域网与公网访问，127.0.0.1 仅本机访问。" },
        { key: "PORT", label: "监听端口", type: "number", placeholder: "8080", help: "WebUI 与适配器共享的本地服务端口；启用 HTTPS 后该端口提供 HTTPS。" },
        { key: "WEBUI_HTTPS_ENABLED", label: "启用 HTTPS", type: "switch", help: "使用用户提供的可信 PEM 证书和私钥，需要重启生效。开启后 OneBot 协议端必须改用 wss:// 连接并信任证书，ws:// 与 HTTP 兼容入口都无法接入。" },
        { key: "WEBUI_TLS_CERTFILE", label: "TLS 证书路径", placeholder: "C:\\certs\\fullchain.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "证书 PEM 的绝对路径，保存时会检查有效期及密钥匹配。" },
        { key: "WEBUI_TLS_KEYFILE", label: "TLS 私钥路径", placeholder: "C:\\certs\\privkey.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "未加密私钥 PEM 的绝对路径。" },
        { key: "WEBUI_HTTP_MODE", label: "HTTP兼容入口", type: "http-mode", dependsOn: "WEBUI_HTTPS_ENABLED", options: [{ value: "serve", label: "完整访问" }, { value: "redirect", label: "跳转HTTPS" }, { value: "disabled", label: "关闭" }], help: "完整访问以明文提供 WebUI 页面、接口和实时连接，不开放适配器等其他服务；跳转HTTPS 把请求 308 跳转到 HTTPS 端口。需要重启生效。" },
        { key: "WEBUI_HTTP_REDIRECT_PORT", label: "HTTP兼容端口", type: "number", dependsOn: "WEBUI_HTTPS_ENABLED", httpModeRequired: true, placeholder: "80", help: "默认80，不能与监听端口相同；端口被占用时HTTPS继续运行，HTTP入口进入降级并自动重试。" },
        { key: "LOG_LEVEL", label: "日志等级", placeholder: "INFO", help: "常用值为 DEBUG、INFO、WARNING。" },
        { key: "API_TIMEOUT", label: "接口超时", unit: "秒", help: "适配器 API 调用的等待时间上限。" },
        { key: "NICKNAME", label: "机器人昵称", placeholder: "[\"真寻\"]", help: "使用 dotenv 支持的列表格式。" },
        { key: "SELF_NICKNAME", label: "回复昵称", placeholder: "真寻", help: "回复消息中使用的自称。" },
        { key: "COMMAND_START", label: "命令前缀", placeholder: "[\"/\"]", help: "支持多个命令前缀。" },
        { key: "COMMAND_SEP", label: "命令分隔符", placeholder: "[\".\"]", help: "修改后需重启 Bot 生效。" },
        { key: "ALCONNA_USE_COMMAND_START", label: "Alconna 使用命令前缀", type: "switch", help: "修改后需重启 Bot 生效。" },
        { key: "SUPERUSERS", label: "超级用户", placeholder: "[\"123456\"]", help: "平台用户 ID 列表。" },
        { key: "PLATFORM_SUPERUSERS", label: "平台超级用户", placeholder: "{\"qq\":[\"123456\"]}", help: "按平台分别配置超级用户。" },
        { key: "SESSION_EXPIRE_TIMEOUT", label: "会话超时", type: "number", unit: "秒", placeholder: "120", help: "交互会话的超时秒数。" },
        { key: "IMAGE_TO_BYTES", label: "图片字节发送", type: "switch", help: "仅在适配器需要时开启。" },
        { key: "EXT_PATH", label: "扩展插件路径", placeholder: "[]", help: "额外插件目录列表。" },
      ],
    }
  },
  computed: {
    envCategories() { return environmentCategories(this.envDescriptors, this.envMatches, this.customSearchCount) },
    customSearchCount() { return this.customEnv.filter(this.customMatches).length },
    envChangeCount() { return Object.keys(this.changedEnvFields()).length + this.unsetEnvFields().length + this.customEnv.filter(item => item.isNew || item.deleted || this.originalCustomEnv.find(old => old.key === item.key)?.value !== item.value).length },
    customOperations() {
      const original = new Map(this.originalCustomEnv.map((item) => [item.key, item]))
      const operations = []
      this.customEnv.forEach((item) => {
        if (item.deleted && !item.isNew) operations.push({ key: item.key, operation: "delete" })
        else if (item.isNew && item.key.trim()) operations.push({ key: item.key.trim(), operation: "set", value: item.value || "" })
        else if (original.get(item.key)?.value !== item.value) operations.push({ key: item.key, operation: "set", value: item.value || "" })
      })
      return operations
    },
    envSaveHint() {
      const changedKeys = Object.keys(this.changedEnvFields())
      const needsRestart = this.customOperations.length > 0 || changedKeys.some((key) => this.envDescriptors.find(field => field.key === key)?.apply_effect !== "in_place")
      if (!changedKeys.length && !this.customOperations.length && !Object.keys(this.originalEnvFields).some(key => this.envFields[key] === undefined)) return ""
      if (!needsRestart) return "保存后立即生效"
      return this.launcherManaged ? "包含启动期配置，保存后可确认重启" : "包含启动期配置，保存后需要手动重启"
    },
    rawReady() { return Boolean(this.rawLoaded[this.rawFile] && /^[a-f0-9]{64}$/.test(this.rawRevision)) },
    groupSections() {
      const titles = { plugin: "插件", builtin: "内置功能", core: "真寻" }
      return Object.entries(titles)
        .map(([key, title]) => ({ key, title, groups: this.activeGroups.filter(group => (group.category || "plugin") === key && groupMatches(group, this.groupSearch)).sort((left, right) => left.name.localeCompare(right.name, "zh-CN")) }))
        .filter(part => part.groups.length)
    },
    filteredOrphanGroups() { return this.orphanGroups.filter(group => groupMatches(group, this.groupSearch)) },
    activeGroups() { return this.groups.filter((group) => group.registered !== false && group.source_status !== "orphaned") },
    orphanGroups() { return this.groups.filter((group) => group.registered === false || group.source_status === "orphaned") },
    selectedOrphanGroup() { return this.orphanGroups.find((group) => group.module === this.selectedOrphan) || null },
    currentGroup() { return this.activeGroups.find((group) => group.module === this.selectedGroup) || null },
    simpleChanges() { return collectChanges(this.activeGroups) },
    pluginInvalidCount() { return Object.values(this.pluginInvalid).reduce((sum, paths) => sum + paths.length, 0) },
  },
  mounted() { this.loadSummary() },
  beforeDestroy() { clearDirtyState("plugin-configuration"); clearDirtyState("environment-configuration"); clearDirtyState("raw-configuration") },
  methods: {
    isSecretPath,
    envFieldUi(field) { return { ...this.envMeta(field), description: this.envHelp(field) } },
    envFieldChanged(key) { return JSON.stringify(this.envFields[key]) !== JSON.stringify(this.originalEnvFields[key]) },
    envStateText(field) { return { restart_pending: '已保存，重启 Bot 后生效', applying: '正在应用', unknown: '运行状态未确认' }[field.apply_state] || '' },
    customMatches(item) { return !this.envSearch.trim() || `${item.key} 自定义变量`.toLowerCase().includes(this.envSearch.trim().toLowerCase()) },
    resetEnvironment() { this.envFields = JSON.parse(JSON.stringify(this.originalEnvFields)); this.customEnv = this.originalCustomEnv.map(item => ({ ...item })); this.envIssues = []; this.markEnvDirty() },
    focusEnvironmentIssue() { const issue = this.envIssues[0]; if (!issue) return; const group = this.envCategories.find(item => item.fields?.some(field => issue.path === field.key || String(issue.path).startsWith(field.key + '.'))); this.envCategory = group ? group.key : 'custom'; this.envSearch = ''; this.focusIssue() },
    envMeta(field) { return this.envFieldDefinitions.find((item) => item.key === field.key) || {} },
    envLabel(field) { return this.envMeta(field).label || field.key },
    envDisabledReason(field) {
      const meta = this.envMeta(field)
      if (meta.dependsOn && !this.envFields[meta.dependsOn]) return "需先启用 HTTPS"
      if (meta.httpModeRequired && this.envFields.WEBUI_HTTP_MODE === "disabled") return "HTTP兼容入口已关闭"
      return ""
    },
    envHelp(field) { return this.envMeta(field).help || field.schema?.description || "" },
    envMatches(field) {
      const meta = this.envMeta(field)
      return fieldMatches(this.envSearch, `${field.key} ${meta.label || ""} ${meta.help || ""}`, field.schema, this.envFields[field.key], field.schema["x-root-schema"] || field.schema) || this.envIssues.some(issue => String(issue.path || "").startsWith(field.key))
    },
    /**
     * 生成字段“当前运行”一栏的文字，密钥类字段只显示是否已设置
     * @param {object} field 环境配置字段
     * @returns {string} 展示文字
     */
    runtimeText(field) {
      if (field.runtime_available === false) return "未取得"
      if (isSecretPath(field.key)) return field.effective_value === null || field.effective_value === "" ? "未设置" : "已设置（已隐藏）"
      return this.formatRuntimeValue(field.effective_value)
    },
    formatRuntimeValue(value) {
      if (value === undefined) return "未取得"
      if (value === null) return "未设置"
      if (typeof value === "boolean") return value ? "开启" : "关闭"
      if (Array.isArray(value)) {
        const preview = value.slice(0, 3).map(item => this.formatRuntimeValue(item)).join("、")
        return `数组 · ${value.length} 项${preview ? ` · ${preview}` : ""}`
      }
      if (typeof value === "object") {
        const keys = Object.keys(value)
        return `对象 · ${keys.length} 个字段${keys.length ? ` · ${keys.slice(0, 4).join("、")}` : ""}`
      }
      return String(value) || "空字符串"
    },
    focusIssue() { this.$nextTick(() => { const error = this.$el.querySelector(".field-error"); if (error) error.scrollIntoView({ block: "center", behavior: "smooth" }) }) },
    effectMeta(effect) {
      return {
        in_place: { label: "保存后立即生效", type: "success" },
      }[effect] || { label: "保存后需重启 Bot", type: "warning" }
    },
    normalizeCustomEnv(items) {
      return (items || []).map((item) => ({ ...item, clientId: `env-${++this.customEnvSequence}`, value: item.value || "", deleted: false, isNew: false }))
    },
    async confirmDiscard(message) {
      try { await this.$confirm(message, "放弃未保存修改？", { type: "warning", customClass: "configuration-confirm", confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" }); return true } catch (_) { return false }
    },
    async reloadSummary() {
      if (this.saving || this.loading) return
      if ((this.envChangeCount || Object.keys(this.simpleChanges).length) && !await this.confirmDiscard("环境配置与其他配置的草稿将重新读取；配置原文草稿保持不变。")) return
      await this.loadSummary()
    },
    async loadSummary(scope = "all") {
      this.loading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/configuration/summary`)
        if (!response.suc) throw new Error(response.info)
        this.networkStatus = response.data.network || {}
        if (scope === "all" || scope === "env") {
        this.envIssues = []
        this.envRevision = response.data.env.revision
        this.envDescriptors = response.data.env.descriptors || []
        this.envSourceFile = response.data.env.source_file || ""
        this.envFields = Object.fromEntries(this.envDescriptors.filter(field => field.configured).map(field => [field.key, field.value]))
        this.originalEnvFields = JSON.parse(JSON.stringify(this.envFields))
        this.customEnv = this.normalizeCustomEnv(response.data.env.custom_env)
        this.originalCustomEnv = this.customEnv.map((item) => ({ ...item }))
        this.customEnvError = ""
        clearDirtyState("environment-configuration")
        }
        if (scope === "all" || scope === "simple") {
        this.simpleRevision = response.data.simple.revision
        this.groups = normalizeGroups(response.data.simple.groups)
        if (!this.activeGroups.some((group) => group.module === this.selectedGroup)) this.selectedGroup = this.groupSections[0]?.groups[0]?.module || ""
        if (!this.orphanGroups.some((group) => group.module === this.selectedOrphan)) this.selectedOrphan = ""
        this.pluginInvalid = {}; this.pluginIssues = []
        clearDirtyState("plugin-configuration")
        }
        this.launcherManaged = response.data.launcher_managed
      } catch (error) { this.$message.error(error.message || "配置摘要加载失败") }
      finally { this.loading = false }
    },
    setInvalid(module, paths) { if (paths.length) this.$set(this.pluginInvalid, module, paths); else this.$delete(this.pluginInvalid, module) },
    setEnvField(key, value) { if (value === undefined) this.$delete(this.envFields, key); else this.$set(this.envFields, key, value); this.envIssues = this.envIssues.filter(issue => issue.path !== key && !String(issue.path).startsWith(key + ".")); this.markEnvDirty() },
    selectOrphan(group) { this.selectedOrphan = group.module; this.selectedGroup = "" },
    changedEnvFields() {
      const changed = {}
      this.envDescriptors.forEach(({ key }) => { if (JSON.stringify(this.envFields[key]) !== JSON.stringify(this.originalEnvFields[key]) && this.envFields[key] !== undefined) changed[key] = this.envFields[key] })
      return changed
    },
    unsetEnvFields() { return Object.keys(this.originalEnvFields).filter(key => !Object.prototype.hasOwnProperty.call(this.envFields, key)).map(key => [key]) },
    addCustomEnv() { this.customEnv.push({ clientId: `env-${++this.customEnvSequence}`, key: "", value: "", deleted: false, isNew: true }); this.markEnvDirty() },
    removeCustomEnv(item, index) { if (item.isNew) this.customEnv.splice(index, 1); else item.deleted = true; this.markEnvDirty() },
    restoreCustomEnv(item) { item.deleted = false; this.markEnvDirty() },
    validateCustomEnv() {
      const active = this.customEnv.filter((item) => !item.deleted)
      const keys = active.map((item) => item.key.trim())
      if (keys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))) return "变量名称只能包含字母、数字和下划线，且不能以数字开头。"
      if (new Set(keys.map((key) => key.toLowerCase())).size !== keys.length) return "自定义环境变量名称不能重复。"
      return ""
    },
    markEnvDirty() { this.customEnvError = this.validateCustomEnv(); setDirtyState("environment-configuration", this.envChangeCount > 0) },
    async saveEnv() {
      if (this.saving) return
      const fields = this.changedEnvFields()
      this.customEnvError = this.validateCustomEnv()
      if (this.customEnvError) { this.envCategory = "custom"; this.envSearch = ""; return }
      const customOperations = this.customOperations
      const unsetFields = this.unsetEnvFields()
      if (!Object.keys(fields).length && !customOperations.length && !unsetFields.length) return this.$message.info("没有需要保存的环境配置。")
      this.envIssues = this.envDescriptors.filter(field => !field.readonly_reason).flatMap(field => validateField(this.envFields[field.key], field.schema, field.schema["x-root-schema"] || field.schema, field.key))
      if (this.envIssues.length) { this.focusEnvironmentIssue(); return this.$message.warning("请修正环境配置中的错误") }
      this.saving = "env"
      const submittedFields = JSON.stringify(this.envFields)
      const submittedCustom = JSON.stringify(this.customEnv)
      try {
        const response = await this.putRequest(`${this.$root.prefix}/system/configuration/files/env`, { expected_revision: this.envRevision, fields, custom_operations: customOperations, unset_fields: unsetFields })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") {
          const fieldsDraft = this.envFields
          const customDraft = this.customEnv
          await this.loadSummary("env")
          if (JSON.stringify(fieldsDraft) !== submittedFields) this.envFields = fieldsDraft
          if (JSON.stringify(customDraft) !== submittedCustom) this.customEnv = customDraft
          this.markEnvDirty()
        }
        await handleApplyResult(this, response, {
          returnRoute: "/system",
        })
      } catch (error) { this.envIssues = apiErrorIssues(error); this.focusEnvironmentIssue(); this.$message.error(apiErrorDetail(error, "保存失败")) }
      finally { this.saving = "" }
    },
    async saveSimple() {
      if (this.saving) return
      const changes = this.simpleChanges
      if (!Object.keys(changes).length) return this.$message.info("没有需要保存的配置。")
      this.pluginIssues = changeIssues(this.groups, changes)
      if (this.pluginIssues.length) {
        const group = this.activeGroups.find(item => String(this.pluginIssues[0].path).startsWith(`${item.module}.`))
        if (group) this.selectedGroup = group.module
        this.focusIssue()
        return this.$message.warning("请修正配置中的错误")
      }
      this.saving = "simple"
      try {
        const response = await saveSimpleConfig(this, this.simpleRevision, changes)
        if (response.data?.apply_mode !== "failed") {
          this.simpleRevision = response.data.revision
          markSaved(this.groups, changes)
        }
        await handleApplyResult(this, response, {
          returnRoute: "/system",
        })
      } catch (error) { this.pluginIssues = apiErrorIssues(error); this.focusIssue(); this.$message.error(apiErrorDetail(error, "保存失败")) }
      finally { this.saving = "" }
    },
    async loadRaw(file) {
      if (this.saving || this.rawLoading) return
    if (this.rawContent !== this.rawOriginal && !await this.confirmDiscard("配置原文中的未保存修改将被放弃。")) return
      this.rawLoading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/configuration/files/${file}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.rawFile = file; this.rawError = ""; this.rawIssues = []
        this.rawContent = response.data.content; this.rawOriginal = response.data.content; this.rawRevision = response.data.revision; this.$set(this.rawLoaded, file, true); clearDirtyState("raw-configuration")
      } catch (error) { this.rawError = apiErrorDetail(error, "配置文件读取失败。") }
      finally { this.rawLoading = false }
    },
    async validateRaw() {
      if (!this.rawReady) return
      this.validating = true; this.rawError = ""; this.rawIssues = []
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/configuration/validate`, { file: this.rawFile, content: this.rawContent })
        if (!response.suc) throw new Error(response.info)
        this.$message.success("配置语法检查通过。")
      } catch (error) { this.rawIssues = apiErrorIssues(error); this.rawError = apiErrorDetail(error, "配置校验失败。") }
      finally { this.validating = false }
    },
    async saveRaw() {
      if (!this.rawReady || this.saving) return
      this.saving = "raw"; this.rawError = ""; this.rawIssues = []
      const content = this.rawContent
      try {
        const response = await this.putRequest(`${this.$root.prefix}/system/configuration/files/${this.rawFile}`, { expected_revision: this.rawRevision, content: this.rawContent })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") { this.rawRevision = response.data.revision; this.rawOriginal = content; setDirtyState("raw-configuration", this.rawContent !== content) }
        await handleApplyResult(this, response, {
          returnRoute: "/system",
        })
      } catch (error) { this.rawIssues = apiErrorIssues(error); this.rawError = apiErrorDetail(error, "保存失败。"); if (error.response?.status === 409) this.$set(this.rawLoaded, this.rawFile, false) }
      finally { this.saving = "" }
    },
  },
  watch: {
    section(value) { if (value === "raw" && !this.rawLoaded[this.rawFile]) this.loadRaw(this.rawFile) },
    simpleChanges(value) { setDirtyState("plugin-configuration", Boolean(Object.keys(value).length)) },
    envFields: { deep: true, handler() { this.markEnvDirty() } },
    customEnv: { deep: true, handler() { this.markEnvDirty() } },
    rawContent(value) { setDirtyState("raw-configuration", Boolean(this.rawReady && value !== this.rawOriginal)) },
  },
}
</script>

<style scoped>
.configuration-center { min-height:420px; padding:24px; border-radius:16px; max-width:1600px; margin:0 auto; background:var(--bg-color-secondary,#fff); box-sizing:border-box; }.configuration-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }.configuration-toolbar h2 { margin: 0; font-size: 20px; }.configuration-toolbar p { margin: 5px 0 0; color: var(--text-color-secondary); }
.field-help { margin-top: 5px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }.plugin-config-workbench { display: grid; height: clamp(360px, calc(100vh - 370px), 680px); grid-template-columns: 230px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--border-color); border-radius: 8px; }.config-groups { display: flex; min-width: 0; flex-direction: column; gap: 4px; padding: 14px; overflow-y: auto; border-right: 1px solid var(--border-color); }.config-groups .el-input { margin-bottom: 8px; }.config-groups button { display: flex; min-height: 54px; flex-direction: column; justify-content: center; padding: 7px 9px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.config-groups button:hover { background: var(--bg-color-hover); }.config-groups button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.config-groups button strong, .config-groups button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.config-groups button span { margin-top: 3px; color: var(--text-color-secondary); font-size: 11px; }.current-config-group { display: flex; min-width: 0; min-height: 0; flex-direction: column; padding: 18px 20px 0; }.config-form-scroll { min-height: 0; flex: 1; padding-right: 5px; overflow-y: auto; }.group-heading { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color-light); }.group-heading h3 { margin: 0; font-size: 18px; }.group-heading p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; }.group-empty, .current-config-empty { color: var(--text-color-secondary); text-align: center; }.group-empty { padding: 24px 4px; }.current-config-empty { display: grid; place-content: center; }.current-config-empty i { font-size: 36px; }

.plaintext-warning { margin: 8px 0; }
.action-bar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color-secondary); }.config-action-bar { position: static; flex: none; margin-top: 8px; }.action-bar span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.raw-switch { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 10px; }.raw-editor ::v-deep textarea { font-family: Consolas, "Courier New", monospace; font-size: 13px; line-height: 1.55; }.inline-error { margin-top: 8px; color: var(--el-color-danger); }
.validation-issues { margin: 10px 0 0; padding: 10px 14px 10px 34px; border: 1px solid rgba(224,82,96,.35); border-radius: 6px; color: var(--danger-color); background: rgba(224,82,96,.06); }.validation-issues li { margin: 4px 0; line-height: 1.55; }.validation-issues code { margin-right: 8px; }
.custom-env-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }.custom-env-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; }.custom-env-row { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(220px, 1.4fr) auto auto auto; align-items: center; gap: 9px; }.custom-env-row.deleted { opacity: .58; }.custom-env-empty { padding: 8px 0 20px; color: var(--text-color-secondary); text-align: center; }
@media (max-width: 760px) { .configuration-toolbar, .custom-env-heading { align-items: flex-start; flex-direction: column; }.custom-env-row { grid-template-columns: 1fr auto; }.custom-env-row > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }.plugin-config-workbench { grid-template-columns: 1fr; }.config-groups { display: grid; max-height: 240px; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow-y: auto; border-right: 0; border-bottom: 1px solid var(--border-color); }.config-groups .el-input { grid-column: 1 / -1; }.current-config-group { padding: 14px; }.group-heading { align-items: flex-start; flex-direction: column; }.raw-switch { gap: 10px; } }
</style>

<style scoped>
.network-action-bar { position: static; }
@media (max-width: 760px) {
  .plugin-config-workbench { height: auto; }
  .config-form-scroll { max-height: 70vh; }
}
</style>

<style scoped>
.configuration-center { container-type:inline-size; min-width:0; }



.configuration-toolbar, .action-bar, .group-heading { min-width:0; flex-wrap:wrap; }
.config-form-scroll { overflow:visible; }
.plugin-config-workbench { height:auto; min-height:360px; overflow:visible; }
.config-groups { max-height:70vh; }
.current-config-group { padding-bottom:16px; }
.group-category, .orphan-groups, .group-empty { grid-column:1 / -1; }.group-category { margin:10px 4px 2px; color:var(--text-color-secondary); font-size:12px; font-weight:500; }
.unsaved-dot { display:inline-block; width:6px; height:6px; margin-left:6px; border-radius:50%; background:var(--primary-color); vertical-align:middle; }
.current-config-group pre { max-width:100%; white-space:pre-wrap; overflow-wrap:anywhere; }









.sensitive-config-line, .override-note { margin:0; color:var(--text-color-secondary); font-size:12px; line-height:1.5; }
.sensitive-config-line i, .override-note i { margin-right:5px; }
.override-note { color:var(--warning-color); }
.orphan-groups { margin-top:8px; border:0; }
.orphan-groups ::v-deep .el-collapse-item__header { height:auto; min-height:34px; padding:6px 8px; border:1px solid var(--border-color-light); border-radius:5px; color:var(--text-color-secondary); background:var(--bg-color-secondary); line-height:1.4; }
.orphan-groups ::v-deep .el-collapse-item__wrap { border:0; background:transparent; }
.orphan-groups ::v-deep .el-collapse-item__content { padding:4px 0 0; }
.orphan-groups button { width:100%; }
.orphan-config-panel .el-alert { margin-bottom:14px; }
.orphan-preview { margin:14px 0 0; padding:14px; border:1px solid var(--border-color-light); border-radius:6px; background:var(--bg-color); color:var(--text-color); white-space:pre-wrap; overflow-wrap:anywhere; }
@container (max-width:760px) {  .plugin-config-workbench { grid-template-columns:1fr; } .config-groups { max-height:180px; } .custom-env-row { grid-template-columns:minmax(0,1fr); } }
@media(max-width:760px) {  .config-form-scroll { max-height:none; } .custom-env-row { grid-template-columns:minmax(0,1fr); } .custom-env-row > :nth-child(2) { grid-column:auto; grid-row:auto; }   }
</style>

<style scoped>
.configuration-connection { display:flex; align-items:center; gap:16px; justify-content:space-between; padding:8px 0 14px; color:var(--text-color-secondary); font-size:12px; }.configuration-connection details { min-width:0; }.configuration-connection summary { cursor:pointer; }.environment-source { font-size:12px; color:var(--text-color-secondary); margin:4px 0 18px; overflow-wrap:anywhere; }.environment-source code { margin-left:8px; }.field-effect { font-size:11px; color:var(--text-color-secondary); margin-top:8px; }.changed-indicator { color:var(--primary-color,#5c83d6); }.setting-runtime { display:flex; flex-wrap:wrap; gap:4px 9px; margin-top:12px; font-size:11px; color:var(--text-color-secondary); line-height:1.6; }.setting-runtime > span { flex:none; }.setting-runtime code { min-width:0; overflow-wrap:anywhere; font-family:inherit; }.setting-status-note { font-size:11px; color:var(--warning-color,#b78236); line-height:1.6; margin:6px 0 0; }.category-empty { padding:40px 0; color:var(--text-color-secondary); font-size:13px; }.custom-env-section { min-width:0; }.custom-env-section .custom-env-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; padding:18px 0; }.custom-env-section .custom-env-row .el-tag { display:none; }@media(max-width:768px) { .configuration-connection { align-items:flex-start; flex-wrap:wrap; }.custom-env-section .custom-env-row { grid-template-columns:minmax(0,1fr); } }
</style>

<style scoped>
.setting-status-note.neutral { color:var(--text-color-secondary); }
@media (max-width: 767px) {
  .configuration-center { padding:0; border-radius:0; background:transparent; }
  .configuration-center ::v-deep .settings-workspace { padding:12px; }
  .configuration-center ::v-deep .settings-content { padding:0 0 12px; }
  .configuration-center ::v-deep .settings-save { flex-wrap:nowrap; gap:6px; margin-top:16px; padding:8px 10px; border-radius:10px; }
  .configuration-center ::v-deep .settings-save .save-description { flex:1 1 auto; min-width:0; font-size:11px; line-height:1.4; }
  .configuration-center ::v-deep .settings-save .save-description > * { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .configuration-center ::v-deep .settings-save .el-button, .action-bar .el-button { flex:none; margin-left:0; padding:8px 12px; font-size:12px; }
  .action-bar { flex-wrap:nowrap; gap:6px; padding:8px 0; }
  .action-bar span { min-width:0; flex:1 1 auto; font-size:11px; line-height:1.4; }
}
</style>
