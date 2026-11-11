<template>
  <div class="configuration-center" v-loading="loading">
    <div class="configuration-toolbar">
      <div>
        <p>选择左侧目录调整配置；每项的“生效方式”说明保存后是否需要重启。</p>
      </div>
      <el-button icon="el-icon-refresh" :disabled="Boolean(saving)" @click="reloadSummary">重新加载</el-button>
    </div>

    <div class="configuration-workspace">
      <aside class="configuration-directory">
        <el-input v-model="searchQuery" clearable prefix-icon="el-icon-search" size="small" placeholder="搜索配置名称、键或说明" aria-label="搜索配置" />
        <el-select class="mobile-directory" :value="activeDirectoryKey" placeholder="选择设置项" aria-label="设置目录" @input="selectDirectory">
          <el-option-group v-for="part in directoryParts" :key="part.key" :label="part.title"><el-option v-for="item in part.items" :key="item.key" :value="item.key" :label="item.title" /></el-option-group>
          <el-option label="配置原文" value="raw" /><el-option label="文件管理" value="files" />
        </el-select>
        <nav class="desktop-directory" aria-label="系统设置目录">
          <div v-for="part in directoryParts" :key="part.key" class="directory-part">
            <h3>{{ part.title }}<el-button v-if="part.key === 'orphan' && cleanableGroups.length" type="text" size="mini" :loading="saving === 'cleanup'" :disabled="Boolean(saving)" @click="cleanupGroups(cleanableGroups)">全部清理</el-button></h3>
            <button v-for="item in part.items" :key="item.key" type="button" :class="{ active: activeDirectoryKey === item.key }" :aria-current="activeDirectoryKey === item.key ? 'page' : null" @click="selectDirectory(item.key)"><span>{{ item.title }}</span><small>{{ item.count }}</small><i v-if="item.dirty" class="unsaved-dot" title="有未保存修改" /></button>
          </div>
          <p v-if="noSearchResults" class="directory-empty">没有匹配的配置</p>
          <div class="directory-part"><h3>文件与原文</h3>
            <button type="button" :class="{ active: section === 'raw' }" :aria-current="section === 'raw' ? 'page' : null" @click="selectDirectory('raw')"><span>配置原文</span><i v-if="rawContent !== rawOriginal" class="unsaved-dot" title="有未保存修改" /></button>
            <button type="button" :class="{ active: section === 'files' }" :aria-current="section === 'files' ? 'page' : null" @click="selectDirectory('files')"><span>文件管理</span></button>
          </div>
        </nav>
        <p v-if="draftSummary" class="directory-drafts">{{ draftSummary }}</p>
      </aside>
      <main class="configuration-content">
        <div v-if="noSearchResults" class="configuration-empty">没有匹配的配置，请尝试名称、配置键或说明。</div>
      <div v-show="section === 'env' && !noSearchResults">
        <div class="configuration-connection">
      <details><summary><i class="el-icon-connection"></i> 网络入口<span v-if="networkStatus.network_runtime"> · {{ (networkStatus.network_runtime.scheme || '待确认').toUpperCase() }}</span><span v-if="networkStatus.network_configured && networkStatus.network_configured.pending_restart"> · 待重启</span><span v-if="networkStatus.network_runtime && networkStatus.network_runtime.http_state === 'degraded'"> · 入口降级</span></summary><NetworkStatus :status="networkStatus" /></details>
      <el-button type="text" icon="el-icon-position" @click="$router.push('/network-proxy', () => {}, (error) => $message.error(error.message))">网络代理设置</el-button>
    </div>

        <p class="environment-source">配置来源 <code>{{ envSourceFile }}</code> · 机器人连接在「机器人接入」、数据库与缓存在「数据与缓存」页面设置，插件变量在「自定义变量」中维护</p>
        <div class="environment-content">
          <section v-for="group in envCategories.filter(item => item.key !== 'custom')" v-show="envCategory === group.key" :key="group.key">
            <header class="settings-group-heading"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><el-tag size="mini" type="info">{{ group.count }} 项</el-tag></header>
            <div v-if="!group.fields.length" class="category-empty">此分类暂无配置项</div>
            <template v-for="field in group.fields"><SchemaField v-show="envMatches(field)" :key="field.key" presentation="settings" :value="envFields[field.key]" :schema="field.schema" :root-schema="field.schema['x-root-schema'] || field.schema" :label="envLabel(field)" :path="field.key" :ui="envFieldUi(field)" :query="searchQuery" :readonly-reason="field.readonly_reason || envDisabledReason(field)" :issues="envIssues" @input="setEnvField(field.key, $event)">
              <template #meta><div v-if="envFieldChanged(field.key)" class="field-effect changed-indicator">未保存修改</div></template>
              <template #details><div>生效方式：{{ effectMeta(field.apply_effect).label }}</div><div v-if="field.schema_sources && field.schema_sources.length">来源：{{ field.schema_sources.join('、') }}</div><div v-if="field.external_environment_present">启动环境也声明了此变量，重启时请核对外部环境设置。</div></template>
              <template #status><div v-if="tlsKinds[field.key] && !field.readonly_reason && !envDisabledReason(field)" class="tls-picker"><el-button size="small" icon="el-icon-folder-opened" @click="pickTls(field.key)">选择{{ tlsKinds[field.key] === 'cert' ? '证书' : '私钥' }}文件</el-button><span v-if="tlsFiles[field.key]">{{ tlsFiles[field.key].name }} · 保存时上传</span><span v-else>选择本机文件，保存时上传到 Bot 的 data/web_ui/tls 目录</span></div><div class="setting-runtime"><span>当前运行</span><code>{{ runtimeText(field) }}</code></div><p v-if="field.overridden" class="setting-status-note">当前运行值与启动环境变量一致，和文件设置不同。重启时请同时核对启动环境。</p><p v-else-if="!envFieldChanged(field.key) && envStateText(field)" class="setting-status-note" :class="{ neutral: field.apply_state === 'unknown' }">{{ envStateText(field) }}</p></template>
            </SchemaField></template>
          </section>
          <section v-show="envCategory === 'custom'" class="custom-env-section">
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
          <footer class="action-bar environment-actions"><div class="save-description"><strong>{{ envChangeCount ? envChangeCount + ' 项未保存修改' : '没有未保存的修改' }}</strong><span v-if="envSaveHint" class="save-hint">{{ envSaveHint }}</span></div><el-button :disabled="!envChangeCount || Boolean(saving)" @click="resetEnvironment">撤销修改</el-button><el-button type="primary" :disabled="!envChangeCount || Boolean(customEnvError)" :loading="saving === 'env'" @click="saveEnv">保存环境配置</el-button></footer>
        </div>
        <input ref="tlsInput" type="file" :accept="tlsAccept" hidden @change="tlsSelected" />
      </div>

      <div v-show="section === 'simple' && !noSearchResults">
        <div class="config-callout" role="note">
          <i class="el-icon-info config-callout-icon" aria-hidden="true"></i>
          <div><strong>插件的配置请在「插件列表」中修改</strong><p>打开插件详情即可修改该插件的配置，这里只列出不属于插件列表中插件的配置组。</p></div>
          <el-button size="small" type="primary" plain @click="$router.push('/plugin', () => {}, (error) => $message.error(error.message))">前往插件列表</el-button>
        </div>
        <div class="simple-config-content">
          <section v-if="currentGroup" class="current-config-group">
            <div class="config-form-scroll">
              <ConfigGroupEditor :key="selectedGroup" :group="currentGroup" :query="searchQuery" :issues="pluginIssues" @change="pluginIssues = []" @validity-change="setInvalid" />
            </div>
            <div class="action-bar config-action-bar">
              <span>{{ Object.keys(simpleChanges).length ? `${Object.keys(simpleChanges).length} 个配置组有未保存修改` : "未知配置组和字段会原样保留" }}</span>
              <el-button type="primary" icon="el-icon-check" :loading="saving === 'simple'" :disabled="pluginInvalidCount > 0 || !Object.keys(simpleChanges).length" @click="saveSimple">保存配置</el-button>
            </div>
          </section>
          <section v-else-if="selectedOrphanGroup" class="current-config-group orphan-config-panel">
            <header class="group-heading"><div><h3>{{ selectedOrphanGroup.name }}</h3><p>{{ selectedOrphanGroup.module }} · {{ selectedOrphanGroup.source_status === 'stale' ? '没有插件注册的残留配置' : '文件中保留的未注册配置' }}</p></div><div><el-button size="small" icon="el-icon-document" @click="selectDirectory('raw')">查看配置原文</el-button><el-button v-if="cleanable(selectedOrphanGroup)" size="small" type="danger" plain icon="el-icon-delete" :loading="saving === 'cleanup'" :disabled="Boolean(saving)" @click="cleanupGroups([selectedOrphanGroup])">清理</el-button></div></header>
            <el-alert :title="selectedOrphanGroup.readonly_reason || '该配置组当前没有对应的已加载插件。内容会保留，不会自动写入运行配置。'" type="warning" :closable="false" show-icon />
            <pre class="orphan-preview">{{ JSON.stringify(selectedOrphanGroup.raw_value || Object.fromEntries(selectedOrphanGroup.fields.map(field => [field.key, field.value])), null, 2) }}</pre>
          </section>
          <section v-else class="current-config-empty"><i class="el-icon-setting"></i><p>选择一个配置组开始编辑</p></section>
        </div>
      </div>

      <div v-show="section === 'raw'" v-loading="rawLoading">
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
      </div>
        <div v-if="filesVisited" v-show="section === 'files'" class="file-panel"><FileTable /></div>
      </main>
    </div>

  </div>
