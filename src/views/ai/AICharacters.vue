<template>
  <div class="ai-characters">
    <div class="zx-section-heading">
      <div>
        <h2>角色识别</h2>
        <p>AI 需要时识别图片中的动漫 / 游戏角色，并可从 Bangumi 查询角色资料。各识别来源同时查询、按权重综合结果，失败的来源自动跳过。</p>
      </div>
    </div>

    <div class="tier-grid">
      <button v-for="t in tiers" :key="t.key" type="button" class="zx-panel tier" :class="{ active: form.tier === t.key }" @click="form.tier = t.key">
        <strong>{{ t.title }}</strong>
        <small class="muted">{{ t.description }}</small>
        <el-tag v-if="t.local" size="mini" :type="status.local.tiers[t.key] ? 'success' : 'info'">{{ status.local.tiers[t.key] ? "模型已就绪" : "模型未下载" }}</el-tag>
      </button>
    </div>

    <section v-if="localTier" class="zx-panel block">
      <div class="block-head">
        <strong>本地模型</strong>
        <small class="muted">已占用 {{ status.local.disk_mb }} MB<template v-if="status.local.library"> · 角色库 {{ status.local.library.characters }} 个角色，生成于 {{ formatTime(status.local.library.built_at) }}</template></small>
      </div>
      <el-alert v-if="!status.component.installed" type="warning" :closable="false" :title="`需要先安装组件“${status.component.title}”（${status.component.packages.join(' ')}），安装后重启生效。`">
        <el-button size="mini" icon="el-icon-download" @click="dependencyVisible = true">安装组件</el-button>
      </el-alert>
      <div class="actions">
        <el-button size="small" type="primary" :disabled="!status.component.installed || running" :loading="running" @click="install(false)">{{ status.local.tiers[form.tier] ? "检查并补全模型" : `下载${tierTitle(form.tier)}模型` }}</el-button>
        <el-button size="small" :disabled="!status.component.installed || running || !status.local.library" @click="install(true)">更新角色库</el-button>
        <el-button size="small" type="danger" plain :disabled="running || !status.local.disk_mb" @click="remove">删除本地模型</el-button>
      </div>
      <div v-if="task" class="task">
        <span>{{ task.stage }}</span>
        <el-progress v-if="!task.error && task.total" :percentage="percent" :stroke-width="10" class="progress" />
        <small class="muted mono">{{ progressText }}</small>
        <div v-if="task.error" class="danger wrap">失败：{{ task.error }}</div>
      </div>
      <small class="muted">模型从 {{ form.hf_endpoint }} 下载：低配约 360MB（swinv2 下载后量化为 int8），高配约 1.45GB；角色库下载约 457MB 特征后压缩为 37MB，原始特征不保留。</small>
    </section>

    <section class="zx-panel block">
      <div class="block-head"><strong>识别来源</strong><small class="muted">融合分 = Σ 权重 × 来源分数，来源分数在该来源的可信阈值处为 0.625、满分为 1。</small></div>
      <el-table :data="sourceRows" size="small">
        <el-table-column label="来源" min-width="170">
          <template #default="{ row }"><span>{{ row.title }}</span> <el-tag v-if="row.local" size="mini" type="info">本地</el-tag></template>
        </el-table-column>
        <el-table-column label="启用" width="80"><template #default="{ row }"><el-switch v-model="form.sources[row.key].enabled" :disabled="row.local && !localTier" /></template></el-table-column>
        <el-table-column label="权重" width="150"><template #default="{ row }"><el-input-number v-model="form.sources[row.key].weight" :min="0" :max="1" :step="0.1" :precision="2" size="mini" /></template></el-table-column>
        <el-table-column label="说明" min-width="260"><template #default="{ row }"><small class="muted wrap">{{ notes[row.key] }}</small></template></el-table-column>
      </el-table>
      <el-form label-width="130px" size="small" class="form" @submit.native.prevent>
        <el-form-item label="SauceNAO Key">
          <el-input v-model="form.saucenao_key" type="password" show-password clearable :placeholder="status.saucenao_key_set ? '已设置，留空不修改' : '未设置时不使用 SauceNAO'" class="field" />
          <el-button v-if="status.saucenao_key_set" type="text" size="mini" @click="clearKey">清除</el-button>
        </el-form-item>
        <el-form-item label="最低融合分"><el-input-number v-model="form.min_score" :min="0" :max="3" :step="0.05" :precision="2" /></el-form-item>
        <el-form-item label="模型下载地址"><el-input v-model="form.hf_endpoint" placeholder="https://hf-mirror.com" class="field" /></el-form-item>
      </el-form>
      <el-button size="small" type="primary" :loading="saving" @click="save">保存设置</el-button>
    </section>

    <section class="zx-panel block">
      <div class="block-head"><strong>识别测试</strong><small class="muted">按已保存的设置识别一张图片，不使用缓存。</small></div>
      <div class="actions">
        <el-button size="small" icon="el-icon-picture-outline" :loading="testing" :disabled="status.tier === 'off'" @click="$refs.file.click()">选择图片</el-button>
        <input ref="file" type="file" accept="image/*" class="file-input" @change="test" />
        <small v-if="status.tier === 'off'" class="muted">当前未开启识别。</small>
      </div>
      <div v-if="result" class="result">
        <img v-if="preview" :src="preview" alt="" class="preview" />
        <div class="result-body">
          <strong>融合结果（{{ result.ms }} ms）</strong>
          <div v-for="c in result.candidates" :key="c.key" class="candidate">
            <span class="mono">{{ c.key }}</span><small v-if="c.work" class="muted">（{{ c.work }}）</small>
            <el-tag size="mini">{{ c.score }}</el-tag>
            <small class="muted">{{ c.sources.map(([s, raw]) => `${sourceTitle(s)} ${raw}`).join("、") }}</small>
          </div>
          <p v-if="!result.candidates.length" class="muted">没有达到最低融合分的候选。</p>
          <el-table :data="result.sources" size="mini" class="source-table">
            <el-table-column label="来源" prop="title" width="150" />
            <el-table-column label="耗时" width="90"><template #default="{ row }">{{ row.ms }} ms</template></el-table-column>
            <el-table-column label="结果" min-width="240">
              <template #default="{ row }">
                <span v-if="row.error" class="danger wrap">{{ row.error }}</span>
                <span v-else-if="!row.candidates.length" class="muted">无候选</span>
                <div v-for="c in row.candidates" v-else :key="c.key" class="mono wrap">{{ c.key }} · 原始 {{ c.raw }} · 来源分 {{ c.score }}</div>
              </template>
            </el-table-column>
          </el-table>
          <template v-if="result.note"><small class="muted">工具返回给 AI 的结果：</small><pre class="note">{{ result.note }}</pre></template>
        </div>
      </div>
    </section>

    <ManualDependencyDialog :visible.sync="dependencyVisible" :packages="status.component.packages" />
  </div>
