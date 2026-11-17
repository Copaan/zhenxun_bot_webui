<template>
  <section class="dsh-connection" aria-label="DSH 连接方式与配置">
    <div class="connection-heading"><h3>连接方式与配置</h3><el-button size="small" :disabled="disabled || saving || loading || !available" :loading="loading" @click="refresh">重新读取配置</el-button></div>
    <p class="muted">这里切换的是 DSH 桌面端 / SDK，不是“本地 Agent / DSH”。保存只修改 DSH 连接配置，不会自动启用 AI、切换聊天执行器、启动宿主或迁移会话。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="notice" :title="notice" type="info" :closable="false" show-icon />
    <el-form v-if="loaded" label-position="top" size="small" :disabled="disabled || saving || loading || !available" @submit.native.prevent="save">
      <el-form-item label="DSH 连接方式">
        <el-radio-group v-model="draft.transport"><el-radio-button label="desktop">桌面端 Desktop</el-radio-button><el-radio-button label="sdk">独立 SDK（含 Linux）</el-radio-button></el-radio-group>
        <p class="muted">已保存：{{ savedTransport === 'sdk' ? '独立 SDK' : '桌面端' }}<span v-if="dirty"> · 当前修改尚未保存</span></p>
      </el-form-item>
      <div v-if="draft.transport === 'desktop'" class="connection-fields">
        <el-form-item label="桌面地址 desktop_url"><el-input v-model.trim="draft.desktop_url" placeholder="留空自动发现，例如 http://127.0.0.1:端口" clearable /><small>只能连接运行 Bot 的同一台机器上的回环地址，不是浏览器所在电脑的 localhost。</small></el-form-item>
        <el-form-item label="桌面数据目录 home"><el-input v-model.trim="draft.home" placeholder="留空使用运行 Bot 用户的 .dsh 目录" clearable /><small>桌面版需要已启动并登录；这里不填写模型 API Key，也不会修改桌面默认模型。</small></el-form-item>
      </div>
      <div v-else class="connection-fields">
        <el-form-item label="SDK 程序 sdk_bin"><el-input v-model.trim="draft.sdk_bin" placeholder="dsh，或 Bot 所在机器上的可执行文件完整路径" /><small>需要自行安装 SDK；保存配置不会下载安装，也不会执行这里填写的程序。</small></el-form-item>
        <el-form-item label="SDK 数据目录 sdk_home"><el-input v-model.trim="draft.sdk_home" placeholder="留空使用真寻专用 SDK 目录" clearable /><small>填写服务器路径，不是浏览器本地路径；不要和桌面端共用数据目录。</small></el-form-item>
        <el-form-item label="已有 DeepSeek 服务商 sdk_provider"><el-input v-model.trim="draft.sdk_provider" placeholder="AI 配置中已保存的官方 DeepSeek 服务商名称" clearable /><small>不是 API Key。留空仅在恰好一个官方 DeepSeek 服务商可用时自动选择；密钥在“AI 配置”中维护。</small></el-form-item>
        <el-form-item label="新会话默认模型 sdk_model"><el-input v-model.trim="draft.sdk_model" placeholder="留空使用服务商第一个启用的模型" clearable /><small>填写所选服务商中已启用的模型名称，不带“服务商/”前缀。</small></el-form-item>
        <el-form-item label="新会话思考等级 sdk_thinking"><el-input v-model.trim="draft.sdk_thinking" placeholder="留空跟随 SDK；填写当前 SDK 支持的值" clearable /><small>继承已有会话时保留原会话的模型、思考等级和模式。</small></el-form-item>
      </div>
      <div class="connection-fields">
        <el-form-item label="单轮超时（秒）"><el-input-number v-model="draft.timeout" :min="10" :max="1800" :precision="0" controls-position="right" /></el-form-item>
        <el-form-item label="允许已授权超管使用 DSH 原生 Agent"><el-switch v-model="draft.allow_tools" /><small>仍需满足真寻的超管身份、Agent 开关和人设规则；普通聊天不会获得宿主工具。</small></el-form-item>
      </div>
      <p class="muted">切换模式会保留两边已保存的配置和会话，不自动回退。已有任务不会迁移；旧 SDK 宿主不会因为保存配置而被停止，切换前请自行确认当前任务。</p>
      <div class="connection-actions"><el-button type="primary" :loading="saving" :disabled="disabled || loading || !available || !dirty || uncertain" native-type="submit">保存连接配置</el-button><el-button :disabled="saving || disabled || !available" @click="$emit('configure')">聊天执行器与其他设置</el-button></div>
    </el-form>
  </section>
</template>

<script>
import { saveSimpleConfig } from "@/components/config/simple-config"
import { apiErrorDetail } from "@/utils/api-error"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"

