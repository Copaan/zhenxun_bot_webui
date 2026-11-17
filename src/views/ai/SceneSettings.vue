<template>
  <section class="scene-settings">
    <p class="scene-id">{{ sceneId }}</p>
    <p>设置属于此账号的群或私聊，聊天、主动插话与目标场景的 AI 计划共同使用；切换历史不会切换配置。</p>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" show-icon />
    <template v-if="state">
      <el-alert v-for="reason in state.blockers" :key="reason" :title="reason" type="warning" :closable="false" />
      <p class="muted">{{ state.policy_note }}</p>
      <el-form label-position="top" size="small" class="scene-grid" :disabled="saving || loading">
        <el-form-item label="场景 AI 开关"><el-select v-model="draft.disabled"><el-option label="跟随基础设置" :value="null" /><el-option label="开启" :value="false" /><el-option label="关闭（计划跳过但不删除）" :value="true" /></el-select><small>有效：{{ state.effective.disabled ? '关闭' : '开启' }} · {{ source('disabled') }}</small></el-form-item>
        <el-form-item label="执行器"><el-select v-model="draft.runner"><el-option label="跟随基础设置" :value="null" /><el-option label="本地 Agent" value="local" /><el-option label="DSH" value="dsh" /></el-select><small>有效：{{ state.effective.runner }} · {{ source('runner') }}</small></el-form-item>
        <el-form-item v-for="field in modelFields" :key="field.key" :label="field.label"><el-select v-model="draft[field.key]" filterable><el-option label="跟随基础设置" :value="null" /><el-option v-for="item in state.models[field.task]" :key="item.id" :label="item.label" :value="item.value || item.id" /></el-select><small>有效：{{ state.effective[field.key] || '未指定，按既有工具配置处理' }} · {{ source(field.key) }}</small><small v-if="route(field).members">适用：{{ route(field).members.join('、') }}<span v-for="item in route(field).excluded || []" :key="item.model"><br />未采用：{{ item.model }} · {{ item.reason }}</span></small></el-form-item>
        <el-form-item label="人设"><el-select v-model="draft.persona_id" filterable><el-option label="跟随绑定或默认人设" :value="null" /><el-option v-for="item in personas.filter(p => p.enabled)" :key="item.id" :value="item.id" :label="item.name" /></el-select><small>有效：{{ personaName(state.effective.persona_id) }} · {{ source('persona_id') }}</small></el-form-item>
        <el-form-item label="敏感 Agent 能力"><el-select v-model="draft.agent"><el-option label="跟随基础设置" :value="null" /><el-option label="允许已授权超管使用" :value="true" /><el-option label="关闭" :value="false" /></el-select><small>不提升普通用户权限，不关闭独立原生宿主。</small></el-form-item>
      </el-form>
      <el-alert v-if="state.capabilities.native_selection_preserved" title="DSH 保留原生会话的模型、思考等级和模式；这里的本地聊天模型仅供 local 使用。DSH 语音输入尚未接入，STT 选择不会伪装成已生效。" type="info" :closable="false" />
      <p>选择 TTS 不会自动开启语音回复；输出方式仍由原语音回复设置决定。路由组仅使用适合当前任务的成员，不改变失败重试策略。</p>
    </template>
    <div class="scene-actions"><el-button size="small" :disabled="saving" :loading="loading" @click="refresh">刷新</el-button><el-button size="small" :disabled="saving || !state" @click="inherit">全部恢复继承</el-button><el-button size="small" type="primary" :loading="saving" :disabled="!state || !dirty || loading" @click="save">保存场景设置</el-button></div>
  </section>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

const empty = () => ({ model: null, persona_id: null, tts: null, stt: null, disabled: null, runner: null, agent: null })
const QUIET = { suppressErrorToast: true }
export default {
  name: "SceneSettings",
  props: { sceneId: { type: String, required: true }, personas: { type: Array, default: () => [] } },
  data: () => ({ state: null, draft: empty(), original: "", error: "", loading: false, saving: false, seq: 0, disposed: false, modelFields: [{ key: 'model', task: 'chat', label: '本地聊天模型／路由组' }, { key: 'tts', task: 'tts', label: '语音合成 TTS' }, { key: 'stt', task: 'stt', label: '语音识别 STT' }] }),
  computed: { dirty() { return JSON.stringify(this.draft) !== this.original } },
  watch: { sceneId() { this.invalidate(); this.state = null; this.original = ""; this.draft = empty(); this.load() } },
  mounted() {
    this.load()
    document.addEventListener('visibilitychange', this.visibility)
    window.addEventListener('zhenxun-auth-expired', this.invalidate)
    this.unlisten = onBusinessNetworkChange(frozen => { if (frozen) this.invalidate(); else this.load() })
  },
  beforeDestroy() {
    this.disposed = true; this.invalidate()
    document.removeEventListener('visibilitychange', this.visibility)
    window.removeEventListener('zhenxun-auth-expired', this.invalidate)
    this.unlisten?.()
  },
  methods: {
    invalidate() { this.seq++; this.loading = false },
    visibility() { if (document.hidden) this.invalidate(); else this.load() },
    route(field) { const value = this.draft[field.key] || this.state.effective[field.key]; return this.state.models[field.task].find(item => (item.value || item.id) === value) || {} },
    source(key) { return this.state.sources[key] === 'scene' ? '此场景覆盖' : '继承基础设置' },
    personaName(id) { return this.personas.find(p => p.id === id)?.name || (id ? String(id) : '内置默认') },
    url() { return this.$root.prefix + '/ai/chat/scenes/' + encodeURIComponent(this.sceneId) + '/settings' },
    guard() {
      const seq = ++this.seq, epoch = businessNetworkEpoch(), token = getAuthToken(), scene = this.sceneId
      return () => !this.disposed && !document.hidden && !isBusinessNetworkFrozen() && hasValidAuthToken() && seq === this.seq && scene === this.sceneId && epoch === businessNetworkEpoch() && token === getAuthToken()
    },
    apply(state) { this.state = state; this.draft = { ...empty(), ...state.overrides }; this.original = JSON.stringify(this.draft); this.error = "" },
    async load(force = false) {
      if (this.disposed || this.loading || this.saving || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const current = this.guard(); this.loading = true
      try {
        const response = await this.getRequest(this.url(), null, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        if (this.state && this.dirty && !force) { if (this.state.revision !== response.data.revision) this.error = '场景设置已在别处变化，草稿保留；刷新后再编辑。'; return }
        this.apply(response.data)
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '场景状态暂不可确认') }
      finally { if (current()) this.loading = false }
    },
    async refresh() {
      if (this.state && this.dirty) { try { await this.$confirm('刷新将放弃未保存的场景设置。', '刷新设置') } catch (_) { return } }
      await this.load(true)
    },
    inherit() { this.draft = empty() },
    async save() {
      if (this.saving || this.loading || !this.state || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const current = this.guard(); this.saving = true
      try {
        const response = await this.putRequest(this.url(), { expected_revision: this.state.revision, overrides: this.draft }, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.apply(response.data); this.$message.success(response.info); this.$emit('saved')
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '保存未确认，草稿保留；请刷新核对，不要重复提交') }
      finally { this.saving = false }
    },
  },
}
</script>

<style scoped>
.scene-id { overflow-wrap: anywhere; font-size: 12px; opacity: .75; }
.scene-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.scene-grid .el-select { width: 100%; }
.scene-grid small { display: block; margin-top: 6px; line-height: 1.5; overflow-wrap: anywhere; opacity: .75; }
.scene-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.scene-settings p { line-height: 1.7; }
@media (max-width: 640px) { .scene-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
