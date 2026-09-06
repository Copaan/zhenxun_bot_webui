<template>
  <main class="policy-page" v-loading="loading">
    <header class="page-header">
      <div>
        <h1>插件策略</h1>
        <p>按机器人账号控制插件与被动技能</p>
      </div>
      <div class="header-actions">
        <el-button icon="el-icon-document-copy" @click="openCopyDialog" :disabled="!account">复制设置</el-button>
        <el-button icon="el-icon-collection" @click="policyDialogVisible = true">策略管理</el-button>
        <el-button type="primary" icon="el-icon-plus" @click="openCreatePolicy">新建策略</el-button>
      </div>
    </header>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false">
      <el-button slot="default" size="mini" @click="loadAll">重新加载</el-button>
    </el-alert>

    <div class="mobile-account-select">
      <el-select v-model="selectedBotId" filterable @change="selectAccount" placeholder="选择机器人账号">
        <el-option v-for="item in accounts" :key="item.bot_id" :label="accountLabel(item)" :value="item.bot_id" />
      </el-select>
    </div>

    <div class="policy-workbench">
      <aside class="account-pane">
        <div class="pane-heading">
          <strong>机器人账号</strong>
          <span>{{ accounts.length }}</span>
        </div>
        <el-input v-model="accountSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索账号" />
        <div class="account-list">
          <button
            v-for="item in filteredAccounts"
            :key="item.bot_id"
            type="button"
            :class="{ active: item.bot_id === selectedBotId }"
            @click="selectAccount(item.bot_id)"
          >
            <i class="connection-dot" :class="{ online: item.connected }"></i>
            <span>
              <strong>{{ item.nickname || item.runtime_bot_id }}</strong>
              <small>{{ item.bot_id }}</small>
            </span>
            <em>{{ item.policy ? item.policy.name : "独立" }}</em>
          </button>
        </div>
      </aside>

      <section v-if="account || editingPolicy" class="editor-pane">
        <div class="editor-heading">
          <div>
            <button v-if="editingPolicy" type="button" class="back-button" @click="leavePolicyEditor" title="返回账号设置">
              <i class="el-icon-back"></i>
            </button>
            <h2>{{ editorTitle }}</h2>
            <p v-if="editingPolicy">同步影响 {{ editingPolicy.bound_bot_ids.length }} 个绑定账号</p>
            <p v-else>{{ account.platform }} · {{ account.connected ? "在线" : "离线" }}</p>
          </div>
          <div class="editor-status">
            <el-tag v-if="editingPolicy" size="small">共享策略</el-tag>
            <el-tag v-else-if="account.mode === 'linked' && !detachPending" size="small" type="warning">{{ account.policy.name }}</el-tag>
            <el-tag v-else size="small" type="info">独立设置</el-tag>
          </div>
        </div>

        <el-alert
          v-if="detachPending"
          title="保存后，此账号将解除共享策略并转为独立设置"
          type="warning"
          show-icon
          :closable="false"
        />

        <el-form
          v-if="editingPolicy"
          class="policy-meta-form"
          label-position="top"
        >
          <el-form-item label="策略名称">
            <el-input v-model="editingPolicy.name" maxlength="80" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="editingPolicy.description"
              maxlength="255"
              placeholder="可选"
            />
          </el-form-item>
        </el-form>

        <div class="feature-toolbar">
          <el-radio-group v-model="activeKind" size="small">
            <el-radio-button label="plugins">插件</el-radio-button>
            <el-radio-button label="tasks">被动技能</el-radio-button>
          </el-radio-group>
          <el-input v-model="featureSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索名称或模块" />
          <el-select v-model="statusFilter" size="small" placeholder="全部状态">
            <el-option label="全部状态" value="all" />
            <el-option label="账号启用" value="enabled" />
            <el-option label="账号禁用" value="disabled" />
            <el-option label="全局不可用" value="unavailable" />
          </el-select>
        </div>

        <div class="batch-toolbar">
          <el-checkbox :value="allFilteredSelected" :indeterminate="someFilteredSelected" @change="toggleFilteredSelection">选择筛选结果</el-checkbox>
          <span>{{ selectedModules.length }} 项已选择</span>
          <el-button size="mini" icon="el-icon-check" :disabled="!selectedModules.length" @click="setSelectedEnabled(true)">启用所选</el-button>
          <el-button size="mini" icon="el-icon-close" :disabled="!selectedModules.length" @click="setSelectedEnabled(false)">禁用所选</el-button>
        </div>

        <div class="feature-table">
          <div class="feature-row feature-head">
            <span></span><span>功能</span><span>类型</span><span>最终状态</span><span>账号设置</span>
          </div>
          <div v-for="item in filteredFeatures" :key="item.module" class="feature-row">
            <el-checkbox v-model="selectedModules" :label="item.module"><span></span></el-checkbox>
            <div class="feature-name">
              <strong>{{ item.name }}</strong>
              <small>{{ item.module }}</small>
            </div>
            <span><el-tag size="mini" type="info">{{ typeLabel(item) }}</el-tag></span>
            <span>
              <el-tag size="mini" :type="effectiveType(item)">{{ effectiveLabel(item) }}</el-tag>
            </span>
            <span><el-switch :value="isEnabled(item.module)" @change="setFeatureEnabled(item.module, $event)" /></span>
          </div>
          <div v-if="!filteredFeatures.length" class="empty-state">没有符合条件的功能</div>
        </div>

        <footer class="save-bar">
          <span>{{ dirty ? "有尚未保存的修改" : "配置已同步" }}</span>
          <el-button :disabled="!dirty" @click="discardChanges">放弃修改</el-button>
          <el-button type="primary" icon="el-icon-check" :loading="saving" :disabled="!dirty" @click="saveEditor">保存并生效</el-button>
        </footer>
      </section>
      <section v-else class="empty-editor">暂无机器人账号</section>
    </div>

    <el-dialog title="新建共享策略" :visible.sync="createDialogVisible" width="520px" custom-class="policy-dialog">
      <el-form label-position="top">
        <el-form-item label="策略名称"><el-input v-model="createForm.name" maxlength="80" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="createForm.description" maxlength="255" /></el-form-item>
        <el-form-item><el-checkbox v-model="createForm.bindCurrent">创建后绑定当前账号</el-checkbox></el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="createDialogVisible = false">取消</el-button><el-button type="primary" :loading="dialogSaving" @click="createPolicy">创建策略</el-button></span>
    </el-dialog>

    <el-dialog title="共享策略管理" :visible.sync="policyDialogVisible" width="700px" custom-class="policy-dialog">
      <div class="policy-list">
        <div v-for="policy in policies" :key="policy.id" class="policy-list-row">
          <span>
            <strong>{{ policy.name }}</strong>
            <small>{{ policy.bound_bot_ids.length }} 个账号 · 禁用 {{ policy.block_plugins.length }} 个插件 / {{ policy.block_tasks.length }} 个被动</small>
            <small v-if="policy.bound_bot_ids.length">{{ boundAccountNames(policy) }}</small>
          </span>
          <div>
            <el-button size="mini" icon="el-icon-link" @click="openBindDialog(policy)">分配</el-button>
            <el-button size="mini" icon="el-icon-edit" @click="editPolicy(policy)">编辑</el-button>
            <el-button size="mini" type="danger" icon="el-icon-delete" :disabled="policy.bound_bot_ids.length > 0" @click="deletePolicy(policy)">删除</el-button>
          </div>
        </div>
        <div v-if="!policies.length" class="empty-state">尚未创建共享策略</div>
      </div>
    </el-dialog>

    <el-dialog title="添加策略账号" :visible.sync="bindDialogVisible" width="560px" custom-class="policy-dialog">
      <p class="dialog-copy">选择要新增或改绑的账号。当前已绑定账号不会被解除。</p>
      <el-select v-model="bindTargets" multiple filterable class="full-control" placeholder="选择机器人账号" @change="loadBindImpacts">
        <el-option v-for="item in bindCandidates" :key="item.bot_id" :label="accountLabel(item)" :value="item.bot_id" />
      </el-select>
      <div v-if="bindingPolicy" class="impact-line">将应用“{{ bindingPolicy.name }}”：禁用 {{ bindingPolicy.block_plugins.length }} 个插件、{{ bindingPolicy.block_tasks.length }} 个被动技能</div>
      <div v-if="bindImpacts.length" class="impact-list">
        <div v-for="item in bindImpacts" :key="item.bot_id">
          <strong>{{ item.name }}</strong>
          <span>插件：禁用 {{ item.pluginsDisabled }} / 启用 {{ item.pluginsEnabled }}；被动：禁用 {{ item.tasksDisabled }} / 启用 {{ item.tasksEnabled }}</span>
        </div>
      </div>
      <span slot="footer"><el-button @click="bindDialogVisible = false">取消</el-button><el-button type="primary" :loading="dialogSaving" :disabled="!bindTargets.length" @click="bindPolicy">确认分配</el-button></span>
    </el-dialog>

    <el-dialog title="复制账号设置" :visible.sync="copyDialogVisible" width="560px" custom-class="policy-dialog">
      <p class="dialog-copy">源账号：{{ account ? account.nickname : "" }}。目标账号已有共享策略时将转为独立设置。</p>
      <el-select v-model="copyTargets" multiple filterable class="full-control" placeholder="选择目标账号" @change="loadCopyImpacts">
        <el-option v-for="item in copyCandidates" :key="item.bot_id" :label="accountLabel(item)" :value="item.bot_id" />
      </el-select>
      <div v-if="copyTargets.length" class="impact-line">将覆盖 {{ copyTargets.length }} 个账号的插件与被动技能设置</div>
      <div v-if="copyImpacts.length" class="impact-list">
        <div v-for="item in copyImpacts" :key="item.bot_id">
          <strong>{{ item.name }}</strong>
          <span>插件：禁用 {{ item.pluginsDisabled }} / 启用 {{ item.pluginsEnabled }}；被动：禁用 {{ item.tasksDisabled }} / 启用 {{ item.tasksEnabled }}</span>
        </div>
      </div>
      <span slot="footer"><el-button @click="copyDialogVisible = false">取消</el-button><el-button type="primary" :loading="dialogSaving" :disabled="!copyTargets.length" @click="copyAccount">确认复制</el-button></span>
    </el-dialog>
  </main>
