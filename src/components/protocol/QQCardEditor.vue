<template>
  <div class="card-layout">
    <div>
      <el-form label-position="top" :disabled="disabled" size="small">
        <el-form-item label="启用此回复"><el-switch v-model="draft.enabled" /><span class="hint"> 保存后对后续事件生效，不会立即发送。</span></el-form-item>
        <el-form-item label="标题"><el-input v-model="draft.title" maxlength="100" /></el-form-item>
        <el-form-item label="图片公网 HTTPS 地址"><el-input v-model="draft.image_url" placeholder="https://" maxlength="2048" /><p class="hint">图片由浏览器预览、QQ 转存；真寻服务器不会抓取该地址。</p></el-form-item>
        <el-form-item label="正文"><el-input v-model="draft.body" type="textarea" :rows="5" maxlength="4000" /></el-form-item>
        <el-form-item label="引用说明"><el-input v-model="draft.quote" type="textarea" :rows="2" maxlength="1000" /></el-form-item>
      </el-form>
      <section v-for="(row, ri) in draft.rows" :key="ri" class="button-row-editor">
        <header><strong>按钮行 {{ ri + 1 }}</strong><div><el-button size="mini" :disabled="disabled || !ri" @click="move(draft.rows, ri, -1)">上移</el-button><el-button size="mini" :disabled="disabled || ri === draft.rows.length - 1" @click="move(draft.rows, ri, 1)">下移</el-button><el-button size="mini" :disabled="disabled" @click="draft.rows.splice(ri, 1)">删除行</el-button></div></header>
        <el-form v-for="(button, bi) in row.buttons" :key="button.id" :disabled="disabled" size="small" label-position="top" class="button-editor">
          <el-form-item label="按钮文字"><el-input v-model="button.label" maxlength="20" /></el-form-item>
          <el-form-item label="动作"><el-select v-model="button.type"><el-option value="command" label="指令" /><el-option value="link" label="HTTPS 链接" /></el-select></el-form-item>
          <el-form-item :label="button.type === 'link' ? 'HTTPS 地址' : '指令内容'"><el-input v-model="button.data" maxlength="2048" /></el-form-item>
          <el-form-item label="外观"><el-select v-model="button.style"><el-option :value="0" label="灰色线框" /><el-option :value="1" label="蓝色线框" /><el-option :value="3" label="白底红字" /><el-option :value="4" label="蓝底白字" /></el-select></el-form-item>
          <el-checkbox v-if="kind !== 'welcome_group' && button.type === 'command'" v-model="button.enter">私聊点击后直接发送（群聊始终仅填入）</el-checkbox>
          <div class="button-actions"><el-button size="mini" :disabled="disabled || !bi" @click="move(row.buttons, bi, -1)">左移</el-button><el-button size="mini" :disabled="disabled || bi === row.buttons.length - 1" @click="move(row.buttons, bi, 1)">右移</el-button><el-button size="mini" :disabled="disabled || row.buttons.length >= 5" @click="copyButton(row, button)">复制</el-button><el-button size="mini" :disabled="disabled" @click="row.buttons.splice(bi, 1)">删除</el-button></div>
        </el-form>
        <el-button size="small" :disabled="disabled || row.buttons.length >= 5" @click="addButton(row)">添加按钮</el-button>
      </section>
      <el-button :disabled="disabled || draft.rows.length >= 5" size="small" @click="draft.rows.push({ buttons: [] })">添加按钮行（{{ draft.rows.length }}/5）</el-button>
    </div>
    <aside class="card-preview" aria-label="图文卡片预览">
      <span class="hint">本地预览，不执行按钮；实际外观以 QQ 客户端为准。</span>
      <article>
        <img v-if="previewImage" :src="previewImage" loading="lazy" referrerpolicy="no-referrer" alt="卡片图片" @error="imageError = true" @load="imageError = false" />
        <p v-if="imageError" class="hint">图片暂不可用，请检查公网地址。</p>
        <h2>{{ draft.title }}</h2><p class="body-text">{{ draft.body }}</p><blockquote v-if="draft.quote">{{ draft.quote }}</blockquote>
        <div v-for="(row, index) in draft.rows" :key="index" class="preview-row"><button v-for="button in row.buttons" :key="button.id" type="button" :class="'style-' + button.style" :title="button.data">{{ button.label || '按钮' }}{{ button.type === 'link' ? ' ↗' : '' }}</button></div>
      </article>
    </aside>
  </div>
</template>

<script>
import { safeHttpsUrl, newOperationId } from "@/utils/qq-presentation"
export default {
  name: "QQCardEditor",
  props: { card: { type: Object, required: true }, kind: String, disabled: Boolean },
  data() { return { draft: JSON.parse(JSON.stringify(this.card)), previewImage: "", imageError: false } },
  watch: {
    card: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.draft)) this.draft = JSON.parse(JSON.stringify(value)) } },
    draft: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.card)) this.$emit("update:card", JSON.parse(JSON.stringify(value))) } },
    "draft.image_url": { immediate: true, handler(value) { window.clearTimeout(this._imageTimer); this._imageTimer = window.setTimeout(() => { this.previewImage = safeHttpsUrl(value) ? value : ""; this.imageError = false }, 300) } } },
  beforeDestroy() { window.clearTimeout(this._imageTimer) },
  methods: {
    move(items, index, delta) { const next = index + delta; if (next >= 0 && next < items.length) items.splice(next, 0, items.splice(index, 1)[0]) },
    addButton(row) { if (row.buttons.length < 5) row.buttons.push({ id: newOperationId(), label: "", type: "command", data: "", style: 1, enter: false }) },
    copyButton(row, button) { if (row.buttons.length < 5) row.buttons.push({ ...button, id: newOperationId() }) },
  },
}
</script>

<style scoped>
.card-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 360px); gap: 22px; align-items: start; }
.button-row-editor { border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; margin-bottom: 12px; }
header, .button-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
.button-editor { border-top: 1px solid var(--border-color); margin: 12px 0; padding-top: 10px; }
.button-actions { margin-top: 10px; justify-content: flex-start; }
.button-actions .el-button { margin: 0; }
.hint { color: var(--text-color-secondary); font-size: 12px; overflow-wrap: anywhere; }
.card-preview { position: sticky; top: 12px; min-width: 0; }
.card-preview article { background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px; margin-top: 12px; overflow-wrap: anywhere; }
.card-preview img { width: 100%; max-height: 280px; object-fit: contain; border-radius: 7px; }
.body-text, blockquote { white-space: pre-wrap; line-height: 1.7; }
blockquote { border-left: 3px solid var(--border-color); margin: 14px 0; padding-left: 10px; color: var(--text-color-secondary); }
.preview-row { display: flex; gap: 8px; margin-top: 10px; }
.preview-row button { flex: 1; min-width: 0; border: 1px solid #168ddd; color: #168ddd; padding: 10px 5px; border-radius: 6px; background: transparent; white-space: normal; overflow-wrap: anywhere; }
.preview-row .style-0 { color: #888; border-color: #888; }.preview-row .style-3 { color: #ca3434; border-color: #ca3434; }.preview-row .style-4 { background: #168ddd; color: white; }
@media (max-width: 850px) { .card-layout { grid-template-columns: minmax(0, 1fr); }.card-preview { position: static; } }
</style>
