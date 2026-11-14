<template>
  <div class="qq-items">
    <p v-if="!draftItems.length" class="hint empty-items">还没有{{ panel ? '指令' : '菜单' }}，可从插件生成或手动添加。</p>
    <article v-for="(item, index) in draftItems" :key="index" class="qq-item" :class="{ 'is-open': activeIndex === index, 'is-invalid': nameError(item) }" @dragover.prevent @drop.stop.prevent="drop(index)">
      <header>
        <span class="drag-handle" :draggable="!disabled" title="拖动排序；也可展开后使用上移、下移" aria-hidden="true" @dragstart.stop="startDrag($event, index)" @dragend="dragIndex = -1">⠿</span>
        <button type="button" class="item-summary" :aria-expanded="activeIndex === index" @click="activeIndex = activeIndex === index ? -1 : index"><span class="item-number">{{ index + 1 }}</span><strong>{{ item.name || '未命名' }}</strong><small>{{ typeName(item.type) }}</small><i :class="activeIndex === index ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" /></button>
        <small v-if="nameError(item)" class="invalid-label">名称过长或为空</small>
      </header>
      <section v-if="activeIndex === index" class="item-details">
        <div class="item-actions"><el-button size="mini" :disabled="disabled || !index" @click="move(index, -1)">上移</el-button><el-button size="mini" :disabled="disabled || index === draftItems.length - 1" @click="move(index, 1)">下移</el-button><el-button size="mini" :disabled="disabled || draftItems.length >= limit" @click="copyItem(index)">复制</el-button><el-button size="mini" :disabled="disabled" type="danger" plain @click="remove(index)">删除</el-button></div>
        <el-form label-position="top" size="small" :disabled="disabled">
          <el-form-item :label="panel && item.type === 'command' ? '指令（显示在面板中）' : '显示名称'" :error="nameError(item)">
            <QQCommandInput v-if="panel && item.type === 'command'" v-model="item.name" :options="commands" :disabled="disabled" />
            <el-input v-else v-model="item.name" maxlength="64" />
            <small>长度 {{ length(item.name) }} / {{ nameLimit }}（中文计 2）</small>
          </el-form-item>
          <el-form-item label="点击后的动作"><el-select v-model="item.type" @change="prepare(item)"><el-option v-for="type in types" :key="type.value" :value="type.value" :label="type.label" /></el-select><el-checkbox v-if="!panel && !child" v-model="advanced" class="advanced-toggle">高级类型</el-checkbox></el-form-item>
          <el-form-item v-if="item.type === 'send_message'" label="填入输入框的指令" :error="length(item.send_message) > 2000 ? '指令内容过长' : ''"><QQCommandInput v-model="item.send_message" :options="commands" :disabled="disabled" /></el-form-item>
          <el-form-item v-if="item.type === 'link'" label="HTTPS 链接"><el-input v-model="item.link" placeholder="https://" maxlength="2048" /></el-form-item>
          <template v-if="item.type === 'switch'"><el-form-item label="开关标识"><el-input v-model="item.switch.switch_id" maxlength="100" placeholder="例如：show_tips" /></el-form-item><el-form-item label="默认开启"><el-switch v-model="item.switch.default" /></el-form-item><p class="hint">供处理 QQ 菜单事件的插件识别此开关，可填字母、数字、下划线或横线，不能重复。它不会启停真寻插件；没有对应事件处理时请使用指令类型。</p></template>
          <template v-if="panel"><el-form-item label="说明" :error="length(item.desc) > 30 ? '说明最多 30 个字符（中文计 2）' : ''"><el-input v-model="item.desc" maxlength="60" /></el-form-item><el-checkbox v-model="item.only_admin">仅管理员操作（仍须通过插件权限检查）</el-checkbox></template>
        </el-form>
        <QQMenuItems v-if="item.type === 'menu'" :items.sync="item.sub_menu_items" :commands="commands" child :disabled="disabled" />
      </section>
    </article>
    <el-button :disabled="disabled || draftItems.length >= limit" size="small" icon="el-icon-plus" @click="add">添加{{ child ? '子菜单' : panel ? '指令' : '菜单项' }}（{{ draftItems.length }}/{{ limit }}）</el-button>
  </div>
