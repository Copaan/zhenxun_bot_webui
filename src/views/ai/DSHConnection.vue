<template>
  <section class="dsh-connection" aria-label="DSH 连接配置">
    <el-form v-if="loaded" label-position="top" size="small" :disabled="formDisabled" @submit.native.prevent="save">
      <div class="transport-options" role="radiogroup" aria-label="连接方式">
        <button v-for="item in transports" :key="item.value" type="button" role="radio" :aria-checked="String(draft.transport === item.value)" :class="['transport-option', { 'is-active': draft.transport === item.value }]" :disabled="formDisabled" @click="draft.transport = item.value">
          <i :class="['option-icon', item.icon]" /><span class="option-text"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><i v-if="draft.transport === item.value" class="el-icon-success option-check" />
        </button>
      </div>
      <template v-if="draft.transport === 'sdk'">
        <div :class="['sdk-install', 'is-' + installTone]" aria-live="polite">
          <span class="install-icon"><i :class="installIcon" /></span>
          <div class="install-body"><div class="install-title"><strong>{{ installLabel }}</strong><el-tag v-if="sdkInfo && sdkInfo.version" size="mini" effect="plain">v{{ sdkInfo.version }}</el-tag></div><p>{{ sdkInfo && sdkInfo.message || '正在读取安装状态…' }}</p></div>
          <div class="install-actions"><el-button v-if="sdkInfo && sdkInfo.installed && draft.sdk_bin !== sdkInfo.path" type="text" @click="useManaged">使用已安装版本</el-button><el-button v-if="sdkInfo && sdkInfo.active" :loading="sdkBusy" @click="cancelInstall">取消安装</el-button><el-button v-else :type="sdkInfo && !sdkInfo.installed ? 'primary' : 'default'" :plain="Boolean(sdkInfo && !sdkInfo.installed)" :loading="sdkBusy || sdkLoading" :disabled="!sdkInfo || !sdkInfo.can_install || installUncertain" @click="install">{{ sdkInfo && sdkInfo.installed ? '修复安装' : '安装 SDK' }}</el-button></div>
          <el-steps v-if="installStep >= 0" :active="installStep" finish-status="success" process-status="finish" simple class="install-steps"><el-step title="检查" /><el-step title="准备环境" /><el-step title="安装" /><el-step title="验证" /></el-steps>
        </div>
        <el-collapse v-if="sdkInfo && (sdkInfo.detail || sdkInfo.cleanup_pending || sdkInfo.retained_environments)" class="install-details"><el-collapse-item title="安装详情"><p v-if="sdkInfo.cleanup_pending">{{ sdkInfo.cleanup_detail || '临时文件或安装进程清理尚未完成，请核对后再操作。' }}</p><p v-if="sdkInfo.retained_environments">保留了 {{ sdkInfo.retained_environments }} 个仍被引用或无法安全删除的旧环境，下次修复安装时会重新核对。</p><pre v-if="sdkInfo.detail" class="install-detail">{{ sdkInfo.detail }}</pre></el-collapse-item></el-collapse>
        <div class="connection-fields">
          <el-form-item label="DeepSeek 服务商"><el-select v-model="draft.sdk_provider" filterable placeholder="选择已保存的服务商" @change="providerChanged"><el-option v-if="providers.length === 1" label="自动选择唯一服务商" value="" /><el-option v-for="provider in providers" :key="provider.name" :label="provider.name" :value="provider.name" /></el-select><small v-if="!providers.length && !sdkLoading" class="field-warning">尚无可用的官方 DeepSeek 服务商。</small></el-form-item>
          <el-form-item label="新会话模型"><el-select v-model="draft.sdk_model" filterable :disabled="!selectedProvider" placeholder="选择模型"><el-option label="使用服务商默认模型" value="" /><el-option v-for="model in models" :key="model" :label="model" :value="model" /></el-select></el-form-item>
        </div>
        <div class="field-foot"><small>SDK 复用此服务商的密钥和模型，使用固定的 DeepSeek 官方 Messages 接口，不使用服务商自定义地址。</small><el-button type="text" icon="el-icon-setting" @click="openAIConfiguration">管理服务商与模型</el-button></div>
      </template>
      <el-collapse v-model="advanced" class="connection-advanced"><el-collapse-item name="settings"><span slot="title" class="advanced-title"><i class="el-icon-s-tools" />高级设置</span>
        <div v-if="draft.transport === 'desktop'" class="connection-fields"><el-form-item label="桌面地址"><el-input v-model.trim="draft.desktop_url" placeholder="留空自动发现" clearable /><small>仅支持 Bot 所在机器上的本机回环地址。</small></el-form-item><el-form-item label="桌面数据目录"><el-input v-model.trim="draft.home" placeholder="留空使用默认目录" clearable /></el-form-item></div>
        <template v-else>
          <el-form-item label="SDK 程序位置"><el-switch v-model="customSdk" active-text="使用自定义 SDK" @change="customChanged" /><el-input v-if="customSdk" v-model.trim="draft.sdk_bin" placeholder="程序完整路径，或 PATH 中的 dsh" /><code v-else class="path-value">{{ draft.sdk_bin || (sdkInfo && sdkInfo.path || '安装完成后自动填写') }}</code></el-form-item>
          <div class="connection-fields"><el-form-item label="SDK 数据目录"><el-input v-model.trim="draft.sdk_home" placeholder="留空使用真寻专用目录" clearable /><small>不要与桌面端共用。</small></el-form-item><el-form-item label="新会话思考等级"><el-input v-model.trim="draft.sdk_thinking" placeholder="留空使用 SDK 默认值" clearable /></el-form-item></div>
        </template>
        <el-form-item label="Agent 权限" class="permission-item"><div class="permission-options" role="radiogroup" aria-label="Agent 权限"><button v-for="item in permissions" :key="item.value" type="button" role="radio" :aria-checked="String(draft.permission === item.value)" :class="['permission-option', { 'is-active': draft.permission === item.value }]" :disabled="formDisabled" @click="draft.permission = item.value"><i :class="item.icon" /><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span></button></div><small v-if="draft.permission === 'full'" class="field-warning">命令直接以 Bot 进程的系统权限运行，且不再请求批准。{{ draft.transport === 'desktop' ? '桌面端的沙箱仍由桌面设置决定，这里只自动批准。' : '' }}</small></el-form-item><div class="connection-fields"><el-form-item label="单轮超时（秒）"><el-input-number v-model="draft.timeout" :min="10" :max="3600" :precision="0" controls-position="right" /><small>等待人工确认的时间不计入。</small></el-form-item><el-form-item label="允许已授权超管使用原生 Agent"><el-switch v-model="draft.allow_tools" /><small v-if="draft.allow_tools" class="field-warning">Agent 跨群和私聊共享上下文，群回复可能涉及此前私聊内容。</small></el-form-item></div>
        <p class="muted">连接不会自动启用 AI 或切换聊天执行器；已有会话的模型和模式保持不变。安装只使用独立目录，不修改 Bot 或桌面依赖。</p>
      </el-collapse-item></el-collapse>
      <div v-if="error || sdkError || notice" class="connection-result" aria-live="polite"><el-alert v-if="error || sdkError" :title="error || sdkError" type="error" :closable="false" show-icon /><el-alert v-else :title="notice" type="success" :closable="false" show-icon /></div>
      <div class="connection-actions"><span v-if="dirty" class="draft-label"><i class="el-icon-edit-outline" />有未保存修改</span><el-button v-if="serverSnapshot" type="text" @click="acceptServer">采用服务器配置</el-button><el-button :disabled="saving || disabled || !available" @click="$emit('configure')">聊天设置</el-button><el-button type="primary" :icon="dirty ? 'el-icon-check' : 'el-icon-connection'" :loading="saving" :disabled="disabled || loading || sdkBusy || !available || uncertain" native-type="submit">{{ dirty ? '保存并连接' : '连接' }}</el-button></div>
    </el-form><el-alert v-else-if="error" :title="error" type="error" :closable="false" show-icon /><p v-else class="muted loading-text"><i class="el-icon-loading" /> 正在读取连接配置…</p>
  </section>
