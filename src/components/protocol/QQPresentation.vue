<template>
  <section class="qq-presentation">
    <header class="presentation-header"><div><h2>菜单与卡片</h2><p>远端菜单发布与本地图文保存互相独立，无需重启。</p></div><el-select v-model="appId" placeholder="选择已保存的机器人" :disabled="busy"><el-option v-for="bot in bots" :key="bot.id" :value="bot.id" :label="bot.name ? bot.name + ' · ' + bot.id : bot.id" /></el-select></header>
    <el-empty v-if="!bots.length" description="请先在接入设置中保存机器人账号" />
    <template v-else-if="appId">
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <el-alert v-if="notice" :title="notice" type="info" :closable="false" />
      <el-alert v-if="tab === 'cards' && cardsRecovery" :title="cardsRecovery.message" description="当前编辑草稿保持不变。确认保存时先备份原文件，再修复配置。" type="warning" :closable="false" show-icon />
      <div v-if="lastOperation" class="operation-bar"><span :title="lastOperation.operation_id">操作 {{ lastOperation.operation_id }}：{{ operationLabel }}</span><el-select v-if="pendingOperations.length" :value="lastOperation.operation_id" :disabled="locked" placeholder="找回未决操作" size="small" @change="selectOperation"><el-option v-for="operation in pendingOperations" :key="operation.operation_id" :value="operation.operation_id" :label="operation.operation_id + ' · ' + (operation.state === 'running' ? '进行中' : '待确认')" /></el-select><el-button size="small" :disabled="locked" @click="queryOperation">查询操作结果</el-button><el-button size="small" :disabled="locked" @click="load">重新读取远端／本地状态</el-button></div>
      <section v-if="conflict" class="conflict-box"><strong>配置已变化：草稿未覆盖，请先比较。</strong><div class="diff-grid"><pre>{{ JSON.stringify(currentDraft, null, 2) }}</pre><pre>{{ JSON.stringify(conflict.resource, null, 2) }}</pre></div><el-button size="small" :disabled="locked" @click="resolveConflict(false)">采用已读取配置</el-button><el-button size="small" :disabled="locked" @click="resolveConflict(true)">保留草稿，更新比较基线</el-button></section>
      <el-tabs v-model="tab" :before-leave="() => !busy">
        <el-tab-pane label="私聊菜单" name="menu">
          <p class="hint">显示在 QQ 私聊窗口底部，对该机器人全部用户生效。发布会替换完整菜单。</p>
          <div class="editor-layout"><QQMenuItems :items.sync="menu.items" :disabled="locked" /><aside class="menu-preview"><strong>私聊菜单预览</strong><p class="hint">仅预览，不发送指令、不打开链接。</p><div v-for="(item, index) in menu.items" :key="index" class="preview-item"><span>{{ item.name || '未命名' }}</span><small>{{ typeName(item.type) }}</small><ul v-if="item.type === 'menu'"><li v-for="(child, ci) in item.sub_menu_items" :key="ci">{{ child.name || '未命名子菜单' }}</li></ul></div></aside></div>
          <div class="save-actions"><el-button :disabled="locked" :loading="loading" @click="load">读取并比较</el-button><el-button :disabled="locked || !menu.items.length" @click="clearMenu">清空草稿菜单</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !menuRevision" @click="publishMenu">发布到 QQ</el-button></div>
        </el-tab-pane>
        <el-tab-pane label="指令面板" name="panels">
          <div class="panel-selector"><el-select v-model="panelListScope" :disabled="locked" aria-label="面板列表场景" @change="filterPanels"><el-option value="c2c" label="私聊面板" /><el-option value="group" label="群聊面板" /><el-option value="channel" label="频道文字面板" /><el-option value="dm" label="频道私信面板" /></el-select><el-select v-model="panelId" placeholder="新建面板" clearable :disabled="locked" @change="selectPanel"><el-option v-for="item in panels" :key="item.panel_id" :label="(item.panel?.remark || item.remark || item.panel_id) + ' · ' + item.scope" :value="item.panel_id" /></el-select><el-button :disabled="locked" size="small" @click="newPanel">新建面板</el-button><el-button :disabled="locked" size="small" @click="load">刷新列表</el-button></div>
          <el-form :disabled="locked" label-position="top" size="small" class="panel-settings"><el-form-item label="生效场景"><el-select v-model="panelScope" :disabled="Boolean(panelId)" @change="scopeChanged"><el-option value="c2c" label="私聊" /><el-option value="group" label="群聊" /><el-option value="channel" label="频道文字子频道" /><el-option value="dm" label="频道私信" /></el-select></el-form-item><el-form-item label="生效范围"><el-select v-model="targetType" :disabled="Boolean(panelId)"><el-option value="all" label="该场景全部对象" /><el-option v-if="['c2c', 'group'].includes(panelScope)" value="specific" label="指定对象" /></el-select></el-form-item><el-form-item label="开发者备注"><el-input v-model="panel.remark" maxlength="255" /></el-form-item></el-form>
          <p v-if="panelId" class="hint">已创建面板的场景和范围不可直接修改；需要其他范围时请新建。</p>
          <section v-if="targetType === 'specific'" class="target-editor"><p>填写当前 AppID 的官方 {{ panelScope === 'c2c' ? '用户' : '群' }} OpenID，每行一个，每次最多 20 个；不是 QQ 号或群号。</p><el-input v-model="targetsText" :disabled="locked" type="textarea" :rows="3" /><template v-if="panelId"><p class="hint">已关联：{{ associatedTargets.join('、') || '无' }}</p><el-button size="small" :disabled="cannotPublish" @click="publishTargets('add')">添加这些对象</el-button><el-button size="small" :disabled="cannotPublish" @click="publishTargets('del')">移除这些对象</el-button></template></section>
          <div class="editor-layout"><QQMenuItems :items.sync="panel.items" panel :disabled="locked" /><aside class="menu-preview"><strong>指令面板预览</strong><div v-for="(item, index) in panel.items" :key="index" class="preview-item"><span>{{ item.name || '未命名' }}</span><small>{{ item.desc }}{{ item.only_admin ? ' · 仅管理员' : '' }}</small></div></aside></div>
          <div class="save-actions"><el-button v-if="panelId" type="danger" plain :disabled="cannotPublish" @click="deletePanel">删除远端面板</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !(panelId ? panelRevision : panelsRevision)" @click="publishPanel">{{ panelId ? '发布面板修改' : '创建到 QQ' }}</el-button></div>
        </el-tab-pane>
        <el-tab-pane label="图文回复" name="cards">
          <el-radio-group v-model="cardKind" size="small" :disabled="busy"><el-radio-button label="help">菜单／帮助</el-radio-button><el-radio-button label="welcome_friend">加好友欢迎</el-radio-button><el-radio-button label="welcome_group">机器人入群欢迎</el-radio-button></el-radio-group>
          <p class="hint">欢迎默认关闭；仅处理 QQ 私聊和群聊。不会修改事件订阅、主动消息许可或插件权限。详细帮助保持原行为。</p>
          <QQCardEditor v-if="tab === 'cards'" :key="appId + cardKind" :card.sync="cards[cardKind]" :kind="cardKind" :disabled="locked" />
          <div class="save-actions"><el-button :disabled="locked" @click="load">读取并比较</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !cardsRevision" @click="publishCards">保存图文配置</el-button></div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </section>
