<template>
  <div class="card-layout">
    <div>
      <el-form label-position="top" :disabled="disabled" size="small">
        <el-form-item label="启用此回复"><el-switch v-model="draft.enabled" /><span class="hint"> 保存后生效，不会立即发送。</span></el-form-item>
        <el-form-item label="标题（纯文本）" :error="limitError(draft.title, 200)"><el-input v-model="draft.title" maxlength="200" /></el-form-item>
        <el-form-item label="图片地址（可选）" :error="draft.image_url && !safeUrl(draft.image_url) ? '请使用公网 HTTPS 图片直链' : ''"><el-input v-model="draft.image_url" placeholder="https://你的图床/图片.png" maxlength="2048" /><details class="image-help"><summary>只有本地图片？查看准备方法</summary><p>先将图片上传到你有权限使用的图床或公网 HTTPS 静态站点，再粘贴图片直链。地址应能直接打开图片，无需登录；分享网页地址、本机路径和内网地址不能使用。</p><p>请使用允许 QQ 客户端访问的图片，勿上传隐私资料。本页不提供图床服务，也不会自动把本机文件公开到互联网。</p></details></el-form-item>
        <el-form-item label="正文（纯文本）" :error="limitError(draft.body, 8000)"><el-input v-model="draft.body" type="textarea" :autosize="{ minRows: 4, maxRows: 12 }" maxlength="8000" /><small class="hint">支持换行；**加粗**、HTML 等标记会作为普通文字显示。</small></el-form-item>
        <el-form-item label="引用说明（纯文本）" :error="limitError(draft.quote, 2000)"><el-input v-model="draft.quote" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      </el-form>
      <section class="buttons-section"><h3>消息按钮</h3><p class="hint">点击列表或右侧预览中的按钮编辑，不会发送指令。</p>
        <div v-for="(row, ri) in draft.rows" :key="ri" class="button-row-editor">
          <header><strong>第 {{ ri + 1 }} 行</strong><div class="button-actions"><el-button size="mini" :disabled="disabled || !ri" @click="move(draft.rows, ri, -1)">上移</el-button><el-button size="mini" :disabled="disabled || ri === draft.rows.length - 1" @click="move(draft.rows, ri, 1)">下移</el-button><el-button size="mini" :disabled="disabled" @click="removeRow(ri)">删除行</el-button></div></header>
          <div class="button-chips"><button v-for="button in row.buttons" :key="button.id" type="button" :class="{ selected: activeId === button.id, invalid: limitError(button.label, 10) || !button.label }" :aria-pressed="activeId === button.id" @click="activeId = button.id">{{ button.label || '未命名按钮' }}</button><el-button size="mini" :disabled="disabled || row.buttons.length >= 5" @click="addButton(row)">＋ 按钮</el-button></div>
        </div>
        <el-button :disabled="disabled || draft.rows.length >= 5" size="small" @click="addRow">添加按钮行（{{ draft.rows.length }}/5）</el-button>
      </section>
      <el-form v-if="selectedButton" :disabled="disabled" size="small" label-position="top" class="button-editor" aria-label="当前按钮属性">
        <h3>编辑「{{ selectedButton.label || '未命名按钮' }}」</h3>
        <el-form-item label="按钮文字" :error="!selectedButton.label ? '请输入按钮文字' : limitError(selectedButton.label, 10)"><el-input v-model="selectedButton.label" maxlength="20" /><small>{{ length(selectedButton.label) }} / 10（中文计 2）</small></el-form-item>
        <el-form-item label="动作"><el-select v-model="selectedButton.type"><el-option value="command" label="填入指令" /><el-option value="link" label="打开 HTTPS 链接" /></el-select></el-form-item>
        <el-form-item :label="selectedButton.type === 'link' ? 'HTTPS 地址' : '指令内容'"><el-input v-if="selectedButton.type === 'link'" v-model="selectedButton.data" maxlength="2048" /><QQCommandInput v-else v-model="selectedButton.data" :options="commands" :disabled="disabled" /></el-form-item>
        <el-form-item label="外观"><el-select v-model="selectedButton.style"><el-option :value="0" label="灰色线框" /><el-option :value="1" label="蓝色线框" /><el-option :value="3" label="白底红字" /><el-option :value="4" label="蓝底白字" /></el-select></el-form-item>
        <el-checkbox v-if="kind !== 'welcome_group' && selectedButton.type === 'command'" v-model="selectedButton.enter">私聊点击后直接发送（群聊始终仅填入）</el-checkbox>
        <div class="button-actions"><el-button size="mini" :disabled="disabled || !selectedIndex" @click="move(selectedRow.buttons, selectedIndex, -1)">左移</el-button><el-button size="mini" :disabled="disabled || selectedIndex === selectedRow.buttons.length - 1" @click="move(selectedRow.buttons, selectedIndex, 1)">右移</el-button><el-button size="mini" :disabled="disabled || selectedRow.buttons.length >= 5" @click="copyButton(selectedRow, selectedButton)">复制按钮</el-button><el-button size="mini" :disabled="disabled" @click="removeButton">删除按钮</el-button></div>
      </el-form>
    </div>
    <aside class="card-preview" aria-label="图文卡片预览">
      <span class="hint">点击按钮编辑属性；实际外观以 QQ 客户端为准。</span>
      <article>
        <img v-if="previewImage" :src="previewImage" loading="lazy" referrerpolicy="no-referrer" alt="卡片图片" @error="imageError = true" @load="imageError = false" />
        <p v-if="imageError" class="hint">图片暂不可用，请检查公网地址。</p>
        <h2>{{ draft.title || '卡片标题' }}</h2><p class="body-text">{{ draft.body || '填写正文，预览会同步显示。' }}</p><blockquote v-if="draft.quote">{{ draft.quote }}</blockquote>
        <div v-for="(row, index) in draft.rows" :key="index" class="preview-row"><button v-for="button in row.buttons" :key="button.id" type="button" :class="['style-' + button.style, { selected: activeId === button.id }]" :title="'编辑按钮：' + button.label" :aria-pressed="activeId === button.id" @click="activeId = button.id">{{ button.label || '按钮' }}{{ button.type === 'link' ? ' ↗' : '' }}</button></div>
      </article>
    </aside>
  </div>
