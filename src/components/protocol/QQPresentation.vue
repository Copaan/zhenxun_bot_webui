<template>
  <section class="qq-presentation">
    <header class="presentation-header"><div><h2>QQ 菜单与回复卡片</h2><p>选机器人 → 选指令并预览 → 发布或保存</p></div><el-select v-model="appId" placeholder="选择已保存的机器人" :disabled="busy"><el-option v-for="bot in bots" :key="bot.id" :value="bot.id" :label="bot.name ? bot.name + ' · ' + bot.id : bot.id" /></el-select><el-button v-if="appId" :loading="loading" :disabled="locked" icon="el-icon-refresh" @click="refresh">刷新</el-button></header>
    <el-empty v-if="!bots.length" description="先到接入设置保存一个 QQ 机器人，再来制作菜单" />
    <template v-else-if="appId">
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <el-alert v-if="notice" :title="notice" type="info" :closable="false" />
      <el-alert v-if="tab === 'cards' && cardsRecovery" :title="cardsRecovery.message" description="草稿保持不变。确认保存时先备份原文件，再修复配置。" type="warning" :closable="false" show-icon />
      <div v-if="lastOperation && ['running', 'uncertain', 'failed'].includes(lastOperation.state)" class="operation-bar" role="status"><span>{{ operationLabel }}</span><el-button v-if="lastOperation.state === 'uncertain' || lastOperation.state === 'running'" size="small" :disabled="locked" @click="confirmResult">重新确认</el-button></div>
      <details v-if="lastOperation || diagnostic" class="operation-details"><summary>操作详情</summary><p v-if="lastOperation">操作编号：{{ lastOperation.operation_id }} · {{ operationLabel }}</p><p v-if="lastOperation">{{ lastOperation.message }}</p><el-select v-if="pendingOperations.length" :value="lastOperation && lastOperation.operation_id" :disabled="locked" placeholder="查看其他待确认操作" size="small" @change="selectOperation"><el-option v-for="operation in pendingOperations" :key="operation.operation_id" :value="operation.operation_id" :label="operationTitle(operation)" /></el-select><pre v-if="diagnostic">{{ JSON.stringify(diagnostic, null, 2) }}</pre></details>
      <section v-if="conflict" class="conflict-box"><strong>其他地方改过配置，请选择保留哪份。</strong><ul><li v-for="(change, index) in conflictChanges" :key="index">{{ change }}</li></ul><p v-if="conflict.type === 'panel-list'" class="hint">只更新列表，不会覆盖已有面板。你的新面板草稿仍保留。</p><el-button size="small" :disabled="locked" @click="resolveConflict(false)">{{ conflict.type === 'panel-list' ? '使用最新列表' : '用远端的' }}</el-button><el-button size="small" type="primary" :disabled="locked" @click="resolveConflict(true)">{{ conflict.type === 'panel-list' ? '保留我的新面板并创建' : '用我的覆盖' }}</el-button><details class="operation-details"><summary>查看完整配置</summary><div class="diff-grid"><pre>{{ JSON.stringify(currentDraft, null, 2) }}</pre><pre>{{ JSON.stringify(conflict.resource, null, 2) }}</pre></div></details></section>
      <p v-if="commandsError" class="hint">{{ commandsError }} <el-button type="text" size="mini" :loading="commandsLoading" @click="loadCommands(true)">重试读取指令</el-button></p>
      <el-tabs v-model="tab" :before-leave="() => !busy">
        <el-tab-pane label="私聊菜单" name="menu">
          <p class="hint">显示在 QQ 私聊输入框下方。指令按钮把内容填入输入框，链接按钮打开网页；子菜单可展开。发布后对这个机器人的用户生效。</p>
          <div class="draft-actions"><el-button :disabled="locked || !commands.length" :loading="commandsLoading" @click="generateDraft(false)">从已启用插件生成</el-button><el-button :disabled="locked" @click="exampleDraft">使用示例</el-button><span class="hint">只生成草稿，不会自动发布；插件权限保持不变。</span></div>
          <div class="editor-layout"><QQMenuItems :items.sync="menu.items" :commands="commands" :disabled="locked" /><aside class="menu-preview"><strong>QQ 私聊预览</strong><div class="qq-phone"><div class="qq-conversation">{{ bots.find(bot => bot.id === appId)?.name || '机器人' }}<p>你好，点下方菜单试试看。</p><small>{{ previewHint || '本地预览不会发送指令或打开链接' }}</small></div><div class="qq-input">消息输入框</div><div class="qq-bottom-menu"><div v-for="(item, index) in menu.items" :key="index" class="qq-bottom-entry"><ul v-if="item.type === 'menu' && previewMenu === index" class="qq-submenu"><li v-for="(child, ci) in item.sub_menu_items" :key="ci"><button type="button" @click="previewClick(child)">{{ child.name || '未命名' }}</button></li></ul><button type="button" :aria-expanded="item.type === 'menu' ? previewMenu === index : undefined" @click="previewClick(item, index)">{{ item.name || '未命名' }}<small v-if="item.type === 'menu'"> ▴</small></button></div></div></div><p class="hint">实际布局以 QQ 客户端为准。</p></aside></div>
          <div class="save-actions"><el-button :disabled="locked || !menu.items.length" @click="clearMenu">清空草稿</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !menuRevision" @click="publishMenu">发布菜单</el-button></div>
        </el-tab-pane>
        <el-tab-pane label="指令面板" name="panels">
          <p class="hint">在 QQ 输入框输入「/」时展示常用指令。先选择聊天场景，再创建或修改面板。</p>
          <div class="panel-selector"><el-select v-model="panelListScope" :disabled="locked" aria-label="聊天场景" @change="filterPanels"><el-option value="c2c" label="私聊" /><el-option value="group" label="群聊" /><el-option value="channel" label="频道文字" /><el-option value="dm" label="频道私信" /></el-select><el-select v-model="panelId" placeholder="正在新建面板" clearable :disabled="locked" @change="selectPanel"><el-option v-for="item in panels" :key="item.panel_id" :label="panelLabel(item)" :value="item.panel_id" /></el-select><el-button :disabled="locked" size="small" @click="newPanel">新建面板</el-button></div>
          <el-form :disabled="locked" label-position="top" size="small" class="panel-settings"><el-form-item label="面板名称（仅管理时显示）"><el-input v-model="panel.remark" maxlength="255" placeholder="例如：常用功能" /></el-form-item><el-form-item label="谁可以看到"><el-select v-model="targetType" :disabled="Boolean(panelId)" @change="targetType === 'specific' && loadContacts(panelScope)"><el-option value="all" label="这个场景的全部用户／群" /><el-option v-if="['c2c', 'group'].includes(panelScope)" value="specific" label="指定用户／群" /></el-select></el-form-item></el-form>
          <p v-if="panelId" class="hint">修改面板不会改变所属场景；需要其他场景时请新建。</p>
          <section v-if="targetType === 'specific'" class="target-editor"><label>选择当前机器人收到过消息的{{ panelScope === 'c2c' ? '用户' : '群' }}</label><el-select v-model="selectedTargets" multiple filterable allow-create default-first-option :loading="contactsLoading" :disabled="locked" placeholder="按名称选择，也可手动输入当前 AppID 的 OpenID" @focus="loadContacts(panelScope)"><el-option v-for="contact in contacts[panelScope] || []" :key="contact.openid" :value="contact.openid" :label="contact.label" /></el-select><p class="hint">{{ contactHint }} 手填需要官方 OpenID，不是 QQ 号或群号；每次最多 20 个。</p><template v-if="panelId"><p class="hint">已关联 {{ associatedTargets.length }} 个对象</p><el-button size="small" :disabled="cannotPublish" @click="publishTargets('add')">添加所选</el-button><el-button size="small" :disabled="cannotPublish" @click="publishTargets('del')">移除所选</el-button></template></section>
          <div class="draft-actions"><el-button :disabled="locked || !commands.length" :loading="commandsLoading" @click="generateDraft(true)">从已启用插件生成</el-button><el-button :disabled="locked" @click="exampleDraft">使用示例</el-button></div>
          <div class="editor-layout"><QQMenuItems :items.sync="panel.items" :commands="commands" panel :disabled="locked" /><aside class="menu-preview"><strong>「/」指令面板预览</strong><div v-for="(item, index) in panel.items" :key="index" class="preview-item"><span>{{ item.name || '未命名指令' }}</span><small>{{ item.desc }}{{ item.only_admin ? ' · 仅管理员' : '' }}</small></div></aside></div>
          <div class="save-actions"><el-button v-if="panelId" type="danger" plain :disabled="cannotPublish" @click="deletePanel">删除面板</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !(panelId ? panelRevision : panelsRevision)" @click="publishPanel">{{ panelId ? '发布修改' : '创建面板' }}</el-button></div>
        </el-tab-pane>
        <el-tab-pane label="图文回复" name="cards">
          <p class="hint">用户发「帮助」时回复带图片和按钮的卡片；也可以设置加好友、入群时的欢迎。欢迎默认关闭，需单独启用。</p>
          <el-radio-group v-model="cardKind" size="small" :disabled="busy"><el-radio-button label="help">帮助卡片</el-radio-button><el-radio-button label="welcome_friend">好友欢迎</el-radio-button><el-radio-button label="welcome_group">入群欢迎</el-radio-button></el-radio-group>
          <div class="draft-actions"><el-button size="small" :disabled="locked" @click="exampleDraft">使用示例</el-button><el-select v-model="copyKind" size="small" :disabled="locked" placeholder="从其他卡片复制" @change="copyCard"><el-option v-for="(label, kind) in cardNames" v-show="kind !== cardKind" :key="kind" :value="kind" :label="label" /></el-select><span class="hint">复制不会自动开启欢迎回复。</span></div>
          <QQCardEditor v-if="tab === 'cards'" :key="appId + cardKind" :card.sync="cards[cardKind]" :commands="commands" :kind="cardKind" :disabled="locked" />
          <div class="save-actions"><el-button :disabled="locked || Boolean(cardsRecovery)" @click="openTest">发送测试</el-button><el-button type="primary" :loading="busy" :disabled="cannotPublish || !cardsRevision" @click="publishCards">保存卡片</el-button></div>
        </el-tab-pane>
      </el-tabs>
      <el-dialog title="发送一条私聊测试" :visible.sync="testVisible" width="min(92vw, 480px)" :close-on-click-modal="!busy" :before-close="closeTest" append-to-body><p>请接收人先私聊这个机器人一条消息，再选择接收人。只发送当前卡片草稿，不保存配置、不执行按钮。</p><el-select v-model="testTarget" filterable :loading="contactsLoading" :disabled="busy" placeholder="选择最近私聊过当前机器人的用户" style="width:100%"><el-option v-for="contact in contacts.c2c" :key="contact.openid" :value="contact.openid" :label="contact.label" :disabled="!contact.can_test" /></el-select><p class="hint">仅使用尚未过期的私聊回复窗口。无法确认结果时不会自动重发。</p><p v-if="testNotice" role="status">{{ testNotice }}</p><el-button v-if="testUncertain && lastOperation.state === 'uncertain'" type="text" :disabled="busy" @click="acknowledgeTest">我已在 QQ 核对，要重新测试</el-button><span slot="footer"><el-button :disabled="busy" @click="testVisible = false">关闭</el-button><el-button :disabled="busy" @click="loadContacts('c2c')">刷新接收人</el-button><el-button type="primary" :disabled="!testTarget || busy || testUncertain" :loading="busy" @click="sendTest">发送给所选用户</el-button></span></el-dialog>
    </template>
  </section>