</template>

<script>
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"

const SOURCE = "plugin-policy"
const sorted = (values) => [...new Set(values || [])].sort()

export default {
  name: "PluginPolicy",
  data() {
    return {
      loading: false, saving: false, dialogSaving: false, loadError: "",
      accounts: [], policies: [], catalog: { plugins: [], tasks: [] },
      selectedBotId: "", account: null, editingPolicy: null,
      draft: { plugins: [], tasks: [] }, baseline: { plugins: [], tasks: [] },
      detachPending: false, activeKind: "plugins", accountSearch: "", featureSearch: "", statusFilter: "all", selectedModules: [],
      createDialogVisible: false, policyDialogVisible: false, bindDialogVisible: false, copyDialogVisible: false,
      createForm: { name: "", description: "", bindCurrent: true },
        bindingPolicy: null, bindTargets: [], copyTargets: [], bindImpacts: [], copyImpacts: [], impactRequest: 0,
    }
  },
  computed: {
    dirty() { return Boolean(JSON.stringify(this.draft) !== JSON.stringify(this.baseline) || (this.editingPolicy && (this.editingPolicy.name !== this.editingPolicy.originalName || this.editingPolicy.description !== this.editingPolicy.originalDescription))) },
    editorTitle() { return this.editingPolicy ? this.editingPolicy.name : (this.account?.nickname || this.account?.runtime_bot_id || "账号设置") },
    filteredAccounts() { const q = this.accountSearch.trim().toLowerCase(); return q ? this.accounts.filter((x) => `${x.nickname} ${x.bot_id} ${x.runtime_bot_id}`.toLowerCase().includes(q)) : this.accounts },
    currentFeatures() { const known = this.catalog[this.activeKind] || []; const missing = this.account && !this.editingPolicy ? (this.activeKind === "plugins" ? this.account.missing_plugins : this.account.missing_tasks) : []; return [...known, ...missing.filter((module) => !known.some((x) => x.module === module)).map((module) => ({ module, name: "已缺失模块", feature_type: "MISSING", load_status: false, global_status: false, missing: true }))] },
    filteredFeatures() { const q = this.featureSearch.trim().toLowerCase(); return this.currentFeatures.filter((item) => { const matchText = !q || `${item.name} ${item.module} ${item.menu_type || ""}`.toLowerCase().includes(q); const enabled = this.isEnabled(item.module); const unavailable = !item.load_status || !item.global_status; const matchStatus = this.statusFilter === "all" || (this.statusFilter === "enabled" && enabled) || (this.statusFilter === "disabled" && !enabled) || (this.statusFilter === "unavailable" && unavailable); return matchText && matchStatus }) },
    allFilteredSelected() { return this.filteredFeatures.length > 0 && this.filteredFeatures.every((x) => this.selectedModules.includes(x.module)) },
    someFilteredSelected() { const count = this.filteredFeatures.filter((x) => this.selectedModules.includes(x.module)).length; return count > 0 && count < this.filteredFeatures.length },
    copyCandidates() { return this.accounts.filter((x) => x.bot_id !== this.selectedBotId) },
    bindCandidates() { return this.accounts.filter((x) => !this.bindingPolicy?.bound_bot_ids.includes(x.bot_id)) },
  },
  watch: {
    dirty(value) { setDirtyState(SOURCE, Boolean(value)) },
    activeKind() { this.selectedModules = [] },
  },
  async mounted() { await this.loadAll() },
  beforeDestroy() { clearDirtyState(SOURCE) },
  methods: {
    async loadAll() {
      this.loading = true; this.loadError = ""
      try {
        const [catalog, accounts, policies] = await Promise.all([
          this.getRequest(`${this.$root.prefix}/plugin-policy/catalog`),
          this.getRequest(`${this.$root.prefix}/plugin-policy/accounts`),
          this.getRequest(`${this.$root.prefix}/plugin-policy/policies`),
        ])
        if (!catalog.suc || !accounts.suc || !policies.suc) throw new Error("插件策略数据读取失败")
        this.catalog = catalog.data; this.accounts = accounts.data; this.policies = policies.data
        const requested = this.$route.query.bot_id
        const next = this.accounts.some((x) => x.bot_id === requested) ? requested : (this.selectedBotId || this.accounts[0]?.bot_id || "")
        if (next) await this.loadAccount(next)
      } catch (error) { this.loadError = error?.response?.data?.detail?.message || error.message || "插件策略数据读取失败" }
      finally { this.loading = false }
    },
    async loadAccount(botId) {
      const resp = await this.getRequest(`${this.$root.prefix}/plugin-policy/accounts/${encodeURIComponent(botId)}`)
      if (!resp.suc) throw new Error(resp.info)
      this.selectedBotId = botId; this.account = resp.data; this.editingPolicy = null; this.detachPending = false
      this.draft = { plugins: sorted(resp.data.block_plugins), tasks: sorted(resp.data.block_tasks) }
      this.baseline = JSON.parse(JSON.stringify(this.draft)); this.selectedModules = []; clearDirtyState(SOURCE)
      if (this.$route.query.bot_id !== botId) this.$router.replace({ path: "/plugin-policy", query: { bot_id: botId } }).catch(() => {})
    },
    async selectAccount(botId) {
      if (!botId || botId === this.account?.bot_id && !this.editingPolicy) return
      if (this.dirty) { try { await this.$confirm("当前修改尚未保存，是否放弃？", "切换账号", { type: "warning" }) } catch (_) { return } }
      this.loading = true; try { await this.loadAccount(botId) } finally { this.loading = false }
    },
    accountLabel(item) { return `${item.nickname || item.runtime_bot_id} (${item.bot_id})` },
    boundAccountNames(policy) { return policy.bound_bot_ids.map((id) => this.accounts.find((item) => item.bot_id === id)?.nickname || id).join("、") },
    isEnabled(module) { return !this.draft[this.activeKind].includes(module) },
    setFeatureEnabled(module, enabled) { const values = new Set(this.draft[this.activeKind]); enabled ? values.delete(module) : values.add(module); this.draft = { ...this.draft, [this.activeKind]: sorted(values) }; if (this.account?.mode === "linked" && !this.editingPolicy) this.detachPending = true },
    toggleFilteredSelection(value) { const values = new Set(this.selectedModules); this.filteredFeatures.forEach((x) => value ? values.add(x.module) : values.delete(x.module)); this.selectedModules = [...values] },
    setSelectedEnabled(enabled) { this.selectedModules.forEach((module) => this.setFeatureEnabled(module, enabled)); this.selectedModules = [] },
    typeLabel(item) { const map = { NORMAL: "普通", DEPENDANT: "依赖", ADMIN: "管理员", SUPERUSER: "超级用户", ADMIN_SUPER: "管理/超管", TASK: "被动", MISSING: "缺失" }; return map[item.feature_type] || item.feature_type },
    effectiveLabel(item) { if (!item.load_status) return item.missing ? "模块缺失" : "未加载"; if (!item.global_status) return "全局关闭"; return this.isEnabled(item.module) ? "可用" : "账号禁用" },
    effectiveType(item) { if (!item.load_status || !item.global_status) return "info"; return this.isEnabled(item.module) ? "success" : "danger" },
    discardChanges() { if (this.editingPolicy) { this.editingPolicy.name = this.editingPolicy.originalName; this.editingPolicy.description = this.editingPolicy.originalDescription } this.draft = JSON.parse(JSON.stringify(this.baseline)); this.detachPending = false },
    async saveEditor() { if (this.editingPolicy) return this.savePolicy(); this.saving = true; try { const resp = await this.putRequest(`${this.$root.prefix}/plugin-policy/accounts/${encodeURIComponent(this.account.bot_id)}`, { expected_revision: this.account.revision, block_plugins: this.draft.plugins, block_tasks: this.draft.tasks }); if (resp.suc) { this.$message.success(resp.info); await this.loadAll() } } catch (error) { if (error?.response?.status === 409) this.$message.warning("配置已变化，草稿已保留，请重新加载后比较") } finally { this.saving = false } },
    openCreatePolicy() { if (!this.account) return; this.createForm = { name: "", description: "", bindCurrent: true }; this.createDialogVisible = true },
    async createPolicy() { if (!this.createForm.name.trim()) return this.$message.warning("请输入策略名称"); this.dialogSaving = true; try { const bind = this.createForm.bindCurrent ? [this.account.bot_id] : []; const resp = await this.postRequest(`${this.$root.prefix}/plugin-policy/policies`, { name: this.createForm.name, description: this.createForm.description, source_bot_id: this.account.bot_id, source_revision: this.account.revision, block_plugins: [], block_tasks: [], bind_bot_ids: bind, expected_revisions: bind.length ? { [this.account.bot_id]: this.account.revision } : {} }); if (resp.suc) { this.$message.success(resp.info); this.createDialogVisible = false; await this.loadAll() } } finally { this.dialogSaving = false } },
    editPolicy(policy) { this.policyDialogVisible = false; this.editingPolicy = { ...policy, originalName: policy.name, originalDescription: policy.description }; this.draft = { plugins: sorted(policy.block_plugins), tasks: sorted(policy.block_tasks) }; this.baseline = JSON.parse(JSON.stringify(this.draft)); this.detachPending = false },
    async savePolicy() { this.saving = true; try { await this.$confirm(`此修改会同步影响 ${this.editingPolicy.bound_bot_ids.length} 个账号。`, "保存共享策略", { type: "warning" }); const resp = await this.putRequest(`${this.$root.prefix}/plugin-policy/policies/${this.editingPolicy.id}`, { expected_revision: this.editingPolicy.revision, name: this.editingPolicy.name, description: this.editingPolicy.description, block_plugins: this.draft.plugins, block_tasks: this.draft.tasks }); if (resp.suc) { this.$message.success(resp.info); await this.loadAll() } } catch (error) { if (error !== "cancel" && error?.response?.status === 409) this.$message.warning("共享策略已变化，草稿已保留") } finally { this.saving = false } },
    async leavePolicyEditor() { if (this.dirty) { try { await this.$confirm("当前策略修改尚未保存，是否放弃？", "返回账号设置", { type: "warning" }) } catch (_) { return } } if (this.selectedBotId) await this.loadAccount(this.selectedBotId) },
    openBindDialog(policy) { this.bindingPolicy = policy; this.bindTargets = []; this.bindImpacts = []; this.policyDialogVisible = false; this.bindDialogVisible = true },
    async bindPolicy() { this.dialogSaving = true; try { const revisions = Object.fromEntries(this.bindTargets.map((id) => [id, this.accounts.find((x) => x.bot_id === id)?.revision || ""])); const resp = await this.putRequest(`${this.$root.prefix}/plugin-policy/bindings`, { policy_id: this.bindingPolicy.id, bot_ids: this.bindTargets, expected_revisions: revisions }); if (resp.suc) { this.$message.success(resp.info); this.bindDialogVisible = false; await this.loadAll() } } finally { this.dialogSaving = false } },
    impactFor(target, source) { const plugins = new Set(target.block_plugins); const sourcePlugins = new Set(source.block_plugins); const tasks = new Set(target.block_tasks); const sourceTasks = new Set(source.block_tasks); return { bot_id: target.bot_id, name: target.nickname || target.runtime_bot_id || target.bot_id, pluginsDisabled: [...sourcePlugins].filter((x) => !plugins.has(x)).length, pluginsEnabled: [...plugins].filter((x) => !sourcePlugins.has(x)).length, tasksDisabled: [...sourceTasks].filter((x) => !tasks.has(x)).length, tasksEnabled: [...tasks].filter((x) => !sourceTasks.has(x)).length } },
    async loadImpacts(targets, source, field) { const request = ++this.impactRequest; const details = await Promise.all(targets.map(async (botId) => { const resp = await this.getRequest(`${this.$root.prefix}/plugin-policy/accounts/${encodeURIComponent(botId)}`); return resp.suc ? this.impactFor(resp.data, source) : null })); if (request === this.impactRequest) this[field] = details.filter(Boolean) },
    loadBindImpacts() { if (this.bindingPolicy) this.loadImpacts(this.bindTargets, this.bindingPolicy, "bindImpacts") },
    openCopyDialog() { this.copyTargets = []; this.copyImpacts = []; this.copyDialogVisible = true },
    loadCopyImpacts() { if (this.account) this.loadImpacts(this.copyTargets, this.account, "copyImpacts") },
    async copyAccount() { this.dialogSaving = true; try { const revisions = Object.fromEntries(this.copyTargets.map((id) => [id, this.accounts.find((x) => x.bot_id === id)?.revision || ""])); const resp = await this.postRequest(`${this.$root.prefix}/plugin-policy/copy`, { source_bot_id: this.account.bot_id, source_revision: this.account.revision, target_bot_ids: this.copyTargets, expected_revisions: revisions }); if (resp.suc) { this.$message.success(resp.info); this.copyDialogVisible = false; await this.loadAll() } } finally { this.dialogSaving = false } },
    async deletePolicy(policy) { try { await this.$confirm(`确定删除策略“${policy.name}”？`, "删除策略", { type: "warning" }); const resp = await this.deleteRequest(`${this.$root.prefix}/plugin-policy/policies/${policy.id}?expected_revision=${policy.revision}`); if (resp.suc) { this.$message.success(resp.info); await this.loadAll() } } catch (error) { if (error !== "cancel") this.$message.error("删除策略失败") } },
  },
}
</script>