</template>
<script>
import QQCommandInput from "./QQCommandInput.vue"
import { safeHttpsUrl, newOperationId, textLength } from "@/utils/qq-presentation"
export default {
  name: "QQCardEditor", components: { QQCommandInput },
  props: { card: { type: Object, required: true }, kind: String, disabled: Boolean, commands: { type: Array, default: () => [] } },
  data() { return { draft: JSON.parse(JSON.stringify(this.card)), previewImage: "", imageError: false, activeId: "" } },
  computed: {
    selectedRow() { return this.draft.rows.find(row => row.buttons.some(button => button.id === this.activeId)) },
    selectedButton() { return this.selectedRow?.buttons.find(button => button.id === this.activeId) },
    selectedIndex() { return this.selectedRow?.buttons.findIndex(button => button.id === this.activeId) ?? -1 },
  },
  watch: {
    card: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.draft)) this.draft = JSON.parse(JSON.stringify(value)) } },
    draft: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.card)) this.$emit("update:card", JSON.parse(JSON.stringify(value))) } },
    "draft.image_url": { immediate: true, handler(value) { window.clearTimeout(this._imageTimer); this._imageTimer = window.setTimeout(() => { this.previewImage = safeHttpsUrl(value) ? value : ""; this.imageError = false }, 300) } },
  },
  beforeDestroy() { window.clearTimeout(this._imageTimer) },
  methods: {
    length: textLength, safeUrl: safeHttpsUrl,
    limitError(value, limit) { return textLength(value) > limit ? "最多 " + limit + " 个字符（中文计 2）" : "" },
    move(items, index, delta) { if (this.disabled) return; const next = index + delta; if (next >= 0 && next < items.length) items.splice(next, 0, items.splice(index, 1)[0]) },
    addRow() { if (this.disabled || this.draft.rows.length >= 5) return; const row = { buttons: [] }; this.draft.rows.push(row); this.addButton(row) },
    removeRow(index) { if (!this.disabled) this.draft.rows.splice(index, 1) },
    addButton(row) { if (this.disabled || row.buttons.length >= 5) return; const id = newOperationId(); row.buttons.push({ id, label: "", type: "command", data: "", style: 1, enter: false }); this.activeId = id },
    copyButton(row, button) { if (this.disabled || row.buttons.length >= 5) return; const id = newOperationId(); row.buttons.push({ ...button, id }); this.activeId = id },
    removeButton() { if (this.disabled || !this.selectedRow) return; this.selectedRow.buttons.splice(this.selectedIndex, 1); this.activeId = "" },
  },
}
</script>
<style scoped>
.card-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 360px); gap: 22px; align-items: start; }
.button-row-editor { border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 9px; }
header, .button-actions, .button-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }header { justify-content: space-between; }.button-chips { margin-top: 10px; }.button-chips > button { border: 1px solid var(--border-color); padding: 7px 10px; background: var(--bg-color); color: var(--text-color); border-radius: 5px; cursor: pointer; }.button-chips .selected { border-color: var(--primary-color); }.button-chips .invalid { color: var(--danger-color, #d45b55); }
.button-editor { border: 1px solid var(--primary-color); border-radius: 8px; margin-top: 15px; padding: 15px; }.button-actions { margin-top: 8px; }.button-actions .el-button { margin: 0; }.hint, small, .image-help { color: var(--text-color-secondary); font-size: 12px; overflow-wrap: anywhere; }.image-help { margin-top: 8px; line-height: 1.7; }.image-help summary { cursor: pointer; }
.card-preview { position: sticky; top: 12px; min-width: 0; }.card-preview article { background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px; margin-top: 12px; overflow-wrap: anywhere; }.card-preview img { width: 100%; max-height: 280px; object-fit: contain; border-radius: 7px; }.body-text, blockquote { white-space: pre-wrap; line-height: 1.7; }blockquote { border-left: 3px solid var(--border-color); margin: 14px 0; padding-left: 10px; color: var(--text-color-secondary); }
.preview-row { display: flex; gap: 8px; margin-top: 10px; }.preview-row button { flex: 1; min-width: 0; cursor: pointer; border: 1px solid #168ddd; color: #168ddd; padding: 10px 5px; border-radius: 6px; background: transparent; white-space: normal; overflow-wrap: anywhere; }.preview-row .selected { outline: 2px solid var(--primary-color); outline-offset: 2px; }.preview-row .style-0 { color: #888; border-color: #888; }.preview-row .style-3 { color: #ca3434; border-color: #ca3434; }.preview-row .style-4 { background: #168ddd; color: white; }
@media (max-width: 850px) { .card-layout { grid-template-columns: minmax(0, 1fr); }.card-preview { position: static; } }
</style>