</template>

<script>
import { saveSimpleConfig } from "@/components/config/simple-config"
import { apiErrorDetail } from "@/utils/api-error"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"

const KEYS = ['transport', 'desktop_url', 'home', 'sdk_bin', 'sdk_home', 'sdk_provider', 'sdk_model', 'sdk_thinking', 'timeout', 'permission', 'allow_tools']
const QUIET = { suppressErrorToast: true }
const copy = value => JSON.parse(JSON.stringify(value))
export default {
  name: 'DSHConnection',
  props: { disabled: Boolean },
  data: () => ({ loaded: false, loading: false, saving: false, disposed: false, seq: 0, available: false, ownerToken: '', revision: '', original: {}, baseline: '', draft: {}, error: '', notice: '', uncertain: false, advanced: [], customSdk: false, serverSnapshot: null, sdkInfo: null, sdkLoading: false, sdkBusy: false, sdkError: '', sdkSeq: 0, installUncertain: false }),
  computed: {
    dirty() { return this.loaded && JSON.stringify(this.draft) !== this.baseline },
    formDisabled() { return this.disabled || this.saving || this.loading || !this.available },
    transports: () => [
      { value: 'desktop', label: '桌面端', icon: 'el-icon-monitor', description: '连接 Bot 所在机器上已登录的 DSH 桌面，默认自动发现。' },
      { value: 'sdk', label: '独立 SDK', icon: 'el-icon-box', description: '在独立目录运行 SDK，复用已配置的官方 DeepSeek 服务商。' },
    ],
    permissions: () => [
      { value: 'sandbox', label: '沙箱', icon: 'el-icon-lock', description: '命令在沙箱内运行，越权操作需超管批准，可回复“全部允许”放行本轮。' },
      { value: 'full', label: '完全权限', icon: 'el-icon-unlock', description: '不使用沙箱，所有操作直接执行，不再询问。' },
    ],
    installStep() { return this.sdkInfo?.active ? ({ checking: 0, creating: 1, installing: 2, verifying: 3 })[this.sdkInfo.phase] ?? -1 : -1 },
    installTone() { const info = this.sdkInfo; if (!info) return 'idle'; if (info.active) return 'active'; if (['failed', 'interrupted', 'unavailable'].includes(info.phase)) return 'danger'; return info.installed ? 'success' : 'idle' },
    installIcon() { return { active: 'el-icon-loading', danger: 'el-icon-warning-outline', success: 'el-icon-circle-check', idle: 'el-icon-download' }[this.installTone] },
    providers() { return this.sdkInfo?.providers || [] },
    selectedProvider() { return this.providers.find(item => item.name === this.draft.sdk_provider) || (!this.draft.sdk_provider && this.providers.length === 1 ? this.providers[0] : null) },
    models() { return this.selectedProvider?.models || [] },
    installLabel() { if (!this.sdkInfo) return 'SDK 安装'; return ({ checking: '正在检查环境', creating: '正在准备环境', installing: '正在安装', verifying: '正在验证', stopping: '正在停止安装', failed: '安装失败', cancelled: '安装已取消', interrupted: '安装已中断', unavailable: '状态暂不可确认' })[this.sdkInfo.phase] || (this.sdkInfo.installed ? 'SDK 已安装' : 'SDK 未安装') },
  },
  watch: { dirty(value) { setDirtyState('dsh-connection', value) }, 'draft.transport'(value) { if (value === 'sdk') this.loadSDK(); else { this.sdkSeq++; this.sdkLoading = false; this.stopPoll() } } },
  mounted() {
    this.resume()
    document.addEventListener('visibilitychange', this.visibility)
    window.addEventListener('zhenxun-auth-expired', this.expire)
    this.unlisten = onBusinessNetworkChange(frozen => { if (frozen) this.invalidate(); else this.resume() })
  },
  beforeDestroy() {
    this.disposed = true; this.invalidate(); clearDirtyState('dsh-connection')
    document.removeEventListener('visibilitychange', this.visibility)
    window.removeEventListener('zhenxun-auth-expired', this.expire)
    this.unlisten?.()
  },
  methods: {
    invalidate() { this.seq++; this.sdkSeq++; this.loading = false; this.sdkLoading = false; this.available = false; this.stopPoll() },
    expire() { this.invalidate(); this.loaded = false; this.original = {}; this.draft = {}; this.baseline = ''; this.revision = ''; this.ownerToken = ''; this.uncertain = false; this.sdkInfo = null; this.serverSnapshot = null; clearDirtyState('dsh-connection') },
    visibility() { if (document.hidden) this.invalidate(); else this.resume() },
    resume() {
      if (this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      if (this.ownerToken && this.ownerToken !== getAuthToken()) this.expire()
      this.available = true
      if (!this.saving) { this.load(true); if (this.draft.transport === 'sdk') this.loadSDK() }
    },
    guard() {
      const seq = ++this.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      return () => !this.disposed && !document.hidden && seq === this.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken() && !isBusinessNetworkFrozen()
    },
    async refresh() {
      if (!this.readable() || this.loading || this.saving || this.sdkBusy) return
      this.available = true; await this.load(true); if (this.draft.transport === 'sdk') await this.loadSDK()
    },
    async load(preserve = false) {
      if (this.disposed || document.hidden || this.loading || this.saving || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const current = this.guard(); this.loading = true
      try {
        const response = await this.getRequest(this.$root.prefix + '/plugin/get_plugin', { module: 'ai_chat' }, QUIET)
        if (!current()) return
        if (!response.suc || response.warning) throw new Error(response.warning || response.info)
        const group = (response.data.config_groups || []).find(item => item.module === 'ai_chat')
        const field = group?.fields.find(item => item.key === 'DSH')
        if (!field || !field.default_value || !response.data.config_revision) throw new Error('当前后端没有可编辑的 DSH 配置，请检查 AI 聊天插件是否已加载。')
        const original = field.value == null ? {} : field.value
        if (typeof original !== 'object' || Array.isArray(original)) throw new Error('DSH 配置不是对象，请先在聊天设置中修正。')
        const effective = { ...field.default_value, ...original }
        if (effective.transport === 'sdk') {
          for (const [old, key] of [['bin', 'sdk_bin'], ['api_provider', 'sdk_provider'], ['model', 'sdk_model'], ['reasoning_effort', 'sdk_thinking']]) {
            if (Object.prototype.hasOwnProperty.call(original, old) && !Object.prototype.hasOwnProperty.call(original, key)) effective[key] = original[old]
          }
        }
        const snapshot = { original, draft: Object.fromEntries(KEYS.map(key => [key, effective[key]])), revision: response.data.config_revision }
        if (preserve && this.dirty && JSON.stringify(snapshot.draft) !== JSON.stringify(this.draft)) { this.serverSnapshot = snapshot; this.notice = '已刷新状态，未保存草稿已保留。' }
        else { this.applyConfig(snapshot); this.error = ''; this.notice = '' }
        this.available = true
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '读取 DSH 配置失败，请重试。') }
      finally { if (current()) this.loading = false }
    },
    async openAIConfiguration() {
      if (!this.readable() || this.saving || this.disabled) return
      const provider = this.draft.sdk_provider || this.selectedProvider?.name || ''
      try { await this.$router.push({ path: '/ai', query: { section: 'providers', ...(provider ? { provider } : {}) } }) }
      catch (error) { if (!['NavigationAborted', 'NavigationCancelled', 'NavigationDuplicated'].includes(error?.name)) this.error = apiErrorDetail(error, '无法打开 AI 配置，请重试。') }
    },
    readable() { return !this.disposed && !document.hidden && !isBusinessNetworkFrozen() && hasValidAuthToken() },
    stopPoll() { clearTimeout(this.sdkTimer); this.sdkTimer = null },
    sdkGuard() { const seq = ++this.sdkSeq, epoch = businessNetworkEpoch(), token = getAuthToken(); return () => this.readable() && seq === this.sdkSeq && epoch === businessNetworkEpoch() && token === getAuthToken() },
    applyConfig(snapshot) {
      this.original = copy(snapshot.original); this.draft = copy(snapshot.draft); this.baseline = JSON.stringify(this.draft); this.revision = snapshot.revision; this.ownerToken = getAuthToken(); this.loaded = true; this.uncertain = false; this.serverSnapshot = null
      this.customSdk = Boolean(this.draft.sdk_bin && this.draft.sdk_bin !== 'dsh' && this.draft.sdk_bin !== this.sdkInfo?.path); clearDirtyState('dsh-connection')
    },
    acceptServer() { if (!this.readable() || this.saving || !this.serverSnapshot) return; this.applyConfig(this.serverSnapshot); this.error = ''; this.notice = '已采用服务器配置。' },
    async loadSDK() {
      if (!this.readable() || this.sdkLoading || this.sdkBusy || this.draft.transport !== 'sdk') return
      this.stopPoll(); const current = this.sdkGuard(); this.sdkLoading = true
      try {
        const installing = Boolean(this.sdkInfo?.active)
        const response = await this.getRequest(this.$root.prefix + '/ai/dsh/sdk', null, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.sdkInfo = response.data; this.sdkError = ''; this.installUncertain = false
        if (this.draft.sdk_bin === this.sdkInfo.path) this.customSdk = false
        if (this.sdkInfo.installed && !this.customSdk && (!this.draft.sdk_bin || (installing && !this.sdkInfo.active && this.draft.sdk_bin === 'dsh'))) this.useManaged()
        if (this.sdkInfo.active) this.sdkTimer = setTimeout(() => this.loadSDK(), 2500)
      } catch (error) { if (current()) this.sdkError = apiErrorDetail(error, '安装结果暂不可确认，请刷新；不会重复安装。') }
      finally { if (current()) this.sdkLoading = false }
    },
    useManaged() { if (!this.readable() || !this.loaded || !this.sdkInfo?.installed) return; this.customSdk = false; this.draft.sdk_bin = this.sdkInfo.path },
    customChanged(value) { if (!value) this.useManaged() },
    providerChanged() { if (!this.models.includes(this.draft.sdk_model)) this.draft.sdk_model = '' },
    async install() {
      if (!this.readable() || this.disabled || this.saving || this.sdkBusy || this.installUncertain || !this.sdkInfo?.can_install) return
      const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); const id = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')
      await this.installAction('install', { operation_id: id, expected_operation: this.sdkInfo.operation_id || null })
    },
    async cancelInstall() { if (!this.readable() || this.sdkBusy || !this.sdkInfo?.active) return; await this.installAction('cancel', { operation_id: this.sdkInfo.operation_id }) },
    async installAction(action, payload) {
      const current = this.sdkGuard(); this.stopPoll(); this.sdkBusy = true; this.sdkError = ''; this.installUncertain = true
      try {
        const response = await this.postRequest(this.$root.prefix + '/ai/dsh/sdk/' + action, payload, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.sdkInfo = { ...this.sdkInfo, ...response.data }; this.installUncertain = false
      } catch (error) { if (current()) this.sdkError = apiErrorDetail(error, '安装结果暂不可确认，请刷新后查询。') }
      finally { this.sdkBusy = false; if (current()) await this.loadSDK() }
    },
    validate() {
      if (!['desktop', 'sdk'].includes(this.draft.transport)) throw new Error('请选择桌面端或 SDK。')
      if (KEYS.filter(key => !['timeout', 'allow_tools'].includes(key)).some(key => typeof this.draft[key] !== 'string')) throw new Error('连接地址、路径、服务商、模型和思考等级必须是文本。')
      if (!Number.isInteger(this.draft.timeout) || this.draft.timeout < 10 || this.draft.timeout > 3600) throw new Error('单轮超时需为 10 至 3600 秒的整数。')
      if (!['sandbox', 'full'].includes(this.draft.permission)) throw new Error('请选择 Agent 权限。')
      if (typeof this.draft.allow_tools !== 'boolean') throw new Error('Agent 选项必须为开关。')
      if (this.draft.transport === 'sdk') {
        if (!this.draft.sdk_bin?.trim()) throw new Error('请先安装 SDK，或在高级设置填写自定义程序位置（也可填写 PATH 中的 dsh）。')
        if (!this.selectedProvider || !this.models.length) throw new Error('请选择已配置密钥和启用模型的官方 DeepSeek 服务商。')
        if (this.draft.sdk_model && !this.models.includes(this.draft.sdk_model)) throw new Error('所选模型已不可用，请重新选择。')
      }
      if (this.draft.transport === 'desktop' && this.draft.desktop_url) {
        let url
        try { url = new URL(this.draft.desktop_url) } catch (_) { throw new Error('桌面地址格式不正确。') }
        if (!/^http:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]):[1-9]\d{0,4}\/?$/.test(this.draft.desktop_url) || url.username || url.password || url.search || url.hash) throw new Error('桌面地址必须是带端口的本机回环 HTTP 地址，不要填写凭据、路径、查询参数或外部服务器。')
      }
    },
    async save() {
      if (this.disabled || this.saving || this.loading || this.sdkBusy || !this.loaded || this.uncertain || !this.readable() || this.ownerToken !== getAuthToken()) return
      try { this.validate() } catch (error) { this.error = error.message; return }
      const current = this.guard(), snapshot = copy(this.draft), previous = JSON.parse(this.baseline), value = copy(this.original), changed = this.dirty
      for (const key of KEYS) if (snapshot[key] !== previous[key]) value[key] = snapshot[key]
      this.saving = true; this.error = ''; this.notice = ''; this.$emit('saving', true)
      let saved = !changed, statusRead = false
      try {
        if (changed) {
          const response = await saveSimpleConfig(this, this.revision, { ai_chat: { DSH: value } })
          if (!current()) { if (this.ownerToken === getAuthToken()) this.uncertain = true; return }
          if (response.data?.apply_mode === 'failed') throw new Error(response.info || '配置应用失败。')
          if (!response.data?.revision) throw new Error('保存结果暂不可确认，请刷新。')
          this.original = value; this.baseline = JSON.stringify(snapshot); this.revision = response.data.revision; this.uncertain = false; this.serverSnapshot = null; saved = true
          setDirtyState('dsh-connection', this.dirty); notifyRestartStatusChanged(); this.$emit('saved')
        }
        if (!current()) return
        if (snapshot.transport === 'sdk') {
          const result = await this.postRequest(this.$root.prefix + '/ai/dsh/host/start', { mode: 'chat', expected_settings: snapshot }, QUIET)
          if (!current()) return
          if (!result.suc) throw new Error(result.info)
        }
        statusRead = true
        const result = await this.getRequest(this.$root.prefix + '/ai/dsh/status', null, QUIET)
        if (!current()) return
        if (!result.suc) throw new Error(result.info)
        this.$emit('connected', result.data)
        if (result.data.transport !== snapshot.transport || !result.data.connected) throw new Error(result.data.reason || '尚未连接，请检查 DSH。')
        this.notice = changed ? '配置已保存，连接成功。' : '连接成功。'
      } catch (error) {
        if (current()) { this.error = (saved && changed ? '配置已保存，但连接未完成：' : '') + apiErrorDetail(error, '结果暂不可确认，请刷新后查询。'); if (!saved) this.uncertain = !error.response || error.response.status >= 500 }
        if (current() && saved && !statusRead) {
          try {
            const result = await this.getRequest(this.$root.prefix + '/ai/dsh/status', null, QUIET)
            if (current() && result.suc) this.$emit('connected', result.data)
          } catch (_) { /* 保留连接错误及上次已知状态。 */ }
        }
      } finally { this.saving = false; this.$emit('saving', false) }
    },
  },
}
</script>

