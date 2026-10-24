<template>
  <div class="model-panel">
  <div class="model-table" role="table" aria-label="模型列表">
    <div class="model-table-row model-table-head" role="row">
      <span role="columnheader">模型</span><span role="columnheader">任务</span><span role="columnheader">上下文</span><span role="columnheader">能力</span><span role="columnheader">核验</span><span role="columnheader">默认</span><span role="columnheader">启用</span><span role="columnheader" class="cell-actions">操作</span>
    </div>
    <div v-for="model in models" :key="model.name" class="model-table-row" :class="{ disabled: model.enabled === false }" role="row">
      <span class="cell-name" role="cell">
        <button type="button" class="model-name" :title="`编辑 ${model.name}`" @click="$emit('edit', model)">{{ model.name }}</button>
        <el-tooltip v-if="isMissing(model)" content="上游模型列表中已没有该模型，可能已下线" placement="top"><i class="el-icon-warning-outline missing"></i></el-tooltip>
        <small v-if="model.reference">参照 {{ model.reference }}</small>
      </span>
      <span class="cell-task" role="cell" data-label="任务">{{ taskText(model) }}</span>
      <span role="cell" data-label="上下文">{{ contextText(model) }}</span>
      <span class="cell-tags" role="cell" data-label="能力"><template v-for="tag in tags(model)"><el-tooltip v-if="tag.off" :key="tag.label" :content="`${tag.label}已手动关闭`" placement="top"><el-tag size="mini" type="info" effect="plain" class="tag-off">{{ tag.label }}</el-tag></el-tooltip><el-tag v-else :key="tag.label" size="mini" effect="plain">{{ tag.label }}</el-tag></template><em v-if="!tags(model).length">—</em></span>
      <span role="cell" data-label="核验">
        <el-tooltip v-if="task(model) === 'chat'" :disabled="!checkTip(model)" :content="checkTip(model)" placement="top"><el-tag size="mini" effect="plain" :type="state(model).type">{{ state(model).label }}</el-tag></el-tooltip>
        <em v-else>—</em>
      </span>
      <span role="cell" data-label="默认">
        <el-tag v-if="isDefault(model)" size="mini" type="success">默认{{ task(model) === "chat" ? "" : taskLabel(model) }}</el-tag>
        <el-tooltip v-else :disabled="canSetDefault(model)" :content="model.enabled === false ? '启用后可设为默认' : '保存后可设为默认'" placement="top">
          <span><el-button type="text" size="mini" :disabled="!canSetDefault(model) || busy" @click="$emit('set-default', model)">设为默认</el-button></span>
        </el-tooltip>
      </span>
      <span role="cell" data-label="启用"><el-switch :value="model.enabled !== false" :disabled="busy" @change="$emit('toggle', model, $event)" /></span>
      <span class="cell-actions" role="cell">
        <el-button v-if="task(model) === 'chat'" type="text" size="mini" :loading="loadingName === model.name" :disabled="busy" @click="$emit('check', model)">核验</el-button>
        <el-button v-else type="text" size="mini" :loading="loadingName === model.name" :disabled="busy" @click="$emit('test', model)">测试</el-button>
        <el-button type="text" size="mini" :disabled="busy" @click="$emit('edit', model)">编辑</el-button>
        <el-button type="text" size="mini" class="danger-text" :disabled="busy" @click="$emit('remove', model)">删除</el-button>
      </span>
    </div>
    <div v-if="!models.length" class="model-table-empty"><slot name="empty">没有匹配的模型</slot></div>
  </div>
  <section v-if="availableTotal" class="available">
    <div class="available-head">
      <button type="button" class="available-toggle" :aria-expanded="String(availableOpen)" @click="$emit('update:availableOpen', !availableOpen)"><i :class="availableOpen ? 'el-icon-arrow-down' : 'el-icon-arrow-right'"></i>上游未添加 <b>{{ availableTotal }}</b><small v-if="available.length !== availableTotal">，匹配 {{ available.length }}</small></button>
      <el-button v-if="availableOpen && available.length" type="text" size="mini" icon="el-icon-plus" @click="$emit('add-all')">{{ available.length === availableTotal ? "全部添加" : `添加匹配的 ${available.length} 个` }}</el-button>
    </div>
    <div v-if="availableOpen" class="available-list">
      <div v-for="item in shownAvailable" :key="item.name" class="available-row">
        <span class="available-name" :title="item.name">{{ item.name }}</span>
        <small :title="item.hint">{{ item.hint }}</small>
        <el-button type="text" size="mini" icon="el-icon-plus" @click="$emit('add', item.name)">添加</el-button>
      </div>
      <div v-if="!available.length" class="model-table-empty">没有匹配的上游模型</div>
      <el-button v-if="available.length > shownAvailable.length" type="text" size="mini" class="available-more" @click="showAll = true">显示其余 {{ available.length - shownAvailable.length }} 个</el-button>
    </div>
  </section>
  </div>