</template>

<script>
import QQMenuItems from "./QQMenuItems.vue"
import QQCardEditor from "./QQCardEditor.vue"
import { emptyCards, clonePresentation as copy, newOperationId, validatePresentation, commandOptions, generateItems, describeChanges, panelName } from "@/utils/qq-presentation"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

const fresh = () => ({ menu: { items: [] }, menuRevision: "", menuBase: "", panels: [], panelsRevision: "", panelId: "", panel: { items: [], remark: "" }, panelRevision: "", panelBase: JSON.stringify({ items: [], remark: "" }), panelDrafts: {}, panelScope: "c2c", panelListScope: "c2c", targetType: "all", targetsText: "", associatedTargets: [], cards: emptyCards(), cardsRevision: "", cardsBase: "", lastOperation: null })
const editable = ["menu", "menuRevision", "menuBase", "panel", "panelId", "panelRevision", "panelBase", "panelDrafts", "panelScope", "panelListScope", "targetType", "targetsText", "cards", "cardsRevision", "cardsBase", "lastOperation"]

export default {
  name: "QQPresentation",
  components: { QQMenuItems, QQCardEditor },
  props: { bots: { type: Array, default: () => [] } },
  data: () => ({ ...fresh(), appId: "", tab: "menu", cardKind: "help", cardsRecovery: null, pendingOperations: [], loading: false, busy: false, error: "", notice: "", conflict: null, active: true, reread: false, diagnostic: null, commands: [], commandsLoaded: false, commandsLoading: false, commandsError: "", previewMenu: -1, previewHint: "", copyKind: "", cardNames: { help: "帮助卡片", welcome_friend: "好友欢迎", welcome_group: "入群欢迎" }, contacts: { c2c: [], group: [] }, contactsLoading: false, contactsRequest: 0, contactHint: "请用户先私聊机器人一条消息；群需要这个机器人收到过群事件。", testVisible: false, testTarget: "", testNotice: "", confirmedTestOperation: "" }),
  computed: {
    locked() { return this.loading || this.busy || !this.active },
    cannotPublish() { const pending = this.lastOperation?.path === "/cards/test" ? "" : this.lastOperation?.state; return this.locked || Boolean(this.conflict) || pending === "running" || Boolean(pending === "uncertain" && !this.reread) },
    operationLabel() { return { running: "正在处理，请稍候", confirmed: this.lastOperation?.action === "card_test" ? "测试已发送" : "已发布", failed: "操作未成功，请查看原因", uncertain: "结果暂时不能确认，请先重新确认，避免重复操作" }[this.lastOperation?.state] || "等待确认" },
    conflictChanges() { if (!this.conflict) return []; const base = this.conflict.base || this.editingBaseline(); const changes = [...describeChanges(base, this.conflict.resource, "远端"), ...describeChanges(base, this.currentDraft, "你")]; return changes.length ? changes : ["配置版本已更新，已保留你的草稿。"] },
    selectedTargets: { get() { return this.targetsText.split(/\s+/).filter(Boolean) }, set(value) { this.targetsText = value.join("\n") } },
    testUncertain() { return ["/cards/test", "/local/cards/test"].includes(this.lastOperation?.path) && (this.lastOperation.state === "running" || (this.lastOperation.state === "uncertain" && this.confirmedTestOperation !== this.lastOperation.operation_id)) },
    currentDraft() { return this.conflict?.type === "panel-list" ? { panels: this.panels, scope: this.panelListScope } : this.tab === "menu" ? this.menu : this.tab === "cards" ? this.cards : this.panel },
    draftSignature() { return JSON.stringify(editable.map(key => this[key])) },
    dirty() { return Boolean((this.menuRevision && JSON.stringify(this.menu) !== this.menuBase) || (this.cardsRevision && JSON.stringify(this.cards) !== this.cardsBase) || (this.panelBase && JSON.stringify(this.panel) !== this.panelBase)) },
  },
  watch: {
    bots: { immediate: true, handler(value) { if (!value.some(bot => bot.id === this.appId)) this.appId = value[0]?.id || "" } },
    appId(value, previous) { if (previous) this.persist(previous); this.invalidate(); Object.assign(this, fresh()); this.cardsRecovery = null; this.pendingOperations = []; this.contacts = { c2c: [], group: [] }; this.testVisible = false; this.testTarget = ""; this.conflict = null; this.error = ""; this.notice = ""; this.diagnostic = null; this.restore(value); if (value) this.load() },
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
    invalidate() { this._generation = (this._generation || 0) + 1; this.confirmedTestOperation = ""; this.contactsRequest++; this.contactsLoading = false; this.loading = false; this.busy = false },
    guard() { const generation = this._generation; const epoch = businessNetworkEpoch(); const app = this.appId; const token = getAuthToken(); return () => this._alive && generation === this._generation && epoch === businessNetworkEpoch() && this.appId === app && token === getAuthToken() && hasValidAuthToken() && !isBusinessNetworkFrozen() },
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
      this.diagnostic = detail && typeof detail === "object" ? detail : null
      if (detail?.operation) this.lastOperation = detail.operation
      if (detail?.resource) {
        const listing = this.tab === "panels" && Array.isArray(detail.resource.panels)
        this.conflict = { type: listing ? "panel-list" : this.tab, base: listing ? { panels: copy(this.panels), scope: this.panelListScope } : this.editingBaseline(), resource: listing ? detail.resource : this.tab === "menu" ? detail.resource.menu || { items: [] } : detail.resource.panel || detail.resource, revision: detail.revision }
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
        this.conflict = { resource: copy(resource), revision: snapshot.revision, base: this.editingBaseline() }
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
        this.notice = "已读取最新列表，你的新面板草稿仍然保留。"
        this.persist()
        if (keep) return this.publishPanel()
        return
      }
      const key = this.tab === "panels" ? "panel" : this.tab
      if (!keep) this[key] = copy(this.conflict.resource)
      this[key + "Revision"] = this.conflict.revision
      this[key + "Base"] = JSON.stringify(this.conflict.resource)
      this.conflict = null
      this.error = ""
      this.notice = keep ? "正在发布你的版本。" : "已采用远端配置。"
      if (keep) return this.tab === "menu" ? this.publishMenu() : this.tab === "cards" ? this.publishCards() : this.publishPanel()
    },
    async load() {
      if (!this.appId || this.loading || this.busy || !this.active) return
      const current = this.guard(); this.loading = true; this.error = ""
      this.loadCommands()
      try {
        if (this.tab === "panels") {
          const listing = await this.read("/panels?scope=" + this.panelListScope); if (!current()) return
          this.panels = listing.resource.panels || []; this.panelsRevision = listing.revision
          if (this.panelId) { const detail = await this.read("/panels/" + encodeURIComponent(this.panelId)); if (!current()) return; this.setSnapshot("panel", detail); this.panelScope = detail.resource.scope; this.targetType = detail.resource.target_type; this.associatedTargets = detail.resource.user_openids || detail.resource.group_openids || [] }
        } else { const snapshot = await this.read("/" + this.tab); if (!current()) return; this.setSnapshot(this.tab, snapshot) }
        const pending = await this.read("/operations"); if (!current()) return
        this.pendingOperations = pending.operations || []
        const operation = this.pendingOperations.find(item => item.state === "running") || this.pendingOperations.find(item => item.operation_id === this.lastOperation?.operation_id) || (!this.lastOperation && this.pendingOperations[0])
        if (operation) { this.lastOperation = operation; this.notice = "" }
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
        if (path === "/cards") { this.lastOperation = { ...operation, state: "confirmed" }; this.setSnapshot("cards", response.data, true); this.notice = "卡片已保存" + (response.data.backup ? "，原配置已备份。" : "，下次触发时生效。") }
        else {
          this.lastOperation = { ...operation, ...response.data }
          this.notice = response.data.state === "confirmed" ? this.operationLabel : ""
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
    panelLabel: panelName,
    operationTitle(operation) { return ({ menu: "菜单", create: "新建面板", update: "面板修改", delete: "删除面板", target: "关联对象", card_test: "私聊测试" }[operation.action] || "操作") + " · " + (operation.state === "running" ? "正在处理" : "待确认") },
    editingBaseline() { try { return this.conflict?.type === "panel-list" ? { panels: this.panels, scope: this.panelListScope } : JSON.parse(this[(this.tab === "panels" ? "panel" : this.tab) + "Base"] || "{}") } catch (error) { return {} } },
    refresh() { if (this.locked) return; this.commandsLoaded = false; this.load(); if (this.tab === "panels" && this.targetType === "specific") this.loadContacts(this.panelScope) },
    async confirmResult() { await this.queryOperation(); if (!this.locked) await this.load() },
    async loadCommands(force = false) {
      if (this.commandsLoading || (this.commandsLoaded && !force) || !this._alive || !hasValidAuthToken()) return
      const epoch = businessNetworkEpoch(), token = getAuthToken()
      const current = () => this._alive && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken() && !isBusinessNetworkFrozen()
      this.commandsLoading = true
      try {
        const response = await this.getRequest(this.$root.prefix + "/plugin/get_plugin_list", { plugin_type: ["NORMAL"] }, { suppressErrorToast: true, timeout: 15000 })
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.commands = commandOptions(response.data); this.commandsLoaded = true; this.commandsError = ""
      } catch (error) { if (current()) this.commandsError = "插件指令暂不可读取，仍可手动填写。" }
      finally { this.commandsLoading = false }
    },
    async replaceDraft(change) {
      if (this.locked) return
      const current = this.guard(); this.busy = true
      const existing = this.tab === "cards" ? Boolean(this.cards[this.cardKind].title || this.cards[this.cardKind].body || this.cards[this.cardKind].rows.length) : Boolean(this.currentDraft.items?.length)
      const yes = !existing || await this.$confirmAction({ title: "替换当前草稿", message: "会替换当前编辑内容，不会立即发布或发送消息。", confirmButtonText: "替换草稿" }).catch(() => false)
      if (!current()) return
      this.busy = false
      if (yes) { change(); this.persist() }
    },
    generateDraft(panel) {
      const items = generateItems(this.commands, panel, panel ? this.panelScope : "c2c")
      if (!items.length) { this.notice = "没有可自动生成的启用指令，请手动添加。面板会跳过超过官方名称长度的指令。"; return }
      return this.replaceDraft(() => { this.$set(panel ? this.panel : this.menu, "items", items); this.notice = "已生成 " + items.length + " 项草稿，请检查后发布；每个插件选取一个指令，超长或超出数量的指令未加入。" })
    },
    exampleDraft() {
      return this.replaceDraft(() => {
        const command = this.commands.find(option => option.value === "帮助")?.value || this.commands[0]?.value || "帮助"
        if (this.tab === "cards") {
          const draft = emptyCards()[this.cardKind]; draft.enabled = this.cards[this.cardKind].enabled; draft.title = this.cardKind === "help" ? "你好，我是真寻" : "欢迎认识真寻"; draft.body = "点击下方按钮，查看可以使用的功能。"; draft.rows = [{ buttons: [{ id: newOperationId(), label: "帮助", type: "command", data: command, style: 1, enter: false }] }]; this.$set(this.cards, this.cardKind, draft)
        } else this.$set(this.tab === "panels" ? this.panel : this.menu, "items", this.tab === "panels" ? [{ name: "帮助", type: "command", desc: "查看功能", only_admin: false }] : [{ name: "帮助", type: "send_message", send_message: command }])
        this.notice = "示例已填入草稿，可继续修改；尚未发布或发送。"
      })
    },
    copyCard(kind) {
      this.copyKind = ""
      if (!this.cards[kind] || kind === this.cardKind) return
      return this.replaceDraft(() => { const draft = copy(this.cards[kind]); draft.enabled = this.cards[this.cardKind].enabled; draft.rows.forEach(row => row.buttons.forEach(button => { button.id = newOperationId(); if (this.cardKind === "welcome_group") button.enter = false })); this.$set(this.cards, this.cardKind, draft); this.notice = "卡片已复制到草稿，启用状态保持不变。" })
    },
    previewClick(item, index) { if (item.type === "menu") this.previewMenu = this.previewMenu === index ? -1 : index; else this.previewHint = item.type === "send_message" ? "将填入：" + (item.send_message || "尚未填写") : item.type === "link" ? "将打开：" + (item.link || "尚未填写") : "菜单开关，不是插件启停" },
    async loadContacts(scope) {
      if (!["c2c", "group"].includes(scope) || !this.appId || !this.active) return
      const request = ++this.contactsRequest, current = this.guard(); this.contactsLoading = true
      try { const result = await this.read("/contacts?scope=" + scope); if (!current() || request !== this.contactsRequest) return; this.$set(this.contacts, scope, result.items || []); this.contactHint = result.message || "" }
      catch (error) { if (current() && request === this.contactsRequest) this.contactHint = "联系人暂不可读取，可手动填写面板 OpenID，或稍后刷新。" }
      finally { if (request === this.contactsRequest) this.contactsLoading = false }
    },
    openTest() { if (this.locked || this.cardsRecovery) return; this.testNotice = ""; this.testTarget = ""; this.testVisible = true; this.loadContacts("c2c") },
    closeTest(done) { if (!this.busy) done() },
    async acknowledgeTest() {
      if (this.locked || !this.testUncertain || this.lastOperation.state !== "uncertain") return
      const current = this.guard(), id = this.lastOperation.operation_id; this.busy = true
      const yes = await this.$confirmAction({ title: "重新发送测试", message: "上次结果仍未知。如果上次已送达，再次测试会产生重复消息。请先在 QQ 核对；确认后仍需点击发送按钮。", confirmButtonText: "已核对，允许再次测试" }).catch(() => false)
      if (!current()) return
      this.busy = false
      if (yes && this.lastOperation.operation_id === id) { this.confirmedTestOperation = id; this.reread = true; this.testNotice = "已允许一次新的测试，请确认接收人后点击发送。上次收据仍保留为待确认。" }
    },
    async sendTest() {
      if (this.locked || this.testUncertain || !this.testTarget) return
      try { validatePresentation("cards", { [this.cardKind]: this.cards[this.cardKind] }) } catch (error) { this.testNotice = error.message; return }
      if (this.cannotPublish || !this.cardsRevision) { this.testNotice = "请先刷新并处理待确认的配置，再发送测试。"; return }
      const target = this.contacts.c2c.find(item => item.openid === this.testTarget && item.can_test)
      if (!target) { this.testNotice = "请接收人重新私聊机器人，然后刷新接收人列表。"; return }
      const current = this.guard()
      await this.submit("postRequest", "/cards/test", { kind: this.cardKind, card: copy(this.cards[this.cardKind]), target: target.openid }, this.cardsRevision)
      if (current()) this.testNotice = this.lastOperation?.state === "confirmed" ? "测试卡片已发送给所选用户（不代表已阅读）。" : this.error || this.operationLabel
    },
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
.panel-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.target-editor { margin-bottom: 20px; overflow-wrap: anywhere; }.target-editor > .el-select { display: block; width: 100%; margin-top: 8px; }.save-actions { border-top: 1px solid var(--border-color); padding-top: 18px; }
.draft-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 15px 0; }.draft-actions .el-button { margin: 0; }.operation-details { margin: 8px 0 16px; font-size: 12px; color: var(--text-color-secondary); overflow-wrap: anywhere; }.operation-details summary { cursor: pointer; }.operation-details pre { max-height: 220px; overflow: auto; white-space: pre-wrap; }.conflict-box ul { padding-left: 22px; line-height: 1.8; }
.qq-phone { margin-top: 15px; border: 1px solid var(--border-color); border-radius: 14px; overflow: hidden; }.qq-conversation { min-height: 170px; padding: 18px 12px 70px; background: var(--el-fill-color-light, #f1f5f9); color: var(--text-color); }.qq-conversation p { background: var(--bg-color); border-radius: 9px; padding: 10px; }.qq-conversation small { font-size: 11px; color: var(--text-color-secondary); }.qq-input { margin: 8px; border: 1px solid var(--border-color); padding: 8px; font-size: 12px; color: var(--text-color-secondary); border-radius: 5px; }.qq-bottom-menu { display: flex; flex-wrap: wrap; border-top: 1px solid var(--border-color); }.qq-bottom-entry { position: relative; flex: 1 0 30%; min-width: 0; }.qq-bottom-entry > button, .qq-submenu button { width: 100%; min-height: 38px; border: 0; background: var(--bg-color); color: var(--text-color); cursor: pointer; padding: 8px; overflow-wrap: anywhere; }.qq-bottom-entry > button { border-right: 1px solid var(--border-color); }.qq-submenu { position: absolute; z-index: 2; bottom: 100%; left: 0; right: 0; margin: 0 0 5px; padding: 0; list-style: none; border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 3px 14px #0002; overflow: hidden; }.qq-submenu li + li { border-top: 1px solid var(--border-color); }
.conflict-box { border: 1px solid var(--warning-color, #cc953b); padding: 12px; margin: 14px 0; }.diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.diff-grid pre { max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.el-alert { margin-bottom: 12px; }.qq-presentation ::v-deep .el-alert__title { overflow-wrap: anywhere; }.operation-bar { font-size: 13px; }
@media (max-width: 760px) { .editor-layout, .panel-settings, .diff-grid { grid-template-columns: minmax(0, 1fr); }.menu-preview { position: static; }.presentation-header > .el-select, .panel-selector > .el-select { width: 100%; }.save-actions .el-button, .operation-bar .el-button { margin: 0; } }
</style>
