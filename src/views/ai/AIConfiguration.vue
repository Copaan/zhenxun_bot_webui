<template>
  <div class="ai-page" v-loading="loading">
    <header class="page-header">
      <div><h1>AI 配置</h1><p>管理模型服务商、任务路由和运行策略</p></div>
      <div class="header-status">
        <el-tag size="small" :type="runtime.hot_reload_available ? 'success' : 'warning'">{{ runtime.hot_reload_available ? "运行时热加载可用" : "运行时状态待确认" }}</el-tag>
        <el-tag v-if="dirtyCount" size="small" type="warning">{{ dirtyCount }} 项未保存</el-tag>
        <el-button icon="el-icon-refresh" @click="loadConfiguration">重新加载</el-button>
      </div>
    </header>
    <el-alert v-if="validationIssues.length" class="configuration-warning" type="warning" :closable="false" show-icon>
      <template #title>当前配置有 {{ validationIssues.length }} 项引用需要处理</template>
      <div v-for="issue in validationIssues" :key="`${issue.code}-${issue.path}-${issue.message}`"><code>{{ issue.path }}</code> {{ issue.message }}</div>
    </el-alert>
    <el-alert v-if="operationIssues.length" class="configuration-warning" type="error" :closable="false" show-icon title="本次操作未通过校验">
      <div v-for="issue in operationIssues" :key="`${issue.code}-${issue.path}-${issue.message}`"><code>{{ issue.path || "AI" }}</code> {{ issue.message }}</div>
    </el-alert>

    <section v-if="loadError && !loading" class="load-error" role="alert">
      <i class="el-icon-warning-outline"></i>
      <div><h2>AI 配置加载失败</h2><p>{{ loadError }}</p></div>
      <el-button type="primary" icon="el-icon-refresh" @click="loadConfiguration">重新加载</el-button>
    </section>

    <el-tabs v-else v-model="activeSection" class="ai-tabs">
      <el-tab-pane label="服务商与模型" name="providers">
        <div class="provider-workbench">
          <aside class="provider-sidebar">
            <div class="sidebar-heading"><strong>服务商</strong><el-button type="text" icon="el-icon-plus" @click="createProvider">添加</el-button></div>
            <el-input v-model="providerSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索服务商" />
            <el-select :value="selectedProviderName" class="mobile-provider-select" size="small" placeholder="选择服务商" @change="selectProvider">
              <el-option v-for="provider in filteredProviders" :key="provider.name" :label="provider.name" :value="provider.name" />
            </el-select>
            <div class="provider-list">
              <button v-for="provider in filteredProviders" :key="provider.name" :class="{ active: selectedProviderName === provider.name }" @click="selectProvider(provider.name)">
                <span><strong>{{ provider.name }}</strong><small>{{ provider.api_type }} · {{ provider.models.length }} 个模型</small></span>
                <el-tag size="mini" :type="providerStatus(provider).type">{{ providerStatus(provider).label }}</el-tag>
              </button>
              <div v-if="!filteredProviders.length" class="empty-copy">暂无服务商</div>
            </div>
          </aside>

          <main v-if="providerDraft" class="provider-main">
            <div class="section-title">
              <div><h2>{{ providerDraft.isNew ? "添加服务商" : providerDraft.name }}</h2><p>密钥不会从服务端回传；留空表示沿用当前值。</p></div>
              <div class="provider-heading-actions">
                <el-tag size="small" :type="providerDraftStatus.type">{{ providerDraftStatus.label }}</el-tag>
                <el-button v-if="!providerDraft.isNew" type="text" icon="el-icon-delete" class="danger-text" @click="removeProvider">删除服务商</el-button>
              </div>
            </div>
            <el-form label-position="top" class="provider-form">
              <el-form-item label="服务商名称" :error="operationError('providers.name')"><el-input v-model="providerDraft.name" maxlength="80" @input="markProviderDirty" /></el-form-item>
              <el-form-item label="API 类型"><el-select v-model="providerDraft.api_type" filterable class="full-control" @change="handleApiTypeChange"><el-option v-for="type in apiTypes" :key="type" :label="type" :value="type" /></el-select></el-form-item>
              <el-form-item label="API Base" :error="operationError('providers.api_base')"><el-input v-model="providerDraft.api_base" placeholder="https://api.example.com" @input="markProviderDirty" /></el-form-item>
              <el-form-item label="请求超时" :error="operationError('providers.timeout')"><el-input-number v-model="providerDraft.timeout" :min="1" :max="1800" controls-position="right" class="full-control" @change="markProviderDirty" /></el-form-item>
            </el-form>

            <section class="secret-section">
              <div class="subheading"><div><h3>API Keys</h3><p>支持多密钥轮询。替换值只会在保存或测试请求中发送。</p></div><el-button size="small" icon="el-icon-plus" @click="addKey">添加密钥</el-button></div>
              <div v-for="(slot, index) in providerDraft.api_key_slots" :key="slot.clientId" class="secret-row">
                <el-input v-model="slot.value" show-password autocomplete="new-password" :placeholder="slot.existing_index == null ? '输入新 API Key' : `密钥 ${slot.existing_index + 1} 已配置，留空沿用`" @input="markProviderDirty" />
                <el-button type="text" icon="el-icon-delete" class="danger-text" @click="removeKey(index)">删除</el-button>
              </div>
            </section>

            <el-collapse class="advanced-collapse">
              <el-collapse-item title="服务商高级参数" name="advanced">
                <el-form label-position="top" class="advanced-grid">
                  <el-form-item label="默认温度"><el-input-number v-model="providerDraft.temperature" :min="0" :max="2" :step="0.1" controls-position="right" class="full-control" @change="markProviderDirty" /></el-form-item>
                  <el-form-item label="默认最大输出 Token"><el-input-number v-model="providerDraft.max_output_tokens" :min="1" controls-position="right" class="full-control" @change="markProviderDirty" /></el-form-item>
                </el-form>
              </el-collapse-item>
            </el-collapse>

            <div class="provider-actions">
              <el-tooltip :disabled="providerDraftStatus.code === 'ready'" :content="providerDraftStatus.reason" placement="top">
                <span><el-button icon="el-icon-connection" :loading="discovering" :disabled="providerDraftStatus.code !== 'ready'" @click="discoverModels">测试连接并发现模型</el-button></span>
              </el-tooltip>
              <el-button type="primary" icon="el-icon-check" :loading="saving === 'provider'" :disabled="!providerDirty" @click="saveProvider">保存服务商</el-button>
            </div>
            <el-alert
              v-if="selectedProbeResult"
              class="provider-probe-result"
              :type="selectedProbeResult.success ? 'success' : 'error'"
              :closable="false"
              show-icon
              :title="selectedProbeResult.message"
            />

            <section class="models-section">
              <div class="subheading"><div><h3>模型</h3><p>模型列表与服务商连接参数独立保存。</p></div><el-button size="small" icon="el-icon-plus" @click="openModelEditor()">手动添加</el-button></div>
              <el-input v-model="modelSearch" clearable prefix-icon="el-icon-search" placeholder="搜索模型" class="model-search" />
              <div class="model-list">
                <div v-for="model in filteredModels" :key="model.model_name" class="model-row">
                  <div class="model-name"><strong>{{ model.model_name }}</strong><span><el-tag v-if="model.is_available" size="mini" type="success">启用</el-tag><el-tag v-else size="mini" type="info">停用</el-tag><el-tag v-for="tag in capabilityTags(model)" :key="tag" size="mini">{{ tag }}</el-tag></span></div>
                  <div class="model-actions"><el-button type="text" icon="el-icon-connection" @click="testModel(model)">测试</el-button><el-button type="text" icon="el-icon-edit" @click="openModelEditor(model, modelIndex(model))">编辑</el-button><el-button type="text" icon="el-icon-delete" class="danger-text" @click="deleteModel(model)">删除</el-button></div>
                </div>
                <div v-if="!filteredModels.length" class="empty-copy">没有匹配的模型</div>
              </div>
              <div class="models-save">
                <span v-if="modelsDirty">模型列表有未保存修改</span>
                <span v-if="providerDraft.isNew">模型将随服务商一并保存</span>
                <el-button v-else type="primary" icon="el-icon-check" :loading="saving === 'models'" :disabled="!modelsDirty" @click="saveModels">保存模型列表</el-button>
              </div>
            </section>
          </main>
          <main v-else class="provider-empty"><i class="el-icon-connection"></i><p>选择或添加一个 AI 服务商</p></main>
        </div>
      </el-tab-pane>

      <el-tab-pane label="默认模型" name="default_models">
        <section class="settings-section"><div class="section-title"><div><h2>默认任务模型</h2><p>只显示适合对应任务的已配置模型和路由组。</p></div></div>
          <el-form label-position="top" class="default-grid"><el-form-item v-for="task in defaultTasks" :key="task.key" :label="task.label" :error="operationError(`default_models.${task.key}`)"><el-select v-model="sectionDrafts.default_models[task.key]" clearable filterable class="full-control" @change="markSectionDirty('default_models')"><el-option-group label="模型"><el-option v-for="model in modelsForTask(task.key)" :key="model.fullName" :label="model.fullName" :value="model.fullName" /></el-option-group><el-option-group label="路由组"><el-option v-for="group in groupNames" :key="group" :label="group" :value="group" /></el-option-group></el-select></el-form-item></el-form>
        </section><SectionAction :dirty="isSectionDirty('default_models')" :saving="saving === 'default_models'" effect="保存后立即热加载" @reset="resetSection('default_models')" @save="saveSection('default_models')" />
      </el-tab-pane>

      <el-tab-pane label="模型路由" name="model_groups">
        <section class="settings-section route-section">
          <div class="section-title"><div><h2>模型路由组</h2><p>按主模型和后备顺序尝试；模型与路由组引用会分别校验。</p></div><el-button size="small" icon="el-icon-plus" @click="addGroup">添加路由组</el-button></div>
          <div class="route-workbench">
            <aside class="route-sidebar">
              <el-input v-model="routeSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索路由组" />
              <button v-for="group in filteredRouteGroups" :key="group.clientId" :class="{ active: selectedRouteGroupId === group.clientId }" @click="selectedRouteGroupId = group.clientId">
                <span><strong>{{ group.name || "未命名路由组" }}</strong><small>{{ group.targets.length }} 个目标</small></span>
                <i v-if="groupIssue(group)" class="el-icon-warning-outline"></i>
              </button>
              <div v-if="!filteredRouteGroups.length" class="empty-copy">暂无路由组</div>
            </aside>
            <main v-if="selectedRouteGroup" class="route-editor">
              <div class="route-editor-heading">
                <div class="route-name-field">
                  <label for="route-group-name">路由组名称</label>
                  <el-input id="route-group-name" v-model="selectedRouteGroup.name" placeholder="例如：主对话模型" @input="markGroupsDirty" />
                  <div v-if="groupIssue(selectedRouteGroup, 'name')" class="route-field-error">{{ groupIssue(selectedRouteGroup, "name") }}</div>
                </div>
                <el-button type="text" icon="el-icon-delete" class="danger-text" @click="removeSelectedGroup">删除路由组</el-button>
              </div>
              <div class="route-target-list">
                <div v-for="(target, index) in selectedRouteGroup.targets" :key="target.clientId" class="route-target-row">
                  <span class="route-order">{{ index === 0 ? "主" : `后备 ${index}` }}</span>
                  <el-select v-model="target.kind" aria-label="目标类型" @change="changeTargetKind(target)"><el-option label="模型" value="model" /><el-option label="路由组" value="group" /></el-select>
                  <el-select v-model="target.value" filterable class="full-control" :placeholder="target.kind === 'model' ? '选择模型' : '选择路由组'" @change="markGroupsDirty">
                    <el-option v-for="option in targetOptions(target.kind, selectedRouteGroup)" :key="option.value" :label="option.label" :value="option.value"><span>{{ option.label }}</span><el-tag v-if="option.tag" size="mini" class="route-option-tag">{{ option.tag }}</el-tag></el-option>
                  </el-select>
                  <div class="route-target-actions"><el-tooltip content="上移" placement="top"><span><el-button icon="el-icon-top" circle size="mini" :disabled="index === 0" @click="moveTarget(index, -1)" /></span></el-tooltip><el-tooltip content="下移" placement="top"><span><el-button icon="el-icon-bottom" circle size="mini" :disabled="index === selectedRouteGroup.targets.length - 1" @click="moveTarget(index, 1)" /></span></el-tooltip><el-tooltip content="删除" placement="top"><el-button icon="el-icon-delete" circle size="mini" class="danger-text" @click="removeTarget(index)" /></el-tooltip></div>
                </div>
                <div v-if="!selectedRouteGroup.targets.length" class="route-empty">尚未配置目标。至少添加一个主模型或路由组。</div>
              </div>
              <el-button icon="el-icon-plus" class="add-route-target" @click="addTarget">添加后备目标</el-button>
              <el-alert v-if="routingIssues.length" type="error" :closable="false" show-icon class="route-issues"><div v-for="issue in routingIssues" :key="`${issue.code}-${issue.path}`">{{ issue.message }}</div></el-alert>
            </main>
            <main v-else class="provider-empty"><i class="el-icon-guide"></i><p>添加或选择一个路由组</p></main>
          </div>
        </section><SectionAction :dirty="isSectionDirty('model_groups')" :saving="saving === 'model_groups'" :invalid="sectionInvalid('model_groups') || hasGroupErrors" effect="保存后立即热加载" @reset="resetSection('model_groups')" @save="saveGroups" />
      </el-tab-pane>

      <el-tab-pane label="AI人设" name="persona">
        <section v-loading="personaLoading" class="settings-section persona-section">
          <div class="section-title"><div><h2>默认聊天人设</h2><p>设置 AI 聊天插件的身份、背景和表达方式，从下一条消息开始生效。</p></div><el-tag v-if="personaAvailable" size="small" type="success">运行时读取</el-tag></div>
          <el-alert v-if="personaAvailable === false" title="当前没有可管理的人设" type="info" :closable="false" show-icon>
            <p>请先在“AI聊天”中安装支持人设管理的聊天插件。</p>
            <el-button size="small" type="primary" plain @click="activeSection = 'chat_plugins'">前往 AI聊天</el-button>
          </el-alert>
          <el-form v-else-if="personaAvailable" label-position="top" class="persona-form">
            <div class="persona-basics">
              <el-form-item label="人设名称"><el-input v-model.trim="personaDraft.name" maxlength="80" @input="markPersonaDirty" /></el-form-item>
              <el-form-item label="启用人设"><el-switch v-model="personaDraft.enabled" @change="markPersonaDirty" /></el-form-item>
            </div>
            <el-form-item label="身份与背景设定"><el-input v-model="personaDraft.prompt" type="textarea" :rows="10" maxlength="20000" show-word-limit placeholder="描述角色身份、背景、性格、知识边界和相处方式" @input="markPersonaDirty" /></el-form-item>
            <el-form-item label="表达风格"><el-input v-model="personaDraft.style" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="例如：简短、自然、避免客服口吻" @input="markPersonaDirty" /></el-form-item>
            <el-form-item label="语气样例"><el-input v-model="personaToneText" type="textarea" :rows="4" placeholder="每行一条，只用于参考表达方式" @input="markPersonaDirty" /></el-form-item>
            <el-form-item label="示例对话"><el-input v-model="personaDialogueText" type="textarea" :rows="6" placeholder="每段一组示例对话，段落之间留一个空行" @input="markPersonaDirty" /></el-form-item>
          </el-form>
        </section>
        <SectionAction v-if="personaAvailable" :dirty="personaDirty" :saving="personaSaving" :invalid="!personaDraft.name.trim() || !personaDraft.prompt.trim()" effect="下一条消息生效" @reset="resetPersona" @save="savePersona" />
      </el-tab-pane>

      <el-tab-pane label="AI聊天" name="chat_plugins">
        <StoreTemplate capability="ai_chat" embedded />
      </el-tab-pane>

      <el-tab-pane v-for="tab in schemaTabs" :key="tab.name" :label="tab.label" :name="tab.name">
        <section class="settings-section"><div class="section-title"><div><h2>{{ tab.title }}</h2><p>{{ tab.description }}</p></div><el-tag v-if="tab.name === 'sandbox'" size="small" type="warning">部分设置需要重启</el-tag></div>
          <SchemaForm v-if="sectionSchema(tab.name)" :key="`${tab.name}-${revision}`" v-model="sectionDrafts[tab.name]" :schema="sectionSchema(tab.name)" :root-schema="schema" :field-ui="sectionFieldUi(tab.name)" :issues="operationIssues" @change="markSectionDirty(tab.name)" @validity-change="setSectionValidity(tab.name, $event)" />
        </section><SectionAction :dirty="isSectionDirty(tab.name)" :saving="saving === tab.name" :invalid="sectionInvalid(tab.name)" :effect="tab.effect" @reset="resetSection(tab.name)" @save="saveSection(tab.name)" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog :title="modelEditIndex == null ? '添加模型' : '编辑模型'" :visible.sync="modelDialog" width="min(620px, 92vw)" append-to-body>
      <el-form label-position="top" class="model-form"><el-form-item label="模型名称"><el-input v-model="modelDraft.model_name" /></el-form-item><el-form-item label="启用"><el-switch v-model="modelDraft.is_available" /></el-form-item><el-form-item label="任务类型"><el-select v-model="modelDraft.task_type" clearable class="full-control"><el-option label="自动识别" :value="null" /><el-option label="图像生成" value="image_generation" /><el-option label="Embedding" value="embedding" /><el-option label="Rerank" value="rerank" /><el-option label="TTS" value="tts" /></el-select></el-form-item><el-form-item label="最大输入 Token"><el-input-number v-model="modelDraft.max_input_tokens" :min="1" controls-position="right" class="full-control" /></el-form-item><el-form-item label="最大输出 Token"><el-input-number v-model="modelDraft.max_output_tokens" :min="1" controls-position="right" class="full-control" /></el-form-item><el-form-item label="推理强度"><el-select v-model="modelDraft.reasoning_effort" clearable class="full-control"><el-option v-for="item in ['none','low','medium','high','xhigh']" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-form>
      <span slot="footer"><el-button icon="el-icon-close" @click="modelDialog = false">取消</el-button><el-button type="primary" icon="el-icon-check" @click="confirmModel">确定</el-button></span>
    </el-dialog>

    <el-dialog title="发现模型" :visible.sync="discoveryDialog" width="min(680px, 92vw)" append-to-body>
      <el-input v-model="discoverySearch" clearable prefix-icon="el-icon-search" placeholder="筛选远端模型" />
      <el-checkbox-group v-model="selectedDiscovered" class="discovery-list"><el-checkbox v-for="name in filteredDiscovered" :key="name" :label="name">{{ name }}</el-checkbox></el-checkbox-group>
      <span slot="footer"><span class="dialog-note">发现 {{ discoveredModels.length }} 个模型</span><el-button icon="el-icon-close" @click="discoveryDialog = false">取消</el-button><el-button type="primary" icon="el-icon-plus" :loading="saving === 'discovered-models'" :disabled="!selectedDiscovered.length || Boolean(saving)" @click="addDiscoveredModels">添加并保存</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import SchemaForm from "@/components/config/SchemaForm.vue"