<style scoped>
.dsh-connection { min-width: 0; }
.transport-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.transport-option { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 36px 14px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-color-secondary); color: var(--text-color); text-align: left; font: inherit; cursor: pointer; transition: border-color .15s, background-color .15s, box-shadow .15s; }
.transport-option:hover:not(:disabled) { border-color: var(--primary-color); }
.transport-option:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
.transport-option.is-active { border-color: var(--primary-color); background: var(--bg-color-hover); box-shadow: 0 0 0 1px var(--primary-color) inset; }
.transport-option:disabled { cursor: not-allowed; opacity: .6; }
.option-icon { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; background: var(--bg-color); color: var(--primary-color); font-size: 20px; }
.option-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.option-text strong { font-size: 14px; }
.option-text small { margin: 0; }
.option-check { position: absolute; top: 10px; right: 10px; color: var(--primary-color); font-size: 16px; }
.sdk-install { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; padding: 14px 16px; margin-bottom: 18px; border: 1px solid var(--border-color); border-left-width: 3px; border-radius: 10px; background: var(--bg-color-secondary); }
.sdk-install.is-success { border-left-color: var(--success-color); }
.sdk-install.is-active { border-left-color: var(--primary-color); }
.sdk-install.is-danger { border-left-color: var(--danger-color); }
.install-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--bg-color); color: var(--text-color-secondary); font-size: 20px; }
.is-success .install-icon { color: var(--success-color); }
.is-active .install-icon { color: var(--primary-color); }
.is-danger .install-icon { color: var(--danger-color); }
.install-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.install-title strong { font-size: 14px; }
.install-body p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.install-steps { grid-column: 1 / -1; padding: 8px 12px; background: var(--bg-color); }
.install-details { margin: -8px 0 18px; }
.connection-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.connection-fields .el-select { width: 100%; }
.field-foot { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: -6px 0 6px; }
.field-foot small { margin: 0; }
.field-foot .el-button { flex: none; padding: 0; }
.install-actions, .connection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.install-actions .el-button, .connection-actions .el-button { margin: 0; }
.muted, small { color: var(--text-color-secondary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; margin-top: 5px; }
.field-warning { color: var(--warning-color); }
.path-value { display: block; margin-top: 8px; padding: 7px 10px; border-radius: 6px; background: var(--bg-color); color: var(--text-color-secondary); font-size: 12px; overflow-wrap: anywhere; }
.connection-advanced { margin-top: 14px; }
.connection-advanced .el-input { margin-top: 8px; }
.advanced-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.connection-result { margin-top: 14px; }
.connection-result .el-alert { margin: 0; }
.connection-actions { justify-content: flex-end; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-color-light); }
.draft-label { display: inline-flex; align-items: center; gap: 4px; margin-right: auto; color: var(--warning-color); font-size: 12px; }
.install-detail { margin: 6px 0 0; padding: 8px 10px; border-radius: 6px; background: var(--bg-color); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow: auto; font-size: 12px; }
.loading-text { padding: 12px 0; }
@media (max-width: 680px) {
  .transport-options, .connection-fields { grid-template-columns: minmax(0, 1fr); }
  .sdk-install { grid-template-columns: auto minmax(0, 1fr); padding: 12px; }
  .install-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .field-foot { flex-direction: column; gap: 4px; }
  .connection-actions .el-button { flex: 1 1 auto; }
  .draft-label { width: 100%; }
}
.permission-item { margin-bottom: 14px; }
.permission-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; width: 100%; }
.permission-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color); color: var(--text-color-primary); font: inherit; text-align: left; cursor: pointer; transition: border-color .2s, box-shadow .2s; }
.permission-option:hover:not(:disabled) { border-color: var(--primary-color); }
.permission-option.is-active { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color) inset; }
.permission-option:disabled { cursor: not-allowed; opacity: .6; }
.permission-option i { margin-top: 2px; font-size: 16px; color: var(--primary-color); }
.permission-option span { display: flex; flex-direction: column; gap: 2px; line-height: 1.5; }
.permission-option small { color: var(--text-color-secondary); font-size: 12px; }
</style>