</template>

<script>
import QQMenuItems from "./QQMenuItems.vue"
import QQCardEditor from "./QQCardEditor.vue"
import { emptyCards, clonePresentation as copy, newOperationId, validatePresentation } from "@/utils/qq-presentation"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { hasValidAuthToken } from "@/utils/auth-token"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

const fresh = () => ({ menu: { items: [] }, menuRevision: "", menuBase: "", panels: [], panelsRevision: "", panelId: "", panel: { items: [], remark: "" }, panelRevision: "", panelBase: JSON.stringify({ items: [], remark: "" }), panelDrafts: {}, panelScope: "c2c", panelListScope: "c2c", targetType: "all", targetsText: "", associatedTargets: [], cards: emptyCards(), cardsRevision: "", cardsBase: "", lastOperation: null })
const editable = ["menu", "menuRevision", "menuBase", "panel", "panelId", "panelRevision", "panelBase", "panelDrafts", "panelScope", "panelListScope", "targetType", "targetsText", "cards", "cardsRevision", "cardsBase", "lastOperation"]

export default {
  name: "QQPresentation",
  components: { QQMenuItems, QQCardEditor },
  props: { bots: { type: Array, default: () => [] } },
  data: () => ({ ...fresh(), appId: "", tab: "menu", cardKind: "help", cardsRecovery: null, pendingOperations: [], loading: false, busy: false, error: "", notice: "", conflict: null, active: true, reread: false }),
  computed: {
    locked() { return this.loading || this.busy || !this.active },
    cannotPublish() { return this.locked || Boolean(this.conflict) || this.lastOperation?.state === "running" || Boolean(this.lastOperation?.state === "uncertain" && !this.reread) },
    operationLabel() { return { running: "已提交，查询最终结果", confirmed: "已确认", failed: "未接受", uncertain: "结果暂不可确认，请先重新读取" }[this.lastOperation?.state] || "等待查询" },
    currentDraft() { return this.conflict?.type === "panel-list" ? { panels: this.panels, scope: this.panelListScope } : this.tab === "menu" ? this.menu : this.tab === "cards" ? this.cards : this.panel },
    draftSignature() { return JSON.stringify(editable.map(key => this[key])) },
    dirty() { return Boolean((this.menuRevision && JSON.stringify(this.menu) !== this.menuBase) || (this.cardsRevision && JSON.stringify(this.cards) !== this.cardsBase) || (this.panelBase && JSON.stringify(this.panel) !== this.panelBase)) },
  },
  watch: {
    bots: { immediate: true, handler(value) { if (!value.some(bot => bot.id === this.appId)) this.appId = value[0]?.id || "" } },
    appId(value, previous) { if (previous) this.persist(previous); this.invalidate(); Object.assign(this, fresh()); this.cardsRecovery = null; this.pendingOperations = []; this.conflict = null; this.error = ""; this.restore(value); if (value) this.load() },
    tab() { this.invalidate(); this.conflict = null; this.error = ""; if (this.appId) this.load() },
    draftSignature() { window.clearTimeout(this._draftTimer); this._draftTimer = window.setTimeout(() => this.persist(), 150) },
    dirty(value) { setDirtyState("qq-presentation", value) },
  },
  created() {
    this._generation = 0
    this._alive = true
    this._auth = () => { this.invalidate(); this.active = false; this.persist() }
    this._visibility = () => { if (!document.hidden) { this.active = hasValidAuthToken() && !isBusinessNetworkFrozen(); if (this.active && this.lastOperation?.state === "running") this.queryOperation() } }
    window.addEventListener("zhenxun-auth-expired", this._auth)
    document.addEventListener("visibilitychange", this._visibility)
    this._offNetwork = onBusinessNetworkChange(frozen => { this.invalidate(); this.active = !frozen && hasValidAuthToken() })
    this.active = hasValidAuthToken() && !isBusinessNetworkFrozen()
    if (this.appId) { this.restore(this.appId); this.load() }
  },
  beforeDestroy() {
    this.persist(); this._alive = false; this.invalidate()
    window.clearTimeout(this._draftTimer)
    this._offNetwork?.()
    window.removeEventListener("zhenxun-auth-expired", this._auth)
    document.removeEventListener("visibilitychange", this._visibility)
    clearDirtyState("qq-presentation")
  },
  methods: {
    invalidate() { this._generation = (this._generation || 0) + 1; this.loading = false; this.busy = false },
    guard() { const generation = this._generation; const epoch = businessNetworkEpoch(); const app = this.appId; return () => this._alive && generation === this._generation && epoch === businessNetworkEpoch() && this.appId === app && hasValidAuthToken() && !isBusinessNetworkFrozen() },
    storageKey(app) { return "qq-presentation:" + window.location.origin + ":" + app },
    persist(app = this.appId) {
      if (!app) return
      this.stashPanel()
      const data = {}; editable.forEach(key => { data[key] = this[key] })
      try { sessionStorage.setItem(this.storageKey(app), JSON.stringify(data)) } catch (error) { this.notice = "浏览器无法保存草稿，请勿关闭页面。" }
    },
    restore(app) {
      try { const data = JSON.parse(sessionStorage.getItem(this.storageKey(app)) || "null"); if (data) editable.forEach(key => { if (key in data) this[key] = data[key] }) } catch (error) { this.notice = "旧草稿无法读取，已保留浏览器记录。" }
      this._selectedPanel = this.panelId; this._selectedPanelScope = this.panelScope
    },
    url(path) { return this.$root.prefix + "/protocol/qq/" + encodeURIComponent(this.appId) + path },
    async read(path) { const result = await this.getRequest(this.url(path), null, { suppressErrorToast: true, timeout: 45000 }); if (!result.suc) throw new Error(result.info); return result.data },
    showError(error) {
      const detail = error?.response?.data?.detail
      this.error = typeof detail === "string" ? detail : detail?.message || error.message || "请求失败，请稍后重试。"
      if (detail?.provider_code) this.error += " QQ 错误码：" + detail.provider_code
      if (detail?.provider_explanation) this.error += " " + detail.provider_explanation
      if (detail?.suggestion) this.error += " " + detail.suggestion
      if (detail?.trace_id) this.error += " Trace ID：" + detail.trace_id
      if (detail?.operation) this.lastOperation = detail.operation
      if (detail?.resource) {
        const listing = this.tab === "panels" && Array.isArray(detail.resource.panels)
        this.conflict = { type: listing ? "panel-list" : this.tab, resource: listing ? detail.resource : this.tab === "menu" ? detail.resource.menu || { items: [] } : detail.resource.panel || detail.resource, revision: detail.revision }
      }
    },
    setSnapshot(type, snapshot, force = false) {
      if (type === "cards") {
        this.cardsRecovery = snapshot.recovery || null
        if (snapshot.recovery) {
          this.cardsRevision = snapshot.revision
          this.notice = snapshot.recovery.message + " 当前草稿未覆盖；保存时需要确认修复。"
          return
        }
      }
      const raw = type === "cards" ? snapshot.cards : type === "menu" ? snapshot.resource.menu || { items: [] } : snapshot.resource.panel || { items: [] }
      const resource = type === "cards" ? raw : { ...raw, items: Array.isArray(raw.items) ? raw.items : [] }
      const key = type === "cards" ? "cards" : type === "menu" ? "menu" : "panel"
      if (!force && this[key + "Revision"] && this[key + "Revision"] !== snapshot.revision && JSON.stringify(this[key]) !== this[key + "Base"]) {
        this.conflict = { resource: copy(resource), revision: snapshot.revision }
        return
      }
      if (force || !this[key + "Revision"] || JSON.stringify(this[key]) === this[key + "Base"]) this[key] = copy(resource)
      this.$set(this[key], type === "cards" ? "help" : "items", type === "cards" ? this[key].help : this[key].items || [])
      this[key + "Revision"] = snapshot.revision
      this[key + "Base"] = JSON.stringify(resource)
    },
    resolveConflict(keep) {
      if (!this.conflict || this.locked) return
      if (this.conflict.type === "panel-list") {
        this.panels = copy(this.conflict.resource.panels)
        this.panelsRevision = this.conflict.revision
        this.conflict = null
        this.error = ""
        this.notice = "已更新远端面板列表及比较基线；新面板草稿保持不变，可再次发布。"
        this.persist()
        return
      }
      const key = this.tab === "panels" ? "panel" : this.tab
      if (!keep) this[key] = copy(this.conflict.resource)
      this[key + "Revision"] = this.conflict.revision
      this[key + "Base"] = JSON.stringify(this.conflict.resource)
      this.conflict = null
      this.error = ""
      this.notice = keep ? "草稿已保留；下一次发布将以刚读取的配置为基线。" : "已采用刚读取的配置。"
    },
    async load() {
      if (!this.appId || this.loading || this.busy || !this.active) return
      const current = this.guard(); this.loading = true; this.error = ""
      try {
        if (this.tab === "panels") {
          const listing = await this.read("/panels?scope=" + this.panelListScope); if (!current()) return
          this.panels = listing.resource.panels || []; this.panelsRevision = listing.revision
          if (this.panelId) { const detail = await this.read("/panels/" + encodeURIComponent(this.panelId)); if (!current()) return; this.setSnapshot("panel", detail); this.panelScope = detail.resource.scope; this.targetType = detail.resource.target_type; this.associatedTargets = detail.resource.user_openids || detail.resource.group_openids || [] }
        } else { const snapshot = await this.read("/" + this.tab); if (!current()) return; this.setSnapshot(this.tab, snapshot) }
        const pending = await this.read("/operations"); if (!current()) return
        this.pendingOperations = pending.operations || []
        const operation = this.pendingOperations.find(item => item.state === "running") || this.pendingOperations.find(item => item.operation_id === this.lastOperation?.operation_id) || (!this.lastOperation && this.pendingOperations[0])
        if (operation) { this.lastOperation = operation; this.notice = operation.message || this.operationLabel }
        else if (this.lastOperation?.state === "running") {
          const settled = await this.read("/operations/" + this.lastOperation.operation_id); if (!current()) return
          this.lastOperation = { ...this.lastOperation, ...settled }
        }
        this.reread = true
      } catch (error) { if (current()) this.showError(error) } finally { if (current()) this.loading = false }
    },
    stashPanel() {
      if (this._selectedPanel === undefined) return
      const key = this._selectedPanel || "new:" + this._selectedPanelScope
      const draft = { panel: copy(this.panel), revision: this.panelRevision, base: this.panelBase, scope: this.panelScope, target: this.targetType, targets: this.targetsText }
      if (JSON.stringify(draft) !== JSON.stringify(this.panelDrafts[key])) this.$set(this.panelDrafts, key, draft)
    },
    openPanelDraft(id) {
      const cached = this.panelDrafts[id || "new:" + this.panelListScope]
      this.panelId = id
      this.panel = cached ? copy(cached.panel) : { items: [], remark: "" }
      this.panelRevision = cached?.revision || ""
      this.panelBase = cached?.base || JSON.stringify({ items: [], remark: "" })
      this.panelScope = cached?.scope || this.panelListScope
      this.targetType = cached?.target || "all"
      this.targetsText = cached?.targets || ""
      this.associatedTargets = []
      this.conflict = null
      this._selectedPanel = id; this._selectedPanelScope = this.panelScope
    },
    selectPanel() { const next = this.panelId; this.stashPanel(); this.openPanelDraft(next || ""); this.load() },
    newPanel() { this.stashPanel(); this.openPanelDraft("") },
    filterPanels() { this.newPanel(); this.panelsRevision = ""; this.load() },
    scopeChanged() { if (!["c2c", "group"].includes(this.panelScope)) this.targetType = "all"; this._selectedPanelScope = this.panelScope; this.panelListScope = this.panelScope; this.panelsRevision = ""; this.load() },
    targets() { const values = this.targetsText.split(/\s+/).filter(Boolean); if (!values.length || values.length > 20 || new Set(values).size !== values.length || values.some(v => !/^[A-Za-z0-9_-]{1,128}$/.test(v) || /^\d+$/.test(v))) throw new Error("请填写 1 至 20 个不重复的官方 OpenID，不是 QQ 号或群号。"); return { [this.panelScope === "c2c" ? "user_openids" : "group_openids"]: values } },
    async clearMenu() { if (await this.$confirmAction({ title: "清空菜单草稿", message: "只清空当前草稿，点击发布后才会清空 QQ 菜单。", confirmButtonText: "清空草稿" })) this.menu.items.splice(0) },
    async submit(method, path, payload, revision, recoverCorrupt = false) {
      if (!this._alive || this.cannotPublish || !revision) return
      const current = this.guard(); this.busy = true; this.error = ""
      const operation = { operation_id: newOperationId(), state: "running", path, method }
      this.lastOperation = operation; this.reread = false; this.persist()
      try {
        const request = { expected_revision: revision, operation_id: operation.operation_id, payload }
        if (path === "/cards") request.recover_corrupt = recoverCorrupt
        const response = await this[method](this.url(path), request, { suppressErrorToast: true, timeout: 65000 })
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        if (path === "/cards") { this.lastOperation = { ...operation, state: "confirmed" }; this.setSnapshot("cards", response.data, true); this.notice = response.info + (response.data.backup ? " 原配置已备份：" + response.data.backup : "") }
        else {
          this.lastOperation = { ...operation, ...response.data }
          this.notice = response.data.message || "请查询最终结果。"
          if (response.data.diagnostic) this.showError({ response: { data: { detail: response.data.diagnostic } } })
          if (response.data.state === "confirmed") {
            if (path === "/menu") this.setSnapshot("menu", response.data, true)
            else if (method === "deleteRequest") { const deleted = this.panelId; this.newPanel(); this.$delete(this.panelDrafts, deleted) }
            else if (response.data.resource?.panel) { if (!this.panelId) this.$delete(this.panelDrafts, "new:" + this.panelScope); this.panelId = response.data.resource.panel_id || this.panelId; this._selectedPanel = this.panelId; this._selectedPanelScope = this.panelScope; this.setSnapshot("panel", response.data, true); this.associatedTargets = response.data.resource.user_openids || response.data.resource.group_openids || [] }
          }
        }
      } catch (error) {
        if (current()) { const status = error?.response?.status; this.lastOperation = { ...operation, state: status && status < 500 ? "failed" : "uncertain" }; this.showError(error) }
      } finally { if (current()) { this.busy = false; this.persist(); if (this.tab === "panels" && this.lastOperation?.state === "confirmed") this.load() } }
    },
    publishMenu() { try { validatePresentation("menu", this.menu); return this.submit("putRequest", "/menu", { menu: copy(this.menu) }, this.menuRevision) } catch (error) { this.showError(error) } },
    publishPanel() { try { validatePresentation("panel", this.panel); const payload = { panel: copy(this.panel) }; if (!this.panelId) { Object.assign(payload, { scope: this.panelScope, target_type: this.targetType }); if (this.targetType === "specific") Object.assign(payload, this.targets()) } return this.submit(this.panelId ? "putRequest" : "postRequest", this.panelId ? "/panels/" + encodeURIComponent(this.panelId) : "/panels", payload, this.panelId ? this.panelRevision : this.panelsRevision) } catch (error) { this.showError(error) } },
    publishTargets(op) { try { return this.submit("putRequest", "/panels/" + encodeURIComponent(this.panelId) + "/target", { op, ...this.targets() }, this.panelRevision) } catch (error) { this.showError(error) } },
    async publishCards() {
      if (this.cannotPublish) return
      try {
        validatePresentation("cards", this.cards)
        const recover = Boolean(this.cardsRecovery)
        if (recover) {
          const current = this.guard(); this.busy = true
          const yes = await this.$confirmAction({ title: "备份并修复图文配置", message: this.cardsRecovery.message, confirmButtonText: "备份并保存当前草稿" }).catch(() => false)
          if (!current()) return
          this.busy = false
          if (!yes) return
        }
        return this.submit("putRequest", "/cards", copy(this.cards), this.cardsRevision, recover)
      } catch (error) { this.showError(error) }
    },
    async deletePanel() { if (this.locked || !this._alive) return; const current = this.guard(); this.busy = true; const yes = await this.$confirmAction({ title: "删除 QQ 指令面板", message: "将删除所选远端面板及其关联，其他面板不受影响。", confirmButtonText: "删除面板" }).catch(() => false); if (!current()) return; this.busy = false; if (yes) return this.submit("deleteRequest", "/panels/" + encodeURIComponent(this.panelId), {}, this.panelRevision) },
    async queryOperation() { if (this.locked || !this.lastOperation) return; if (this.lastOperation.path === "/cards") return this.load(); const current = this.guard(); this.loading = true; try { const result = await this.read("/operations/" + this.lastOperation.operation_id); if (current()) { this.lastOperation = { ...this.lastOperation, ...result }; this.notice = result.message || this.operationLabel } } catch (error) { if (current()) this.showError(error) } finally { if (current()) this.loading = false } },
    selectOperation(id) { if (this.locked) return; const operation = this.pendingOperations.find(item => item.operation_id === id); if (operation) { this.lastOperation = operation; this.queryOperation() } },
    typeName(type) { return { send_message: "填入消息", link: "链接", menu: "子菜单", switch: "开关" }[type] || "未知类型（将保留原字段）" },
  },
}
</script>