</template>
<script>
import QQCommandInput from "./QQCommandInput.vue"
import { textLength } from "@/utils/qq-presentation"
const editableItems = value => {
  const items = JSON.parse(JSON.stringify(value || []))
  for (const item of items) {
    if (item.type === "menu" && !Array.isArray(item.sub_menu_items)) item.sub_menu_items = []
    if (item.type === "switch" && !item.switch) item.switch = { switch_id: "", default: false }
  }
  return items
}
export default {
  name: "QQMenuItems", components: { QQCommandInput },
  props: { items: { type: Array, required: true }, commands: { type: Array, default: () => [] }, panel: Boolean, child: Boolean, disabled: Boolean },
  data() { return { draftItems: editableItems(this.items), activeIndex: -1, dragIndex: -1, advanced: false } },
  watch: {
    items: { deep: true, handler(value) { const normalized = editableItems(value); if (JSON.stringify(normalized) !== JSON.stringify(this.draftItems)) { this.draftItems = normalized; this.activeIndex = Math.min(this.activeIndex, normalized.length - 1) } } },
    draftItems: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.items)) this.$emit("update:items", JSON.parse(JSON.stringify(value))) } },
  },
  computed: {
    limit() { return this.panel ? 20 : this.child ? 5 : 10 },
    nameLimit() { return this.panel || this.child ? 14 : 10 },
    types() { return this.panel ? [{ value: "command", label: "指令" }, { value: "link", label: "链接" }] : [{ value: "send_message", label: "填入指令" }, { value: "link", label: "链接" }, ...this.child ? [] : [{ value: "menu", label: "展开子菜单" }, ...(this.advanced || this.draftItems[this.activeIndex]?.type === "switch" ? [{ value: "switch", label: "开关（高级）" }] : [])]] },
  },
  methods: {
    length: textLength,
    nameError(item) { return !item.name?.trim() ? "请填写名称或指令" : this.length(item.name) > this.nameLimit ? "超出 " + this.nameLimit + " 个字符，中文计 2" : "" },
    typeName(type) { return { send_message: "指令", command: "指令", link: "链接", menu: "子菜单", switch: "开关" }[type] || "未知类型" },
    prepare(item) { if (item.type === "menu" && !Array.isArray(item.sub_menu_items)) this.$set(item, "sub_menu_items", []); if (item.type === "switch" && !item.switch) this.$set(item, "switch", { switch_id: "", default: false }) },
    add() { if (this.disabled || this.draftItems.length >= this.limit) return; this.draftItems.push(this.panel ? { name: "", type: "command", desc: "", only_admin: false } : { name: "", type: "send_message", send_message: "" }); this.activeIndex = this.draftItems.length - 1 },
    copyItem(index) { if (this.disabled || this.draftItems.length >= this.limit) return; this.draftItems.splice(index + 1, 0, JSON.parse(JSON.stringify(this.draftItems[index]))); this.activeIndex = index + 1 },
    remove(index) { if (this.disabled) return; this.draftItems.splice(index, 1); this.activeIndex = Math.min(index, this.draftItems.length - 1) },
    move(index, delta) { if (this.disabled) return; const next = index + delta; if (next >= 0 && next < this.draftItems.length) { const active = this.draftItems[this.activeIndex]; this.draftItems.splice(next, 0, this.draftItems.splice(index, 1)[0]); this.activeIndex = this.draftItems.indexOf(active) } },
    startDrag(event, index) { if (this.disabled) return; this.dragIndex = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)) },
    drop(index) { if (this.dragIndex >= 0) this.move(this.dragIndex, index - this.dragIndex); this.dragIndex = -1 },
  },
}
</script>
<style scoped>
.qq-items { display: grid; gap: 9px; min-width: 0; }.qq-item { border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color); min-width: 0; }.qq-item.is-invalid { border-color: var(--danger-color, #d45b55); }
header { display: flex; align-items: center; gap: 8px; padding: 10px; }.drag-handle { cursor: grab; font-size: 22px; color: var(--text-color-secondary); }.item-summary { flex: 1; display: flex; align-items: center; gap: 9px; border: 0; background: none; text-align: left; color: var(--text-color); cursor: pointer; min-width: 0; padding: 5px; }.item-summary strong { flex: 1; overflow-wrap: anywhere; }.item-number { color: var(--text-color-secondary); }.item-details { border-top: 1px solid var(--border-color); padding: 14px; }
.item-actions { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; margin-bottom: 12px; }.item-actions .el-button { margin: 0; }.hint, small { color: var(--text-color-secondary); overflow-wrap: anywhere; }.invalid-label { color: var(--danger-color, #d45b55); font-size: 11px; }.empty-items { padding: 18px; border: 1px dashed var(--border-color); }.advanced-toggle { margin-left: 12px; }.item-summary:focus-visible { outline: 2px solid var(--primary-color); border-radius: 4px; }
@media(max-width:600px) { header { flex-wrap: wrap; }.item-summary { flex-basis: 70%; }.advanced-toggle { display: block; margin: 8px 0 0; } }
</style>