</template>

<script>
import FileTable from "@/components/system/FileTable.vue"
import { environmentCategories } from "@/components/config/settings-ui"
import ConfigGroupEditor from "@/components/config/ConfigGroupEditor.vue"
import SchemaField from "@/components/config/SchemaField.vue"
import { fieldMatches, isSecretPath, validateField } from "@/components/config/schema-utils"
import { changeIssues, collectChanges, groupMatches, markSaved, normalizeGroups, saveSimpleConfig } from "@/components/config/simple-config"
import NetworkStatus from "@/components/system/NetworkStatus.vue"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"
import { TLS_ACCEPT, uploadTlsFile } from "@/utils/tls-upload"

export default {
  name: "ConfigurationCenter",
  components: { ConfigGroupEditor, SchemaField, NetworkStatus, FileTable },
  data() {
    return {
      envCategory: "access", networkStatus: {}, rawLoading: false, searchQuery: "", filesVisited: false, rawVisited: false, envIssues: [],
      loading: false, saving: "", validating: false, section: "env", envRevision: "", simpleRevision: "", envFields: {}, originalEnvFields: {}, envDescriptors: [], envSourceFile: "", customEnv: [], originalCustomEnv: [], customEnvError: "", customEnvSequence: 0, groups: [], selectedGroup: "", launcherManaged: false,
      rawFile: "env", rawContent: "", rawOriginal: "", rawRevision: "", rawError: "", rawIssues: [], rawLoaded: {}, pluginInvalid: {}, pluginIssues: [], selectedOrphan: "",
      tlsAccept: TLS_ACCEPT, tlsKinds: { WEBUI_TLS_CERTFILE: "cert", WEBUI_TLS_KEYFILE: "key" }, tlsFiles: {}, tlsPickKey: "",
      envFieldDefinitions: [
        { key: "HOST", label: "监听地址", placeholder: "0.0.0.0", help: "0.0.0.0 允许局域网与公网访问，127.0.0.1 仅本机访问。" },
        { key: "PORT", label: "监听端口", type: "number", placeholder: "8080", help: "WebUI 与适配器共享的本地服务端口；启用 HTTPS 后该端口提供 HTTPS。" },
        { key: "WEBUI_HTTPS_ENABLED", label: "启用 HTTPS", type: "switch", help: "使用用户提供的可信 PEM 证书和私钥，需要重启生效。开启后 OneBot 协议端必须改用 wss:// 连接并信任证书，ws:// 与 HTTP 兼容入口都无法接入。" },
        { key: "WEBUI_TLS_CERTFILE", label: "TLS 证书", placeholder: "C:\\certs\\fullchain.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "选择本机的证书 PEM 文件，保存时自动上传到 Bot；也可以填写 Bot 所在机器上的绝对路径。保存时会检查有效期及与私钥是否匹配。" },
        { key: "WEBUI_TLS_KEYFILE", label: "TLS 私钥", placeholder: "C:\\certs\\privkey.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "选择未加密的私钥 PEM 文件，保存时自动上传到 Bot；也可以填写 Bot 所在机器上的绝对路径。" },
        { key: "WEBUI_HTTP_MODE", label: "HTTP兼容入口", type: "http-mode", dependsOn: "WEBUI_HTTPS_ENABLED", options: [{ value: "serve", label: "完整访问" }, { value: "redirect", label: "跳转HTTPS" }, { value: "disabled", label: "关闭" }], help: "完整访问以明文提供 WebUI 页面、接口和实时连接，不开放适配器等其他服务；跳转HTTPS 把请求 308 跳转到 HTTPS 端口。需要重启生效。" },
        { key: "WEBUI_HTTP_REDIRECT_PORT", label: "HTTP兼容端口", type: "number", dependsOn: "WEBUI_HTTPS_ENABLED", httpModeRequired: true, placeholder: "80", help: "默认80，不能与监听端口相同；端口被占用时HTTPS继续运行，HTTP入口进入降级并自动重试。" },
        { key: "TIMEZONE", label: "时区", placeholder: "Asia/Shanghai", help: "Bot 计算日期与时间使用的 IANA 时区，影响签到、每日额度、定时任务、日志与 AI 获取的当前时间。默认 Asia/Shanghai（北京时间），需要重启生效。" },
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
    activeDirectoryKey() {
      if (this.section === "env") return "env:" + this.envCategory
      if (this.section === "simple") return this.selectedOrphan ? "orphan:" + this.selectedOrphan : "group:" + this.selectedGroup
      return this.section
    },
    directoryParts() {
      const environment = this.envCategories.filter(group => !this.searchQuery.trim() || group.count > 0).map(group => ({ key: "env:" + group.key, title: group.title, count: group.count, dirty: this.environmentGroupDirty(group) }))
      const parts = environment.length ? [{ key: "env", title: "运行配置", items: environment }] : []
      this.groupSections.forEach(part => parts.push({ key: "groups:" + part.key, title: "其他配置 · " + part.title, items: part.groups.map(group => ({ key: "group:" + group.module, title: group.name, count: group.fields.length, dirty: Boolean(this.simpleChanges[group.module]) })) }))
      if (this.filteredOrphanGroups.length) parts.push({ key: "orphan", title: "孤立配置", items: this.filteredOrphanGroups.map(group => ({ key: "orphan:" + group.module, title: group.name, count: group.fields.length })) })
      return parts
    },
    configurationEntries() { return this.directoryParts.flatMap(part => part.items) },
    noSearchResults() { return Boolean(this.searchQuery.trim() && !this.configurationEntries.length && !["raw", "files"].includes(this.section)) },
    draftSummary() {
      const parts = []
      if (this.envChangeCount) parts.push(this.envChangeCount + " 项环境修改")
      if (Object.keys(this.simpleChanges).length) parts.push(Object.keys(this.simpleChanges).length + " 组其他配置")
      if (this.rawContent !== this.rawOriginal) parts.push("配置原文")
      return parts.length ? "未保存：" + parts.join("、") : ""
    },
    envCategories() { return environmentCategories(this.envDescriptors, this.envMatches, this.customSearchCount) },
    customSearchCount() { return this.customEnv.filter(this.customMatches).length },
    envChangeCount() { return Object.keys(this.changedEnvFields()).length + Object.keys(this.tlsFiles).length + this.unsetEnvFields().length + this.customEnv.filter(item => item.isNew || item.deleted || this.originalCustomEnv.find(old => old.key === item.key)?.value !== item.value).length },
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
      const pendingTls = Object.keys(this.tlsFiles).length > 0
      const needsRestart = pendingTls || this.customOperations.length > 0 || changedKeys.some((key) => this.envDescriptors.find(field => field.key === key)?.apply_effect !== "in_place")
      if (!pendingTls && !changedKeys.length && !this.customOperations.length && !Object.keys(this.originalEnvFields).some(key => this.envFields[key] === undefined)) return ""
      if (!needsRestart) return "保存后立即生效"
      return this.launcherManaged ? "包含启动期配置，保存后可确认重启" : "包含启动期配置，保存后需要手动重启"
    },
    rawReady() { return Boolean(this.rawLoaded[this.rawFile] && /^[a-f0-9]{64}$/.test(this.rawRevision)) },
    groupSections() {
      const titles = { plugin: "插件", builtin: "内置功能", core: "真寻" }
      return Object.entries(titles)
        .map(([key, title]) => ({ key, title, groups: this.activeGroups.filter(group => (group.category || "plugin") === key && groupMatches(group, this.searchQuery)).sort((left, right) => left.name.localeCompare(right.name, "zh-CN")) }))
        .filter(part => part.groups.length)
    },
    filteredOrphanGroups() { return this.orphanGroups.filter(group => groupMatches(group, this.searchQuery)) },
    activeGroups() { return this.groups.filter((group) => group.registered !== false && group.source_status !== "orphaned") },
    orphanGroups() { return this.groups.filter((group) => group.registered === false || group.source_status === "orphaned") },
    cleanableGroups() { return this.orphanGroups.filter(this.cleanable) },
    selectedOrphanGroup() { return this.orphanGroups.find((group) => group.module === this.selectedOrphan) || null },
    currentGroup() { return this.activeGroups.find((group) => group.module === this.selectedGroup) || null },
    simpleChanges() { return collectChanges(this.activeGroups) },
    pluginInvalidCount() { return Object.values(this.pluginInvalid).reduce((sum, paths) => sum + paths.length, 0) },
  },
  mounted() { this.loadSummary() },
  beforeDestroy() { clearDirtyState("plugin-configuration"); clearDirtyState("environment-configuration"); clearDirtyState("raw-configuration") },
  methods: {
    /** 选择设置目录中的配置分类或文件入口，保留各区域草稿。 */
    selectDirectory(key) {
      if (key === "raw" || key === "files") { this.searchQuery = ""; this.section = key; return }
      if (key.startsWith("env:")) { this.envCategory = key.slice(4); this.section = "env" }
      else if (key.startsWith("group:")) { this.selectedGroup = key.slice(6); this.selectedOrphan = ""; this.section = "simple" }
      else if (key.startsWith("orphan:")) { this.selectedOrphan = key.slice(7); this.selectedGroup = ""; this.section = "simple" }
    },
    /** 标记环境分类中尚未保存的字段。 */
    environmentGroupDirty(group) {
      if (group.key === "custom") return this.customOperations.length > 0
      return group.fields.some(field => this.envFieldChanged(field.key) || Boolean(this.tlsFiles[field.key]))
    },
    /** 显示错误所在的配置组并定位字段。 */
    focusPluginIssue() {
      const group = this.activeGroups.find(item => String(this.pluginIssues[0]?.path || "").startsWith(item.module + "."))
      if (group) { this.searchQuery = ""; this.selectDirectory("group:" + group.module) }
      this.focusIssue()
    },
    isSecretPath,
    envFieldUi(field) { return { ...this.envMeta(field), description: this.envHelp(field) } },
    envFieldChanged(key) { return JSON.stringify(this.envFields[key]) !== JSON.stringify(this.originalEnvFields[key]) },
    envStateText(field) { return { restart_pending: '已保存，重启 Bot 后生效', applying: '正在应用', unknown: '运行状态未确认' }[field.apply_state] || '' },
    customMatches(item) { return !this.searchQuery.trim() || `${item.key} 自定义变量`.toLowerCase().includes(this.searchQuery.trim().toLowerCase()) },
    resetEnvironment() { this.envFields = JSON.parse(JSON.stringify(this.originalEnvFields)); this.tlsFiles = {}; this.customEnv = this.originalCustomEnv.map(item => ({ ...item })); this.envIssues = []; this.markEnvDirty() },
    focusEnvironmentIssue() { const issue = this.envIssues[0]; if (!issue) return; const group = this.envCategories.find(item => item.fields?.some(field => issue.path === field.key || String(issue.path).startsWith(field.key + '.'))); this.searchQuery = ''; this.selectDirectory('env:' + (group ? group.key : 'custom')); this.focusIssue() },
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
      return fieldMatches(this.searchQuery, `${field.key} ${meta.label || ""} ${meta.help || ""}`, field.schema, this.envFields[field.key], field.schema["x-root-schema"] || field.schema) || this.envIssues.some(issue => String(issue.path || "").startsWith(field.key))
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
        this.tlsFiles = {}
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
        if (["env", "simple"].includes(this.section) && !this.configurationEntries.some(item => item.key === this.activeDirectoryKey) && this.configurationEntries.length) this.selectDirectory(this.configurationEntries[0].key)
      } catch (error) { this.$message.error(error.message || "配置摘要加载失败") }
      finally { this.loading = false }
    },
    setInvalid(module, paths) { if (paths.length) this.$set(this.pluginInvalid, module, paths); else this.$delete(this.pluginInvalid, module) },
    setEnvField(key, value) { if (value === undefined) this.$delete(this.envFields, key); else this.$set(this.envFields, key, value); this.envIssues = this.envIssues.filter(issue => issue.path !== key && !String(issue.path).startsWith(key + ".")); this.markEnvDirty() },
    cleanable(group) { return ["stale", "orphaned"].includes(group.source_status) },
    /**
     * 确认后删除孤立配置组或残留配置项，并重新读取其他配置
     * @param {object[]} groups 要清理的孤立配置组
     */
    async cleanupGroups(groups) {
      if (this.saving || !groups.length) return
      if (Object.keys(this.simpleChanges).length && !await this.confirmDiscard("清理后会重新读取其他配置，未保存的修改将丢失。")) return
      const names = groups.map(group => group.name).join("、")
      try {
        await this.$confirm(`将从 plugins2config.yaml 与 config.yaml 中删除 ${names} 的残留配置，删除后无法恢复。`, "清理孤立配置？", { type: "warning", customClass: "configuration-confirm", confirmButtonText: "清理", cancelButtonText: "取消" })
      } catch (_) { return }
      this.saving = "cleanup"
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/configuration/cleanup`, { expected_revision: this.simpleRevision, modules: [...new Set(groups.map(group => group.module))] })
        if (!response.suc) throw new Error(response.info)
        this.$message.success(response.info || "已清理")
        this.selectedOrphan = ""
      } catch (error) { this.$message.error(apiErrorDetail(error, "清理失败")) }
      finally { this.saving = "" }
      await this.loadSummary("simple")
    },
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
    pickTls(key) { this.tlsPickKey = key; this.$refs.tlsInput.click() },
    tlsSelected(event) {
      const [file] = event.target.files
      event.target.value = ""
      if (!file || !this.tlsPickKey) return
      this.$set(this.tlsFiles, this.tlsPickKey, file)
      this.envIssues = this.envIssues.filter(issue => issue.path !== this.tlsPickKey)
      this.markEnvDirty()
    },
    /**
     * 上传已选择的证书和私钥，并把返回的 Bot 端路径填入对应配置项
     */
    async uploadTlsFiles() {
      for (const [key, file] of Object.entries(this.tlsFiles)) {
        this.setEnvField(key, await uploadTlsFile(this, this.tlsKinds[key], file))
        this.$delete(this.tlsFiles, key)
      }
    },
    async saveEnv() {
      if (this.saving) return
      if (Object.keys(this.tlsFiles).length) {
        this.saving = "env"
        try { await this.uploadTlsFiles() } catch (error) { return this.$message.error(apiErrorDetail(error, "证书上传失败")) } finally { this.saving = "" }
      }
      const fields = this.changedEnvFields()
      this.customEnvError = this.validateCustomEnv()
      if (this.customEnvError) { this.searchQuery = ""; this.selectDirectory("env:custom"); return }
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
        this.focusPluginIssue()
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
      } catch (error) { this.pluginIssues = apiErrorIssues(error); this.focusPluginIssue(); this.$message.error(apiErrorDetail(error, "保存失败")) }
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
    section(value) {
      if (value === "raw" && !this.rawVisited) { this.rawVisited = true; this.loadRaw(this.rawFile) }
      if (value === "files") this.filesVisited = true
    },
    searchQuery(value) {
      if (!value.trim()) return
      if (!this.configurationEntries.some(item => item.key === this.activeDirectoryKey) && this.configurationEntries.length) this.selectDirectory(this.configurationEntries[0].key)
    },
    simpleChanges(value) { setDirtyState("plugin-configuration", Boolean(Object.keys(value).length)) },
    envFields: { deep: true, handler() { this.markEnvDirty() } },
    customEnv: { deep: true, handler() { this.markEnvDirty() } },
    rawContent(value) { setDirtyState("raw-configuration", Boolean(this.rawVisited && value !== this.rawOriginal)) },
  },
}
</script>

<style scoped>
.configuration-center { min-width:0; color:var(--text-color); }
.configuration-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:18px; }.configuration-toolbar p { margin:0; color:var(--text-color-secondary); font-size:12px; line-height:1.6; }
.configuration-workspace { display:grid; grid-template-columns:230px minmax(0,1fr); gap:28px; align-items:start; }.configuration-directory { position:sticky; top:12px; min-width:0; max-height:calc(100vh - 160px); padding-right:16px; overflow-y:auto; border-right:1px solid var(--border-color-light); }.mobile-directory { display:none; }
.directory-part h3 { display:flex; align-items:center; justify-content:space-between; gap:6px; margin:18px 8px 7px; font-size:12px; font-weight:500; color:var(--text-color-secondary); }.directory-part h3 .el-button { width:auto; min-height:0; padding:0; font-size:11px; }.directory-part button { display:flex; align-items:center; gap:8px; width:100%; min-height:38px; padding:9px 10px; border:0; border-radius:6px; font:inherit; font-size:13px; color:var(--text-color); background:transparent; text-align:left; cursor:pointer; }.directory-part button:hover, .directory-part button.active { background:var(--bg-color-hover); }.directory-part button.active { color:var(--primary-color); font-weight:600; }.directory-part button span { flex:1; min-width:0; overflow-wrap:anywhere; }.directory-part button small { flex:none; color:var(--text-color-secondary); font-size:10px; }.directory-part button:focus-visible { outline:2px solid var(--primary-color); outline-offset:-2px; }.unsaved-dot { display:inline-block; flex:none; width:6px; height:6px; border-radius:50%; background:var(--primary-color); }.directory-empty, .directory-drafts { margin:12px 8px; color:var(--text-color-secondary); font-size:12px; line-height:1.6; }.directory-drafts { padding-top:12px; border-top:1px solid var(--border-color-light); }
.configuration-content { min-width:0; }.configuration-empty, .current-config-empty { padding:60px 14px; color:var(--text-color-secondary); text-align:center; font-size:13px; }.configuration-connection { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:12px; color:var(--text-color-secondary); font-size:12px; }.configuration-connection details { min-width:0; }.configuration-connection summary { cursor:pointer; }.environment-source { margin:4px 0 16px; color:var(--text-color-secondary); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }.environment-source code { margin-left:6px; }
.settings-group-heading, .group-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:12px 0 16px; margin-bottom:8px; border-bottom:1px solid var(--border-color-light); }.settings-group-heading > div, .group-heading > div { flex:1; min-width:0; }.settings-group-heading h3, .group-heading h3 { margin:0; font-size:18px; }.settings-group-heading p, .group-heading p { margin:6px 0 0; color:var(--text-color-secondary); font-size:12px; line-height:1.6; }.category-empty { padding:40px 0; color:var(--text-color-secondary); font-size:13px; }
.field-effect { margin-top:8px; font-size:11px; }.changed-indicator { color:var(--primary-color); }.setting-runtime { display:flex; flex-wrap:wrap; gap:4px 9px; margin-top:12px; color:var(--text-color-secondary); font-size:11px; line-height:1.6; }.setting-runtime code { min-width:0; overflow-wrap:anywhere; font-family:inherit; }.setting-status-note { margin:6px 0 0; color:var(--warning-color); font-size:11px; line-height:1.6; }.setting-status-note.neutral { color:var(--text-color-secondary); }
.action-bar { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:10px; position:sticky; bottom:0; z-index:2; margin-top:16px; padding:12px 0; border-top:1px solid var(--border-color-light); background:var(--bg-color); }.action-bar > span, .save-description { margin-right:auto; color:var(--text-color-secondary); font-size:12px; line-height:1.6; }.save-description strong, .save-description .save-hint { display:block; }.save-description strong { color:var(--text-color); font-weight:500; }.action-bar .el-button { margin-left:0; }
.custom-env-list { display:flex; flex-direction:column; gap:10px; }.custom-env-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; align-items:center; gap:9px; padding:14px 0; }.custom-env-row.deleted { opacity:.58; }.custom-env-row .el-tag { display:none; }.custom-env-empty { padding:20px 0; color:var(--text-color-secondary); font-size:12px; }.inline-error { margin:8px 0; color:var(--danger-color); font-size:12px; }.tls-picker { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-top:10px; }.tls-picker span { min-width:0; color:var(--text-color-secondary); font-size:11px; line-height:1.6; overflow-wrap:anywhere; }
.config-callout { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:4px 0 18px; color:var(--text-color); }.config-callout-icon { flex:none; color:var(--primary-color); font-size:18px; }.config-callout > div { flex:1; min-width:0; }.config-callout strong { font-size:13px; }.config-callout p { margin:3px 0 0; color:var(--text-color-secondary); font-size:12px; line-height:1.6; }.current-config-group { min-width:0; }.current-config-group pre { max-width:100%; white-space:pre-wrap; overflow-wrap:anywhere; }.orphan-preview { padding:14px; border:1px solid var(--border-color-light); border-radius:6px; background:var(--bg-color); color:var(--text-color); }
.raw-switch { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:14px 0 10px; }.raw-editor ::v-deep textarea { font:13px/1.55 Consolas,"Courier New",monospace; }.validation-issues { padding:10px 14px 10px 34px; border:1px solid var(--danger-color); border-radius:6px; color:var(--danger-color); font-size:12px; line-height:1.6; }.validation-issues code { margin-right:8px; }.file-panel { min-height:540px; }
@media(max-width:900px) { .configuration-workspace { grid-template-columns:190px minmax(0,1fr); gap:18px; } }
@media(max-width:767px) { .configuration-workspace { grid-template-columns:minmax(0,1fr); gap:18px; }.configuration-directory { position:static; max-height:none; padding:0; border:0; }.mobile-directory { display:block; width:100%; margin-top:10px; }.desktop-directory { display:none; }.directory-drafts { margin:8px 0 0; padding-top:8px; }.custom-env-row { grid-template-columns:minmax(0,1fr); }.action-bar .save-description, .action-bar > span { flex-basis:100%; }.action-bar .el-button { padding:8px 12px; font-size:12px; }.file-panel { min-height:420px; } }
</style>