</template>

<script>
import ManualDependencyDialog from "@/components/plugin/ManualDependencyDialog.vue"
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }
const POLL_MS = 2000

export default {
  name: "AICharacters",
  components: { ManualDependencyDialog },
  data() {
    return {
      status: { tier: "off", sources: {}, component: { title: "", packages: [], installed: false }, local: { tiers: {}, disk_mb: 0, library: null, task: null } },
      form: { tier: "off", min_score: 0.5, sources: {}, saucenao_key: "", clear_key: false, hf_endpoint: "https://hf-mirror.com" },
      saving: false, testing: false, result: null, preview: "", dependencyVisible: false,
      tiers: [
        { key: "off", title: "关闭", description: "不识别图片中的角色。" },
        { key: "cloud", title: "云端", description: "只用免 Key 的 DIO 识别（填写 Key 后加上 SauceNAO），不安装模型，适合超低配机器。" },
        { key: "lite", title: "低配本地 + 云端", description: "swinv2 int8 打标 + CCIP 角色库，约 0.25 秒 / 张，内存约 0.6GB。", local: true },
        { key: "full", title: "高配本地 + 云端", description: "eva02 打标 + CCIP 角色库 + 外观校验，约 1 秒 / 张（CPU），内存约 1.5GB。", local: true },
      ],
      notes: {
        tagger: "WD Tagger 识别角色标签，同时给出外观标签用于校验角色库候选；训练数据截至 2024 年初；低配档的权重按 0.8 折算。",
        library: "CCIP 特征比对 2000+ 角色的原型，能认出较新的角色；领先第二名不足 0.02 时只计一半分数。",
        saucenao: "以图搜图，图站收录的图命中率高，截图和新图常搜不到；免费额度每天 100 次。",
        dio: "免费、无需 Key，非常保守，原神、星铁、明日方舟等基本拒识。",
        animetrace: "匿名调用经常限流，默认关闭。",
      },
    }
  },
  computed: {
    localTier() { return ["lite", "full"].includes(this.form.tier) },
    sourceRows() { return Object.entries(this.status.sources).map(([key, s]) => ({ key, ...s })).filter((row) => this.form.sources[row.key]) },
    task() { return this.status.local.task },
    running() { return Boolean(this.task && !this.task.error && this.task.stage !== "完成") },
    percent() { return this.task && this.task.total ? Math.min(100, Math.round((this.task.done / this.task.total) * 100)) : 0 },
    progressText() {
      const t = this.task
      if (!t || !t.total) return ""
      return t.stage.includes("特征") ? `${t.done} / ${t.total}` : `${(t.done / 1e6).toFixed(0)} / ${(t.total / 1e6).toFixed(0)} MB`
    },
  },
  mounted() { this.load() },
  beforeDestroy() { clearTimeout(this.timer) },
  methods: {
    async request(method, url, data, config = {}) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, { ...QUIET, ...config })
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    formatTime(value) { return value ? new Date(value * 1000).toLocaleString() : "" },
    tierTitle(key) { return key === "full" ? "高配" : "低配" },
    sourceTitle(key) { return (this.status.sources[key] || {}).title || key },
    apply(status, resetForm) {
      this.status = status
      if (resetForm) {
        const sources = {}
        for (const [key, s] of Object.entries(status.sources)) sources[key] = { enabled: s.enabled, weight: s.weight }
        this.form = { tier: status.tier, min_score: status.min_score, sources, saucenao_key: "", clear_key: false, hf_endpoint: status.hf_endpoint }
      }
      clearTimeout(this.timer)
      if (this.running) this.timer = setTimeout(() => this.poll(), POLL_MS)
    },
    async load() {
      try { this.apply((await this.request("get", "/characters/status")).data, true) } catch (error) { this.fail(error, "角色识别状态加载失败。") }
    },
    async poll() {
      try { this.apply((await this.request("get", "/characters/status")).data, false) } catch (error) { this.timer = setTimeout(() => this.poll(), POLL_MS * 2) }
    },
    clearKey() { this.form.clear_key = true; this.form.saucenao_key = ""; this.$message.info("保存后清除 SauceNAO Key。") },
    async save() {
      this.saving = true
      try {
        const { tier, min_score: minScore, sources, saucenao_key: key, clear_key: clear, hf_endpoint: endpoint } = this.form
        const payload = { tier, min_score: minScore, sources, hf_endpoint: endpoint, saucenao_key: key.trim() ? key.trim() : clear ? "" : null }
        const response = await this.request("put", "/characters/settings", payload)
        this.$message.success(response.info)
        this.apply(response.data, true)
        if (this.localTier && !this.status.local.tiers[tier]) this.$message.warning("本地模型尚未下载，下载完成前只使用云端来源。")
      } catch (error) { this.fail(error, "保存失败。") } finally { this.saving = false }
    },
    async install(rebuild) {
      try {
        const response = await this.request("post", "/characters/install", { tier: this.form.tier, rebuild_library: rebuild })
        this.$message.success(response.info)
        this.apply(response.data, false)
      } catch (error) { this.fail(error, "下载失败。") }
    },
    async remove() {
      try { await this.$confirm("删除所有本地模型与角色库？本地档位将只使用云端来源，需要时可重新下载。", "删除本地模型", { type: "warning" }) } catch (error) { return }
      try {
        const response = await this.request("delete", "/characters/models")
        this.$message.success(response.info)
        this.apply(response.data, false)
      } catch (error) { this.fail(error, "删除失败。") }
    },
    /**
     * 上传图片按当前设置识别，显示各来源结果与融合分
     * @param {Event} event 文件选择事件
     */
    async test(event) {
      const [file] = event.target.files
      event.target.value = ""
      if (!file) return
      if (this.preview) URL.revokeObjectURL(this.preview)
      this.preview = URL.createObjectURL(file)
      this.testing = true
      try {
        const data = new FormData()
        data.append("file", file)
        this.result = (await this.request("post", "/characters/test", data, { timeout: 0 })).data
      } catch (error) { this.result = null; this.fail(error, "识别失败。") } finally { this.testing = false }
    },
  },
}
</script>

<style scoped>
.tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; }
.tier { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; border: 1px solid transparent; color: var(--text-color); text-align: left; cursor: pointer; }
.tier.active { border-color: var(--primary-color); }
.block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.block-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.task { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 13px; }
.progress { width: 260px; max-width: 100%; }
.form { margin-top: 8px; }
.field { width: 320px; max-width: 100%; }
.file-input { display: none; }
.result { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
.preview { width: 180px; max-width: 100%; border-radius: 8px; }
.result-body { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 6px; }
.candidate { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.source-table { margin-top: 6px; }
.note { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--bg-color-hover); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.mono { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
</style>