const KEYS = ['transport', 'desktop_url', 'home', 'sdk_bin', 'sdk_home', 'sdk_provider', 'sdk_model', 'sdk_thinking', 'timeout', 'allow_tools']
const QUIET = { suppressErrorToast: true }
const copy = value => JSON.parse(JSON.stringify(value))
export default {
  name: 'DSHConnection',
  props: { disabled: Boolean },
  data: () => ({ loaded: false, loading: false, saving: false, disposed: false, seq: 0, available: false, ownerToken: '', revision: '', original: {}, baseline: '', draft: {}, error: '', notice: '', uncertain: false }),
  computed: {
    dirty() { return this.loaded && JSON.stringify(this.draft) !== this.baseline },
    savedTransport() { return this.baseline ? JSON.parse(this.baseline).transport : '' },
  },
  watch: { dirty(value) { setDirtyState('dsh-connection', value) } },
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
    invalidate() { this.seq++; this.loading = false; this.available = false },
    expire() { this.invalidate(); this.loaded = false; this.original = {}; this.draft = {}; this.baseline = ''; this.revision = ''; this.ownerToken = ''; this.uncertain = false; clearDirtyState('dsh-connection') },
    visibility() { if (document.hidden) this.invalidate(); else this.resume() },
    resume() {
      if (this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      if (this.ownerToken && this.ownerToken !== getAuthToken()) this.expire()
      this.available = true
      if (!this.dirty && !this.saving) this.load()
    },
    guard() {
      const seq = ++this.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      return () => !this.disposed && !document.hidden && seq === this.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken() && !isBusinessNetworkFrozen()
    },
    async refresh() {
      if (!this.available || this.loading || this.saving || this.disabled) return
      const current = this.guard()
      if (this.dirty) {
        this.loading = true
        try { await this.$confirm('重新读取将放弃当前未保存草稿，采用服务器上的连接配置。', '重新读取 DSH 配置', { type: 'warning' }) } catch (_) { return }
        finally { if (current()) this.loading = false }
      }
      if (current()) return this.load()
    },
    async load() {
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
        this.original = copy(original); this.draft = Object.fromEntries(KEYS.map(key => [key, effective[key]])); this.baseline = JSON.stringify(this.draft)
        this.revision = response.data.config_revision; this.ownerToken = getAuthToken(); this.loaded = true; this.available = true; this.error = ''; this.notice = ''; this.uncertain = false
        clearDirtyState('dsh-connection')
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '读取 DSH 配置失败，请重试。') }
      finally { if (current()) this.loading = false }
    },
    validate() {
      if (!['desktop', 'sdk'].includes(this.draft.transport)) throw new Error('请选择桌面端或 SDK。')
      if (KEYS.filter(key => !['timeout', 'allow_tools'].includes(key)).some(key => typeof this.draft[key] !== 'string')) throw new Error('连接地址、路径、服务商、模型和思考等级必须是文本。')
      if (!Number.isInteger(this.draft.timeout) || this.draft.timeout < 10 || this.draft.timeout > 1800) throw new Error('单轮超时需为 10 至 1800 秒的整数。')
      if (typeof this.draft.allow_tools !== 'boolean') throw new Error('Agent 选项必须为开关。')
      if (this.draft.transport === 'sdk' && !this.draft.sdk_bin?.trim()) throw new Error('请填写 SDK 程序名称或路径。')
      if (this.draft.transport === 'desktop' && this.draft.desktop_url) {
        let url
        try { url = new URL(this.draft.desktop_url) } catch (_) { throw new Error('桌面地址格式不正确。') }
        if (!/^http:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]):[1-9]\d{0,4}\/?$/.test(this.draft.desktop_url) || url.username || url.password || url.search || url.hash) throw new Error('桌面地址必须是带端口的本机回环 HTTP 地址，不要填写凭据、路径、查询参数或外部服务器。')
      }
    },
    async save() {
      if (this.disabled || this.saving || this.loading || !this.loaded || !this.dirty || this.uncertain || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken() || this.ownerToken !== getAuthToken()) return
      try { this.validate() } catch (error) { this.error = error.message; return }
      const current = this.guard(), snapshot = copy(this.draft), previous = JSON.parse(this.baseline), value = copy(this.original)
      for (const key of KEYS) if (snapshot[key] !== previous[key]) value[key] = snapshot[key]
      this.saving = true; this.error = ''; this.notice = ''; this.$emit('saving', true)
      let saved = false
      try {
        const response = await saveSimpleConfig(this, this.revision, { ai_chat: { DSH: value } })
        if (!current()) { if (this.ownerToken === getAuthToken()) this.uncertain = true; return }
        notifyRestartStatusChanged()
        if (response.data?.apply_mode === 'failed') throw new Error(response.info || '配置应用失败，保留草稿。')
        if (!response.data?.revision) throw new Error('保存响应缺少版本，结果待确认。')
        this.original = value; this.baseline = JSON.stringify(snapshot); this.revision = response.data.revision; this.uncertain = false
        this.notice = (response.info || '连接配置已保存。') + ' 保存不代表连接成功，请查看下方后端状态。'
        setDirtyState('dsh-connection', this.dirty); saved = true
      } catch (error) {
        if (current()) { this.error = apiErrorDetail(error, '保存结果未确认，请重新读取，勿重复提交。'); this.uncertain = !error.response || error.response.status >= 500 }
      } finally {
        this.saving = false; this.$emit('saving', false)
        if (saved && current()) this.$emit('saved')
        else if (!this.disposed && this.uncertain) this.notice = '保存结果尚未确认，请重新读取服务器配置后再操作；不会自动重试保存。'
      }
    },
  },
}
</script>

<style scoped>
.dsh-connection { border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; margin: 16px 0 24px; min-width: 0; }
.connection-heading, .connection-actions { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.connection-heading h3 { margin: 0; font-size: 16px; }.connection-actions { justify-content: flex-start; }
.connection-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.muted, small { color: var(--text-color-secondary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }small { display: block; margin-top: 6px; }.el-alert { margin-bottom: 12px; }.el-form { margin-top: 16px; }
@media (max-width: 680px) { .connection-fields { grid-template-columns: minmax(0, 1fr); }.dsh-connection { padding: 12px; }.connection-actions .el-button { margin: 0; } }
</style>