import StoreTemplate from "@/components/store/StoreTemplate.vue"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const emptyModel = () => ({ model_name: "", is_available: true, temperature: null, max_output_tokens: null, api_type: null, endpoint: null, task_type: null, path_prefix: null, max_input_tokens: null, reasoning_effort: null })

const SectionAction = {
  props: { dirty: Boolean, saving: Boolean, invalid: Boolean, effect: String },
  render(h) {
    return h("div", { class: "section-action" }, [
      h("span", this.invalid ? "请先修正表单错误" : this.effect),
      h("el-button", { props: { icon: "el-icon-refresh-left", disabled: !this.dirty }, on: { click: () => this.$emit("reset") } }, "撤销本区修改"),
      h("el-button", { props: { type: "primary", icon: "el-icon-check", loading: this.saving, disabled: !this.dirty || this.invalid }, on: { click: () => this.$emit("save") } }, "保存"),
    ])
  },
}

export default {
  name: "AIConfiguration",
  components: { SchemaForm, StoreTemplate, SectionAction },
  data() {
    return {
      loading: false, loadError: "", saving: "", activeSection: "providers", revision: "", schema: {}, apiTypes: [], defaultApiBases: {}, discoveryApiTypes: [], effects: {}, runtime: {}, providers: [], validationIssues: [], operationIssues: [], selectedProviderName: "", providerDraft: null,
      providerSearch: "", providerDirty: false, modelsDirty: false, modelSearch: "", sectionDrafts: { default_models: {}, model_groups: {}, context: {}, agent: {}, sandbox: {}, advanced: {} }, originalSections: {}, dirtySections: {}, invalidSections: {}, groupRows: [], routeSearch: "", selectedRouteGroupId: "", routingIssues: [],
      discovering: false, discoveryDialog: false, discoveredModels: [], selectedDiscovered: [], discoverySearch: "", providerProbeResults: {}, modelDialog: false, modelDraft: emptyModel(), modelEditIndex: null,
      personaLoading: false, personaSaving: false, personaAvailable: null, personaRevision: "", personaDraft: { name: "", prompt: "", style: "", enabled: true }, personaOriginal: null, personaToneText: "", personaDialogueText: "", personaDirty: false,
      defaultTasks: [{ key: "chat", label: "对话" }, { key: "embedding", label: "向量嵌入" }, { key: "tts", label: "语音合成" }, { key: "image", label: "图像生成" }, { key: "rerank", label: "文本重排" }],
      schemaTabs: [
        { name: "context", label: "上下文", title: "上下文管理", description: "控制对话总结、多模态窗口和工具结果修剪。", effect: "保存后立即热加载" },
        { name: "agent", label: "Agent", title: "Agent 执行策略", description: "设置工具循环、并行调用、反思与人工介入。", effect: "保存后立即热加载" },
        { name: "sandbox", label: "沙箱", title: "沙箱运行环境", description: "沙箱开关和驱动需要重启，镜像与清理参数影响新会话。", effect: "部分设置在新会话或重启后生效" },
        { name: "advanced", label: "高级设置", title: "客户端与厂商高级设置", description: "网络重试、调试日志及厂商专属行为。", effect: "保存后立即热加载" },
      ],
    }
  },
  computed: {
    dirtyCount() { return Number(this.providerDirty) + Number(this.modelsDirty) + Number(this.personaDirty) + Object.values(this.dirtySections).filter(Boolean).length },
    filteredProviders() { const key = this.providerSearch.trim().toLowerCase(); return this.providers.filter((item) => `${item.name} ${item.api_type}`.toLowerCase().includes(key)) },
    filteredModels() { const key = this.modelSearch.trim().toLowerCase(); return (this.providerDraft?.models || []).filter((item) => item.model_name.toLowerCase().includes(key)) },
    groupNames() { return this.groupRows.map((item) => item.name.trim()).filter(Boolean) },
    allModels() { return this.providers.flatMap((provider) => provider.models.map((model) => ({ ...model, provider: provider.name, fullName: `${provider.name}/${model.model_name}` }))) },
    filteredRouteGroups() { const key = this.routeSearch.trim().toLowerCase(); return this.groupRows.filter((item) => !key || item.name.toLowerCase().includes(key)) },
    selectedRouteGroup() { return this.groupRows.find((item) => item.clientId === this.selectedRouteGroupId) || null },
    filteredDiscovered() { const key = this.discoverySearch.trim().toLowerCase(); return this.discoveredModels.filter((item) => item.toLowerCase().includes(key)) },
    providerDiscoverySupported() { return Boolean(this.providerDraft && this.discoveryApiTypes.includes(this.providerDraft.api_type)) },
    providerDraftStatus() {
      if (!this.providerDraft) return { code: "unavailable", label: "状态待确认", type: "info", reason: "请先选择服务商" }
      if (!this.providerDiscoverySupported) return { code: "manual_only", label: "仅手动添加", type: "info", reason: "该 API 类型不支持安全的模型自动发现，请手动添加模型" }
      const original = this.providers.find((item) => item.name === this.selectedProviderName)
      const draftBase = String(this.providerDraft.api_base || this.defaultApiBases[this.providerDraft.api_type] || "").replace(/\/$/, "")
      const originalBase = String(original?.api_base || this.defaultApiBases[original?.api_type] || "").replace(/\/$/, "")
      const temporaryKey = this.providerDraft.api_key_slots.some((slot) => String(slot.value || "").trim())
      if (original && !temporaryKey && (original.api_type !== this.providerDraft.api_type || originalBase !== draftBase)) return { code: "scope_changed", label: "凭据范围已变化", type: "warning", reason: "修改 API 类型或地址后，请填写临时 API Key 再测试" }
      if (!draftBase) return { code: "missing_base", label: "缺少 API 地址", type: "warning", reason: "请先填写 API 地址" }
      const hasSavedKey = this.providerDraft.api_key_slots.some((slot) => slot.existing_index != null)
      if (!temporaryKey && !hasSavedKey) return { code: "missing_credentials", label: "缺少有效凭据", type: "warning", reason: "请先填写有效 API Key" }
      return { code: "ready", label: "支持自动发现", type: "success", reason: "" }
    },
    selectedProbeResult() { return this.providerProbeResults[this.selectedProviderName || "__new__"] || null },
    groupNameErrors() {
      const counts = this.groupRows.reduce((result, row) => { const name = row.name.trim(); if (name) result[name] = (result[name] || 0) + 1; return result }, {})
      return this.groupRows.map((row) => !row.name.trim() ? "请填写路由组名称。" : counts[row.name.trim()] > 1 ? "路由组名称不能重复。" : "")
    },
    hasGroupErrors() { return this.groupNameErrors.some(Boolean) || this.groupRows.some((group) => Boolean(this.groupIssue(group))) },
  },
  mounted() { this.loadConfiguration() },
  beforeDestroy() { clearDirtyState("ai-configuration") },
  methods: {
    async loadConfiguration() {
      if (this.dirtyCount && !(await this.confirmDiscard())) return
      this.loading = true
      this.loadError = ""
      try {
        const response = await this.getRequest(`${this.$root.prefix}/ai/configuration`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.applyConfiguration(response.data)
        await this.loadPersona()
      } catch (error) { this.loadError = apiErrorDetail(error, "AI 配置加载失败，请检查服务状态后重试。") }
      finally { this.loading = false }
    },
    applyConfiguration(data, preferredName = "") {
      this.revision = data.revision; this.schema = data.schema || {}; this.apiTypes = data.api_types || []; this.defaultApiBases = data.default_api_bases || {}; this.discoveryApiTypes = data.discovery_api_types || []; this.effects = data.effects || {}; this.runtime = data.runtime || {}; this.providers = clone(data.providers || []); this.validationIssues = data.validation_issues || []; this.operationIssues = []
      this.originalSections = clone(data.sections || {}); this.sectionDrafts = clone(data.sections || {}); this.dirtySections = {}; this.invalidSections = {}; this.groupRows = this.groupsToRows(this.sectionDrafts.model_groups); this.selectedRouteGroupId = this.groupRows.some((item) => item.clientId === this.selectedRouteGroupId) ? this.selectedRouteGroupId : this.groupRows[0]?.clientId || ""; this.routingIssues = []
      const target = preferredName || this.selectedProviderName; this.selectedProviderName = this.providers.some((item) => item.name === target) ? target : this.providers[0]?.name || ""
      this.resetProviderDraft(); this.providerDirty = false; this.modelsDirty = false; this.syncDirty()
    },
    resetProviderDraft() {
      const provider = this.providers.find((item) => item.name === this.selectedProviderName)
      if (!provider) { this.providerDraft = null; return }
      const slots = provider.api_key_slots.map((slot) => ({ ...slot, value: "", clientId: uid() }))
      if (!slots.length) slots.push({ existing_index: null, value: "", clientId: uid() })
      this.providerDraft = { ...clone(provider), api_key_slots: slots, isNew: false }
    },
    async selectProvider(name) { if ((this.providerDirty || this.modelsDirty) && !(await this.confirmDiscard())) return; this.selectedProviderName = name; this.providerDirty = false; this.modelsDirty = false; this.resetProviderDraft(); this.syncDirty() },
    async confirmDiscard() { try { await this.$confirm("当前 AI 配置有尚未保存的修改。", "放弃修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", type: "warning" }); return true } catch (_) { return false } },
    async createProvider() { if ((this.providerDirty || this.modelsDirty) && !(await this.confirmDiscard())) return; this.selectedProviderName = ""; this.providerDraft = { name: "", api_type: "openai", api_base: "", timeout: 180, temperature: null, max_output_tokens: null, api_key_slots: [{ existing_index: null, value: "", clientId: uid() }], models: [], discovery_supported: true, isNew: true }; this.providerDirty = true; this.modelsDirty = false; this.syncDirty() },
    invalidateProbeResults() {
      const key = this.selectedProviderName || "__new__"
      if (this.providerProbeResults[key]) this.$delete(this.providerProbeResults, key)
    },
    markProviderDirty() { this.providerDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    handleApiTypeChange(value) { if (!this.providerDraft.api_base && this.defaultApiBases[value]) this.providerDraft.api_base = this.defaultApiBases[value]; this.markProviderDirty() },
    addKey() { this.providerDraft.api_key_slots.push({ existing_index: null, value: "", clientId: uid() }); this.markProviderDirty() },
    removeKey(index) { this.providerDraft.api_key_slots.splice(index, 1); this.markProviderDirty() },
    providerPayload({ includeModels = false } = {}) { return { expected_revision: this.revision, name: this.providerDraft.name.trim(), api_type: this.providerDraft.api_type, api_base: this.providerDraft.api_base?.trim() || null, timeout: this.providerDraft.timeout, temperature: this.providerDraft.temperature, max_output_tokens: this.providerDraft.max_output_tokens, api_keys: this.providerDraft.api_key_slots.map(({ existing_index, value }) => ({ existing_index, value: value || null })), models: this.providerDraft.isNew || includeModels ? this.providerDraft.models.map(({ capabilities, ...model }) => model) : null } },
    async saveProvider(options = {}) {
      const includeModels = Boolean(options?.includeModels)
      this.saving = options?.savingKey || "provider"
      try {
        const path = this.providerDraft.isNew ? "/ai/providers" : `/ai/providers/${encodeURIComponent(this.selectedProviderName)}`
        const payload = this.providerPayload({ includeModels })
        const response = this.providerDraft.isNew ? await this.postRequest(`${this.$root.prefix}${path}`, payload) : await this.putRequest(`${this.$root.prefix}${path}`, payload)
        if (!response.suc) throw new Error(response.info)
        const name = this.providerDraft.name.trim(); this.applyConfiguration(response.data, name); await this.handleAiApply(response)
        return true
      } catch (error) { this.captureOperationError(error, "服务商保存失败。"); return false }
      finally { this.saving = "" }
    },
    async removeProvider() {
      try { await this.$confirm(`删除 ${this.providerDraft.name} 后，引用该服务商的默认模型和路由必须先调整。`, "删除服务商？", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }) } catch (_) { return }
      try { const response = await this.deleteRequest(`${this.$root.prefix}/ai/providers/${encodeURIComponent(this.selectedProviderName)}?expected_revision=${encodeURIComponent(this.revision)}`); if (!response.suc) throw new Error(response.info); this.applyConfiguration(response.data); await this.handleAiApply(response) } catch (error) { this.captureOperationError(error, "服务商删除失败。") }
    },
    async discoverModels() {
      this.discovering = true
      const resultKey = this.selectedProviderName || "__new__"
      try {
        const temporaryKey = this.providerDraft.api_key_slots.find((slot) => slot.value)?.value || null
        const response = await this.postRequest(`${this.$root.prefix}/ai/providers/discover`, { provider_name: this.providerDraft.name.trim() || null, saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName, api_type: this.providerDraft.api_type, api_base: this.providerDraft.api_base, api_key: temporaryKey }, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.$set(this.providerProbeResults, resultKey, { success: true, message: `连接成功，发现 ${response.data.models?.length || 0} 个模型，耗时 ${response.data.latency_ms || 0} ms。` })
        this.discoveredModels = response.data.models || []; this.selectedDiscovered = []; this.discoveryDialog = true
      } catch (error) {
        const message = apiErrorDetail(error, "服务商连接测试失败。")
        this.operationIssues = apiErrorIssues(error)
        this.$set(this.providerProbeResults, resultKey, { success: false, message })
      }
      finally { this.discovering = false }
    },
    providerStatus(provider) {
      const probe = this.providerProbeResults[provider.name]
      if (probe) return probe.success ? { label: "最近验证成功", type: "success" } : { label: "最近验证失败", type: "danger" }
      const states = {
        ready: { label: "支持自动发现", type: "success" },
        manual_only: { label: "仅手动添加", type: "info" },
        missing_credentials: { label: "缺少有效凭据", type: "warning" },
        missing_base: { label: "缺少 API 地址", type: "warning" },
      }
      return states[provider.discovery_status] || { label: "状态待确认", type: "info" }
    },
    async addDiscoveredModels() {
      const exists = new Set(this.providerDraft.models.map((item) => item.model_name))
      let added = 0
      this.selectedDiscovered.forEach((name) => {
        if (!exists.has(name)) {
          this.providerDraft.models.push({ ...emptyModel(), model_name: name })
          exists.add(name); added += 1
        }
      })
      this.modelsDirty = this.modelsDirty || added > 0
      if (added) this.invalidateProbeResults()
      this.syncDirty()
      const saved = await this.saveProvider({ includeModels: true, savingKey: "discovered-models" })
      if (!saved) return
      this.discoveryDialog = false
      this.selectedDiscovered = []
    },
    openModelEditor(model = null, index = null) { this.modelDraft = model ? { ...clone(model), capabilities: undefined } : emptyModel(); this.modelEditIndex = index; this.modelDialog = true },
    confirmModel() { if (!this.modelDraft.model_name.trim()) return this.$message.warning("请填写模型名称。"); const value = { ...this.modelDraft, model_name: this.modelDraft.model_name.trim() }; delete value.capabilities; if (this.modelEditIndex == null) this.providerDraft.models.push(value); else this.providerDraft.models.splice(this.modelEditIndex, 1, value); this.modelsDirty = true; this.invalidateProbeResults(); this.modelDialog = false; this.syncDirty() },
    modelIndex(model) { return this.providerDraft.models.findIndex((item) => item === model || item.model_name === model.model_name) },
    deleteModel(model) { const actual = this.modelIndex(model); if (actual < 0) return; this.providerDraft.models.splice(actual, 1); this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    async saveModels() { this.saving = "models"; try { const models = this.providerDraft.models.map(({ capabilities, ...model }) => model); const response = await this.putRequest(`${this.$root.prefix}/ai/providers/${encodeURIComponent(this.selectedProviderName)}/models`, { expected_revision: this.revision, models }); if (!response.suc) throw new Error(response.info); this.applyConfiguration(response.data, this.selectedProviderName); await this.handleAiApply(response) } catch (error) { this.captureOperationError(error, "模型列表保存失败。") } finally { this.saving = "" } },
    capabilityTags(model) { const caps = model.capabilities || {}; const result = []; if (caps.is_embedding_model) result.push("Embedding"); if (caps.is_rerank_model) result.push("Rerank"); if ((caps.output_modalities || []).includes("image")) result.push("图像"); if ((caps.output_modalities || []).includes("audio")) result.push("语音"); if (caps.supports_tool_calling) result.push("工具"); return result.slice(0, 3) },
    modelTask(model) { const caps = model.capabilities || {}; if (caps.is_embedding_model || model.task_type === "embedding") return "embedding"; if (caps.is_rerank_model || model.task_type === "rerank") return "rerank"; if ((caps.output_modalities || []).includes("image") || model.task_type === "image_generation") return "image"; if ((caps.output_modalities || []).includes("audio") || model.task_type === "tts") return "tts"; return "chat" },
    async testModel(model) {
      const task = this.modelTask(model)
      const providerName = this.providerDraft.name.trim() || this.selectedProviderName
      if (!providerName) return this.$message.warning("请先填写服务商名称。")
      try { await this.$confirm(`将对 ${providerName}/${model.model_name} 发起一次最小 ${task} 请求，可能产生费用。`, "确认模型测试", { type: "warning" }) } catch (_) { return }
      try {
        const temporaryKey = this.providerDraft.api_key_slots.find((slot) => String(slot.value || "").trim())?.value || null
        const { capabilities, ...modelConfig } = model
        const response = await this.postRequest(`${this.$root.prefix}/ai/models/test`, {
          model: `${providerName}/${model.model_name}`,
          provider_name: providerName,
          saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName,
          api_type: this.providerDraft.api_type,
          api_base: this.providerDraft.api_base,
          api_key: temporaryKey,
          timeout: this.providerDraft.timeout,
          model_config: modelConfig,
          task,
          confirmed_paid_request: true,
        }, { suppressErrorToast: true })
        this.$message.success(`连接成功，延迟 ${response.data.latency_ms} ms`)
      } catch (error) { this.$message.error(apiErrorDetail(error, "模型测试失败。")) }
    },
    async loadPersona() {
      this.personaLoading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/ai/personas/default`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.personaAvailable = Boolean(response.data?.available)
        if (!this.personaAvailable) { this.personaRevision = ""; this.personaOriginal = null; this.personaDirty = false; return }
        this.personaRevision = response.data.revision
        this.personaDraft = clone(response.data.persona)
        this.personaToneText = (this.personaDraft.tone_examples || []).join("\n")
        this.personaDialogueText = (this.personaDraft.preset_dialogues || []).join("\n\n")
        this.personaOriginal = this.personaSnapshot()
        this.personaDirty = false
      } catch (error) {
        this.personaAvailable = false
        this.$message.error(apiErrorDetail(error, "AI 人设加载失败。"))
      } finally { this.personaLoading = false; this.syncDirty() }
    },
    personaSnapshot() { return { ...clone(this.personaDraft), tone_examples: this.personaToneText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), preset_dialogues: this.personaDialogueText.split(/(?:\r?\n){2,}/).map((item) => item.trim()).filter(Boolean) } },
    markPersonaDirty() { this.personaDirty = JSON.stringify(this.personaSnapshot()) !== JSON.stringify(this.personaOriginal); this.syncDirty() },
    resetPersona() {
      if (!this.personaOriginal) return
      this.personaDraft = clone(this.personaOriginal)
      this.personaToneText = (this.personaOriginal.tone_examples || []).join("\n")
      this.personaDialogueText = (this.personaOriginal.preset_dialogues || []).join("\n\n")
      this.personaDirty = false; this.syncDirty()
    },
    async savePersona() {
      if (!this.personaDraft.name.trim() || !this.personaDraft.prompt.trim()) return
      this.personaSaving = true
      try {
        const response = await this.putRequest(`${this.$root.prefix}/ai/personas/default`, { expected_revision: this.personaRevision, ...this.personaSnapshot() })
        if (!response.suc) throw new Error(response.info)
        this.personaRevision = response.data.revision; this.personaDraft = clone(response.data.persona)
        this.personaToneText = (this.personaDraft.tone_examples || []).join("\n"); this.personaDialogueText = (this.personaDraft.preset_dialogues || []).join("\n\n")
        this.personaOriginal = this.personaSnapshot(); this.personaDirty = false; this.syncDirty(); this.$message.success(response.info || "AI 人设已保存。")
      } catch (error) { this.$message.error(apiErrorDetail(error, "AI 人设保存失败。")) }
      finally { this.personaSaving = false }
    },
    resolveSchema(node) { if (!node?.$ref) return node || {}; return node.$ref.replace(/^#\//, "").split("/").reduce((value, key) => value?.[key], this.schema) || node },
    sectionSchema(name) { const properties = this.schema.properties || {}; const map = { context: "context_settings", agent: "agent_settings", sandbox: "sandbox" }; if (name === "advanced") return { type: "object", properties: { client_settings: properties.client_settings, debug_log: properties.debug_log, provider_settings: properties.provider_settings } }; return this.resolveSchema(properties[map[name]]) },
    sectionFieldUi(name) {
      if (name === "context") return {
        llm_summary: { label: "对话总结压缩", order: 10 },
        vision_window_size: { label: "多模态窗口轮数", order: 20 },
        tool_pruning: { label: "工具结果修剪", order: 30 },
      }
      if (name === "agent") return {
        max_cycles: { label: "单次最大循环", order: 10 },
        global_max_cycles: { label: "全局最大循环", order: 20 },
        enable_parallel_calls: { label: "并行工具调用", order: 30 },
        reflexion_retries: { label: "反思重试次数", order: 40 },
        enable_fallback_summary: { label: "启用兜底总结", order: 50 },
        enable_hitl: { label: "允许向用户求助", order: 60 },
        mcp_cleanup_timeout: { label: "MCP 闲置回收", order: 70, unit: "秒" },
      }
      if (name === "sandbox") return {
        enable_sandbox: { label: "启用沙箱", order: 0 },
        sandbox_type: { label: "沙箱驱动", order: 10, options: [{ label: "Docker", value: "docker" }], visible_when: { path: "enable_sandbox", operator: "eq", value: true } },
        docker_image: { label: "Docker 镜像", order: 20, visible_when: { path: "enable_sandbox", operator: "eq", value: true } },
        cleanup_timeout: { label: "闲置清理时间", order: 30, unit: "秒", visible_when: { path: "enable_sandbox", operator: "eq", value: true } },
        enable_vfs_helper: { label: "VFS 路径防护", order: 40, visible_when: { path: "enable_sandbox", operator: "eq", value: true } },
      }
      if (name === "advanced") return {
        client_settings: { label: "客户端请求策略", order: 10 },
        debug_log: { label: "调试日志", order: 20 },
        provider_settings: { label: "厂商高级设置", order: 30 },
      }
      return {}
    },
    markSectionDirty(name) {
      this.$nextTick(() => {
        const dirty = JSON.stringify(this.sectionDrafts[name] ?? {}) !== JSON.stringify(this.originalSections[name] ?? {})
        this.$set(this.dirtySections, name, dirty)
        this.syncDirty()
      })
    },
    isSectionDirty(name) { return Boolean(this.dirtySections[name]) },
    resetSection(name) { this.$set(this.sectionDrafts, name, clone(this.originalSections[name])); if (name === "model_groups") { this.groupRows = this.groupsToRows(this.sectionDrafts.model_groups); this.selectedRouteGroupId = this.groupRows[0]?.clientId || ""; this.routingIssues = [] } this.$set(this.dirtySections, name, false); this.syncDirty() },
    setSectionValidity(name, paths) { this.$set(this.invalidSections, name, paths || []) },
    sectionInvalid(name) { return Boolean(this.invalidSections[name]?.length) },
    async saveSection(name, value = this.sectionDrafts[name]) { if (this.sectionInvalid(name)) return; this.saving = name; try { const response = await this.putRequest(`${this.$root.prefix}/ai/configuration/sections/${name}`, { expected_revision: this.revision, value }); if (!response.suc) throw new Error(response.info); this.applyConfiguration(response.data, this.selectedProviderName); await this.handleAiApply(response) } catch (error) { this.captureOperationError(error, "AI 配置保存失败。") } finally { this.saving = "" } },
    groupsToRows(groups) { const names = new Set(Object.keys(groups || {})); return Object.entries(groups || {}).map(([name, targets]) => ({ name, targets: targets.map((value) => ({ kind: names.has(value) ? "group" : "model", value, clientId: uid() })), clientId: uid() })) },
    addGroup() { const group = { name: "", targets: [], clientId: uid() }; this.groupRows.push(group); this.selectedRouteGroupId = group.clientId; this.markGroupsDirty() },
    removeGroup(index) { this.groupRows.splice(index, 1); this.markGroupsDirty() },
    removeSelectedGroup() { const index = this.groupRows.findIndex((item) => item.clientId === this.selectedRouteGroupId); if (index < 0) return; this.groupRows.splice(index, 1); this.selectedRouteGroupId = this.groupRows[Math.max(0, index - 1)]?.clientId || ""; this.markGroupsDirty() },
    markGroupsDirty() { this.routingIssues = []; this.$set(this.dirtySections, "model_groups", true); this.syncDirty() },
    targetOptions(kind, currentGroup) { if (kind === "group") return this.groupRows.filter((item) => item.clientId !== currentGroup.clientId && item.name.trim()).map((item) => ({ label: item.name.trim(), value: item.name.trim(), tag: "路由组" })); return this.allModels.filter((item) => item.is_available).map((item) => ({ label: item.fullName, value: item.fullName, tag: this.modelTask(item) })) },
    changeTargetKind(target) { target.value = ""; this.markGroupsDirty() },
    addTarget() { if (!this.selectedRouteGroup) return; this.selectedRouteGroup.targets.push({ kind: "model", value: "", clientId: uid() }); this.markGroupsDirty() },
    removeTarget(index) { this.selectedRouteGroup.targets.splice(index, 1); this.markGroupsDirty() },
    moveTarget(index, direction) { const target = this.selectedRouteGroup.targets.splice(index, 1)[0]; this.selectedRouteGroup.targets.splice(index + direction, 0, target); this.markGroupsDirty() },
    groupIssue(group, field = "") {
      const index = this.groupRows.indexOf(group)
      const nameError = this.groupNameErrors[index]
      if (field === "name") return nameError
      if (nameError) return nameError
      if (!group.targets.length) return "至少需要一个路由目标。"
      const values = group.targets.map((item) => item.value.trim())
      if (values.some((value) => !value)) return "请选择完整的路由目标。"
      if (new Set(values).size !== values.length) return "同一路由组不能重复引用目标。"
      if (values.includes(group.name.trim())) return "路由组不能引用自身。"
      const graph = Object.fromEntries(this.groupRows.map((item) => [item.name.trim(), item.targets.filter((target) => target.kind === "group").map((target) => target.value)]))
      const visit = (name, stack = []) => stack.includes(name) || (graph[name] || []).some((next) => visit(next, [...stack, name]))
      if (visit(group.name.trim())) return "路由组之间存在循环引用。"
      return ""
    },
    async saveGroups() {
      if (this.hasGroupErrors) { this.$message.warning("请先修正路由组名称、目标或循环引用。"); return }
      const value = this.groupRows.map((item) => ({ name: item.name.trim(), targets: item.targets.map((target) => target.value.trim()) }))
      this.saving = "model_groups"
      try {
        const validation = await this.postRequest(`${this.$root.prefix}/ai/configuration/validate-routing`, { value })
        this.routingIssues = validation.data?.issues || []
        if (!validation.suc || !validation.data?.valid) { this.$message.warning("模型路由校验未通过。"); return }
        await this.saveSection("model_groups", value)
      } catch (error) { this.captureOperationError(error, "模型路由校验失败。") }
      finally { if (this.saving === "model_groups") this.saving = "" }
    },
    modelsForTask(task) { return this.allModels.filter((model) => { const caps = model.capabilities || {}; if (!model.is_available) return false; if (task === "embedding") return caps.is_embedding_model || model.task_type === "embedding"; if (task === "rerank") return caps.is_rerank_model || model.task_type === "rerank"; if (task === "image") return (caps.output_modalities || []).includes("image") || model.task_type === "image_generation"; if (task === "tts") return (caps.output_modalities || []).includes("audio") || model.task_type === "tts"; return !caps.is_embedding_model && !caps.is_rerank_model && ((caps.output_modalities || ["text"]).includes("text")) }) },
    captureOperationError(error, fallback) { this.operationIssues = apiErrorIssues(error); this.$message.error(apiErrorDetail(error, fallback)) },
    handleAiApply(response) { return handleApplyResult(this, response, { restartPrompt: "AI 启动期配置已保存，需要重启后生效。", restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}), returnRoute: "/ai", recoveryMessage: "AI 启动期配置将在新进程中生效。" }) },
    operationError(path) {
      const expected = path.toLowerCase()
      return this.operationIssues.find((issue) => {
        const actual = String(issue.path || "").replace(/\[(\d+)\]/g, ".$1").toLowerCase()
        return actual === expected || actual.endsWith(`.${expected}`)
      })?.message || ""
    },
    syncDirty() { setDirtyState("ai-configuration", this.dirtyCount > 0) },
  },
}
</script>

<style scoped>
.ai-page { min-height: 100%; padding: 20px 22px 32px; overflow-y: auto; color: var(--text-color); background: var(--bg-color); }.page-header, .section-title, .subheading, .provider-actions, .models-save, .section-action { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.page-header { margin-bottom: 12px; }.configuration-warning { margin-bottom: 12px; }.configuration-warning code { margin-right: 6px; }.load-error { display: grid; min-height: 260px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 28px; border: 1px solid var(--danger-color); border-radius: 8px; background: var(--bg-color-secondary); }.load-error > i { color: var(--danger-color); font-size: 34px; }.load-error h2 { margin: 0; font-size: 18px; }.load-error p { margin: 8px 0 0; color: var(--text-color-secondary); }.page-header h1, .section-title h2, .subheading h3 { margin: 0; letter-spacing: 0; }.page-header h1 { font-size: 24px; }.page-header p, .section-title p, .subheading p { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 13px; }.header-status { display: flex; align-items: center; gap: 8px; }.ai-tabs { min-height: 0; }.provider-workbench { display: grid; min-height: 650px; grid-template-columns: 250px minmax(0, 1fr); border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.provider-sidebar { min-width: 0; padding: 16px; border-right: 1px solid var(--border-color); }.sidebar-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }.provider-list { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }.provider-list button { display: flex; width: 100%; min-height: 58px; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.provider-list button:hover { background: var(--bg-color-hover); }.provider-list button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.provider-list span { display: flex; min-width: 0; flex-direction: column; }.provider-list strong, .provider-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.provider-list small { margin-top: 4px; color: var(--text-color-secondary); }.provider-main { min-width: 0; padding: 20px 22px 26px; }.provider-form, .advanced-grid, .default-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.full-control { width: 100%; }.secret-section, .models-section { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-color-light); }.secret-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 10px; }.advanced-collapse { margin-top: 14px; border-bottom: 0; }.provider-actions { margin-top: 18px; }.models-section { margin-top: 24px; }.model-search { max-width: 420px; margin: 14px 0 10px; }.model-list { border-top: 1px solid var(--border-color-light); }.model-row { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-color-light); }.model-name { display: flex; min-width: 0; flex-direction: column; gap: 7px; }.model-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.model-name span { display: flex; flex-wrap: wrap; gap: 5px; }.model-actions { flex: none; white-space: nowrap; }.models-save { margin-top: 14px; }.models-save span { color: var(--warning-color); font-size: 12px; }.provider-empty { display: grid; place-content: center; color: var(--text-color-secondary); text-align: center; }.provider-empty i { font-size: 42px; }.settings-section { min-height: 480px; padding: 20px 22px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.section-action { position: sticky; bottom: 0; z-index: 3; margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color); }.section-action span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.group-row { display: grid; grid-template-columns: 210px minmax(0, 1fr) auto; gap: 10px; margin-top: 12px; }.empty-copy { padding: 30px 12px; color: var(--text-color-secondary); text-align: center; }.danger-text { color: var(--danger-color) !important; }.model-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }.discovery-list { display: grid; max-height: 360px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; overflow-y: auto; }.discovery-list .el-checkbox { min-width: 0; margin-right: 0; overflow: hidden; text-overflow: ellipsis; }.dialog-note { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }
@media (max-width: 820px) { .ai-page { padding: 12px; }.page-header, .section-title, .subheading { align-items: flex-start; flex-direction: column; }.header-status { width: 100%; flex-wrap: wrap; }.load-error { min-height: 220px; grid-template-columns: auto minmax(0, 1fr); padding: 20px; }.load-error .el-button { grid-column: 1 / -1; }.provider-workbench { grid-template-columns: 1fr; }.provider-sidebar { border-right: 0; border-bottom: 1px solid var(--border-color); }.provider-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.provider-main { padding: 16px; }.provider-form, .advanced-grid, .default-grid, .model-form { grid-template-columns: 1fr; }.group-row { grid-template-columns: 1fr auto; }.group-row .el-select { grid-column: 1 / -1; grid-row: 2; }.model-row { align-items: flex-start; flex-direction: column; padding: 10px 0; }.model-actions { align-self: flex-end; }.discovery-list { grid-template-columns: 1fr; } }
.mobile-provider-select { display: none; width: 100%; margin-top: 10px; }
.group-name-field { margin-bottom: 0; }
.route-section { padding: 0; overflow: hidden; }
.route-section > .section-title { padding: 20px 22px 16px; }
.route-workbench { display: grid; min-height: 500px; grid-template-columns: 240px minmax(0, 1fr); border-top: 1px solid var(--border-color); }
.route-sidebar { display: flex; min-width: 0; flex-direction: column; gap: 5px; padding: 14px; border-right: 1px solid var(--border-color); }
.route-sidebar .el-input { margin-bottom: 6px; }
.route-sidebar button { display: flex; min-height: 54px; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }
.route-sidebar button:hover, .route-sidebar button.active { background: var(--bg-color-hover); }
.route-sidebar button.active { border-color: var(--primary-color); }
.route-sidebar button span { display: flex; min-width: 0; flex-direction: column; }
.route-sidebar strong, .route-sidebar small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.route-sidebar small { margin-top: 4px; color: var(--text-color-secondary); }
.route-sidebar i { color: var(--warning-color); }
.route-editor { min-width: 0; padding: 18px 20px; }
.route-editor-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.route-name-field label { display: block; margin-bottom: 8px; color: var(--text-color); font-size: 14px; }
.route-field-error { margin-top: 5px; color: var(--danger-color); font-size: 12px; line-height: 1.4; }
.route-target-list { margin-top: 12px; border-top: 1px solid var(--border-color-light); }
.route-target-row { display: grid; min-height: 64px; grid-template-columns: 64px 110px minmax(0, 1fr) auto; align-items: center; gap: 10px; border-bottom: 1px solid var(--border-color-light); }
.route-order { color: var(--text-color-secondary); font-size: 12px; }
.route-target-actions { display: flex; gap: 5px; }
.route-option-tag { float: right; margin-top: 7px; }
.route-empty { padding: 38px 12px; color: var(--text-color-secondary); text-align: center; }
.add-route-target, .route-issues { margin-top: 14px; }
.persona-section { min-height: 520px; }.persona-form { margin-top: 18px; }.persona-basics { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 18px; }.persona-section .el-alert { margin-top: 18px; }.persona-section .el-alert p { margin: 0 0 12px; }
.provider-heading-actions { display: flex; align-items: center; gap: 10px; }.provider-probe-result { margin-top: 12px; }
@media (max-width: 820px) { .mobile-provider-select { display: block; }.provider-list { display: none; } }
@media (max-width: 820px) { .route-workbench { grid-template-columns: 1fr; }.route-sidebar { border-right: 0; border-bottom: 1px solid var(--border-color); }.route-editor { padding: 16px; }.route-target-row { grid-template-columns: 54px 100px minmax(0, 1fr); padding: 10px 0; }.route-target-actions { grid-column: 2 / -1; justify-content: flex-end; } }
@media (max-width: 620px) { .persona-basics { grid-template-columns: 1fr; gap: 0; } }
@media (max-width: 460px) { .provider-list { grid-template-columns: 1fr; }.provider-actions, .models-save, .section-action { align-items: stretch; flex-direction: column; }.section-action span { margin: 0; }.secret-row { grid-template-columns: 1fr; } }
</style>