<style scoped>
.policy-page { min-height: 100%; padding: 20px 22px 32px; overflow: auto; color: var(--text-color); background: var(--bg-color); }
.page-header, .header-actions, .editor-heading, .editor-heading > div, .feature-toolbar, .batch-toolbar, .save-bar, .policy-list-row, .policy-list-row > div { display: flex; align-items: center; }
.page-header { justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.page-header h1, .editor-heading h2 { margin: 0; letter-spacing: 0; }
.page-header h1 { font-size: 24px; }.page-header p, .editor-heading p { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 13px; }
.header-actions { gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.policy-workbench { display: grid; min-height: 680px; grid-template-columns: 280px minmax(0, 1fr); border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.account-pane { min-width: 0; padding: 16px; border-right: 1px solid var(--border-color); }.pane-heading { display: flex; justify-content: space-between; margin-bottom: 12px; }.pane-heading span { color: var(--text-color-secondary); }
.account-list { display: flex; max-height: 610px; flex-direction: column; gap: 4px; margin-top: 10px; overflow-y: auto; }.account-list button { display: grid; width: 100%; min-height: 66px; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.account-list button:hover { background: var(--bg-color-hover); }.account-list button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.account-list span, .policy-list-row > span { display: flex; min-width: 0; flex-direction: column; gap: 4px; }.account-list strong, .account-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.account-list small, .account-list em, .policy-list-row small { color: var(--text-color-secondary); font-size: 11px; font-style: normal; }.connection-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-color-disabled); }.connection-dot.online { background: var(--success-color); }
.editor-pane { min-width: 0; padding: 20px 22px 76px; }.editor-heading { min-height: 46px; justify-content: space-between; gap: 12px; }.editor-heading > div:first-child { min-width: 0; }.back-button { width: 34px; height: 34px; margin-right: 10px; border: 0; border-radius: 4px; color: var(--text-color); background: var(--bg-color-hover); cursor: pointer; }.editor-status { flex: none; }
.policy-meta-form { display: grid; grid-template-columns: minmax(180px, 0.8fr) minmax(240px, 1.2fr); gap: 12px; margin-top: 16px; }.policy-meta-form .el-form-item { margin-bottom: 0; }
.feature-toolbar { gap: 10px; margin-top: 18px; }.feature-toolbar .el-input { max-width: 330px; margin-left: auto; }.feature-toolbar .el-select { width: 150px; }.batch-toolbar { min-height: 48px; gap: 10px; margin-top: 12px; border-top: 1px solid var(--border-color-light); border-bottom: 1px solid var(--border-color-light); }.batch-toolbar span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }
.feature-table { min-width: 680px; }.feature-row { display: grid; min-height: 64px; grid-template-columns: 34px minmax(210px, 1fr) 110px 110px 90px; align-items: center; gap: 10px; border-bottom: 1px solid var(--border-color-light); }.feature-head { min-height: 42px; color: var(--text-color-secondary); font-size: 12px; }.feature-name { display: flex; min-width: 0; flex-direction: column; gap: 5px; }.feature-name strong, .feature-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.feature-name small { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 11px; }.empty-state, .empty-editor { display: grid; min-height: 140px; place-items: center; color: var(--text-color-secondary); }
.save-bar { position: sticky; bottom: 0; z-index: 3; justify-content: flex-end; gap: 10px; margin: 18px -22px -76px; padding: 12px 22px; border-top: 1px solid var(--border-color); background: var(--bg-color-secondary); }.save-bar span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }
.policy-list { border-top: 1px solid var(--border-color-light); }.policy-list-row { min-height: 70px; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-color-light); }.policy-list-row > div { gap: 6px; flex: none; }.dialog-copy, .impact-line { color: var(--text-color-secondary); font-size: 13px; }.impact-line { margin-top: 14px; padding: 10px 12px; border-left: 3px solid var(--warning-color); background: var(--bg-color-hover); }.full-control { width: 100%; }.mobile-account-select { display: none; margin-bottom: 10px; }.mobile-account-select .el-select { width: 100%; }
.impact-list { max-height: 190px; margin-top: 10px; overflow-y: auto; border-top: 1px solid var(--border-color-light); }.impact-list > div { display: flex; flex-direction: column; gap: 3px; padding: 8px 2px; border-bottom: 1px solid var(--border-color-light); font-size: 12px; }.impact-list span { color: var(--text-color-secondary); }
@media (max-width: 820px) { .policy-page { padding: 12px; }.page-header { align-items: flex-start; flex-direction: column; }.header-actions { width: 100%; justify-content: flex-start; }.mobile-account-select { display: block; }.policy-workbench { min-height: 560px; grid-template-columns: 1fr; }.account-pane { display: none; }.editor-pane { padding: 16px 14px 74px; overflow-x: hidden; }.policy-meta-form { grid-template-columns: 1fr; }.feature-toolbar { align-items: stretch; flex-direction: column; }.feature-toolbar .el-input, .feature-toolbar .el-select { width: 100%; max-width: none; margin-left: 0; }.batch-toolbar { align-items: flex-start; flex-wrap: wrap; padding: 8px 0; }.batch-toolbar span { width: calc(100% - 130px); }.feature-table { min-width: 0; }.feature-head { display: none; }.feature-row:not(.feature-head) { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 7px; padding: 10px 0; }.feature-row:not(.feature-head) > .el-checkbox { grid-row: 1 / 3; }.feature-row:not(.feature-head) > span:nth-child(3) { grid-column: 2; }.feature-row:not(.feature-head) > span:nth-child(4) { grid-column: 3; grid-row: 2; }.feature-row:not(.feature-head) > span:nth-child(5) { grid-column: 3; grid-row: 1; }.save-bar { margin-right: -14px; margin-left: -14px; padding-right: 14px; padding-left: 14px; }.save-bar span { display: none; }.policy-list-row { align-items: flex-start; flex-direction: column; padding: 12px 0; }.policy-list-row > div { flex-wrap: wrap; } }
</style>