<style scoped>
.qq-presentation { padding: 20px 0; min-width: 0; }
.presentation-header, .operation-bar, .panel-selector, .save-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 12px 0 20px; }
.presentation-header { justify-content: space-between; }.presentation-header h2 { margin: 0; }.presentation-header p, .hint { color: var(--text-color-secondary); font-size: 13px; line-height: 1.7; }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 300px); gap: 22px; align-items: start; }
.menu-preview { border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-color); padding: 16px; position: sticky; top: 12px; overflow-wrap: anywhere; }
.preview-item { border-top: 1px solid var(--border-color); padding: 12px 0; }.preview-item small { display: block; color: var(--text-color-secondary); margin-top: 5px; }
.panel-settings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }.target-editor { margin-bottom: 20px; overflow-wrap: anywhere; }.save-actions { border-top: 1px solid var(--border-color); padding-top: 18px; }
.conflict-box { border: 1px solid var(--warning-color, #cc953b); padding: 12px; margin: 14px 0; }.diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.diff-grid pre { max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.el-alert { margin-bottom: 12px; }.qq-presentation ::v-deep .el-alert__title { overflow-wrap: anywhere; }.operation-bar { font-size: 13px; }
@media (max-width: 760px) { .editor-layout, .panel-settings, .diff-grid { grid-template-columns: minmax(0, 1fr); }.menu-preview { position: static; }.presentation-header > .el-select, .panel-selector > .el-select { width: 100%; }.save-actions .el-button, .operation-bar .el-button { margin: 0; } }
</style>