</template>

<script>
import { TASK_LABELS, briefDetail, capabilityTags, checkState, checkSummary, formatTokens, modelProfile, modelTask } from "@/utils/ai-models"

export default {
  name: "ModelTable",
  props: {
    models: { type: Array, required: true },
    defaults: { type: Object, default: () => ({}) },
    providerName: { type: String, default: "" },
    savedNames: { type: Array, default: () => [] },
    upstream: { type: Array, default: null },
    busy: Boolean,
    loadingName: { type: String, default: "" },
    available: { type: Array, default: () => [] },
    availableTotal: { type: Number, default: 0 },
    availableOpen: Boolean,
  },
  data() { return { showAll: false } },
  computed: {
    shownAvailable() { return this.showAll ? this.available : this.available.slice(0, 40) },
  },
  methods: {
    task: modelTask,
    state: checkState,
    tags: capabilityTags,
    taskLabel(model) { return TASK_LABELS[modelTask(model)] || modelTask(model) },
    taskText(model) { return modelProfile(model).tasks.map((item) => TASK_LABELS[item] || item).join("、") },
    contextText(model) { const value = modelProfile(model).context_window; return value ? formatTokens(value) : "—" },
    /**
     * 核验状态的提示文本：失败时给出精简原因，成功时给出各项结果
     * @param {object} model 模型配置
     * @returns {string} 提示文本
     */
    checkTip(model) {
      const results = model.check?.results || []
      const failed = results.find((row) => row.item === "chat" && row.status === "failed")
      return failed ? `基本对话失败：${briefDetail(failed.detail)}` : checkSummary(results)
    },
    isMissing(model) { return Boolean(this.upstream) && !model.protocol && !model.base_url && !this.upstream.includes(model.name) },
    isDefault(model) { return this.defaults[modelTask(model)] === `${this.providerName}/${model.name}` },
    canSetDefault(model) { return model.enabled !== false && this.savedNames.includes(model.name) },
  },
}
</script>

<style scoped>
.model-panel { font-size: 13px; container-type: inline-size; }
.model-table { border-top: 1px solid var(--border-color-light); }
.model-table-row { display: grid; min-height: 52px; grid-template-columns: minmax(170px, 2.2fr) minmax(64px, 0.8fr) 64px minmax(110px, 1.3fr) 76px 80px 52px 132px; align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 1px solid var(--border-color-light); }
.model-table-row:not(.model-table-head):hover { background: var(--bg-color-hover); }
.model-table-row.disabled .model-name { color: var(--text-color-secondary); }
.model-table-head { min-height: 38px; color: var(--text-color-secondary); font-size: 12px; font-weight: 600; }
.cell-name { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 2px 6px; }
.model-name { min-width: 0; max-width: 100%; padding: 0; overflow: hidden; border: 0; color: var(--text-color); background: none; font: inherit; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.model-name:hover, .model-name:focus-visible { color: var(--primary-color); text-decoration: underline; outline: none; }
.tag-off { text-decoration: line-through; opacity: 0.75; }
.cell-name small { width: 100%; overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.missing { color: var(--warning-color, #e6a23c); }
.cell-task { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.model-table em { color: var(--text-color-secondary); font-style: normal; }
.cell-actions { text-align: right; white-space: nowrap; }
.cell-actions .el-button + .el-button { margin-left: 8px; }
.danger-text { color: var(--danger-color) !important; }
.model-table-empty { padding: 30px 12px; color: var(--text-color-secondary); text-align: center; }
.available { margin-top: 12px; padding: 4px 12px 8px; border: 1px dashed var(--border-color); border-radius: 8px; }
.available-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; }
.available-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; color: var(--text-color); background: none; font: inherit; cursor: pointer; }
.available-toggle small { color: var(--text-color-secondary); }
.available-list { max-height: 420px; overflow-y: auto; border-top: 1px solid var(--border-color-light); }
.available-row { display: grid; min-height: 40px; grid-template-columns: minmax(150px, 1.2fr) minmax(0, 2fr) auto; align-items: center; gap: 12px; border-bottom: 1px solid var(--border-color-light); }
.available-row:hover { background: var(--bg-color-hover); }
.available-name { overflow: hidden; font-family: Consolas, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.available-row small { overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.available-more { width: 100%; }
@container (max-width: 780px) {
  .model-table-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 10px 4px; }
  .cell-name { flex: 1 1 100%; }
  .cell-name small { width: auto; }
  .model-table-row > [data-label] { display: inline-flex; align-items: center; gap: 4px; }
  .model-table-row > [data-label]::before { color: var(--text-color-secondary); font-size: 12px; content: attr(data-label); }
  .cell-actions { margin-left: auto; }
  .model-table-row.model-table-head { display: none; }
  .available-row { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 6px 0; }
  .available-row small { grid-column: 1; grid-row: 2; }
  .available-row .el-button { grid-column: 2; grid-row: 1 / 3; }
}
</style>
