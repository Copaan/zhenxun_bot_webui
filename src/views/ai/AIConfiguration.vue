<template>
  <div class="ai-page" v-loading="loading">
    <section v-if="sessionExpired" class="configuration-warning" role="alert">
      <p>登录已失效，草稿已保留。重新登录后可继续保存。</p>
      <el-input v-model="loginUsername" placeholder="管理员账号" autocomplete="username" />
      <el-input v-model="loginPassword" placeholder="密码" show-password autocomplete="current-password" />
      <el-button :loading="loggingIn" @click="relogin">重新登录</el-button>
    </section>
    <header class="page-header">
      <div><h1>AI 配置</h1><p>管理模型服务商、任务路由和运行策略</p></div>
      <div class="header-status">
        <el-button :disabled="Boolean(saving) || !validationIssues.length" @click="previewRepair">修复失效引用</el-button>
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

    <template v-else>
    <el-select v-model="activeSection" class="mobile-section-select" aria-label="配置分区">
      <el-option v-for="item in sectionOptions" :key="item.name" :label="item.label" :value="item.name" />
    </el-select>
    <el-tabs v-model="activeSection" class="ai-tabs">
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
              <div><h2>{{ providerDraft.isNew ? "添加服务商" : providerDraft.name }}</h2><p>已保存的密钥默认隐藏，点击眼睛图标查看；删除某一行即删除该密钥。</p></div>
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
              <div class="subheading"><div><h3>API Keys</h3><p>支持多密钥轮询。</p></div><el-button size="small" icon="el-icon-plus" @click="addKey">添加密钥</el-button></div>
              <div v-for="(slot, index) in providerDraft.api_key_slots" :key="slot.clientId" class="secret-row">
                <el-input v-model="slot.value" autocomplete="new-password" placeholder="输入 API Key" show-password @input="markProviderDirty" />
                <el-button type="text" icon="el-icon-delete" class="danger-text" @click="removeKey(index)">删除</el-button>
              </div>
              <div v-if="operationError('api_key')" class="field-error" role="alert">{{ operationError("api_key") }}</div>
              <p v-else-if="!providerHasKey" class="secret-hint"><i class="el-icon-info"></i> 未填写 API Key 也可以保存服务商和模型，但调用需要鉴权的服务时会失败。</p>
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
              <div class="subheading"><div><h3>模型</h3><p>增删或编辑模型后，与服务商参数一起保存。</p></div><el-button size="small" icon="el-icon-plus" @click="openModelEditor()">手动添加</el-button></div>
              <el-input v-model="modelSearch" clearable prefix-icon="el-icon-search" placeholder="搜索模型" class="model-search" />
              <div class="model-list">
                <div v-for="model in filteredModels" :key="model.model_name" class="model-row">
                  <div class="model-name"><strong>{{ model.model_name }}</strong><span><el-tag v-if="model.is_available" size="mini" type="success">启用</el-tag><el-tag v-else size="mini" type="info">停用</el-tag><el-tag v-for="tag in capabilityTags(model)" :key="tag" size="mini">{{ tag }}</el-tag></span></div>
                  <div class="model-actions"><el-button type="text" icon="el-icon-connection" :loading="testingModelKey === modelTestKey(model)" :disabled="Boolean(testingModelKey)" @click="testModel(model)">测试</el-button><el-button type="text" icon="el-icon-edit" :disabled="Boolean(testingModelKey)" @click="openModelEditor(model, modelIndex(model))">编辑</el-button><el-button type="text" icon="el-icon-delete" class="danger-text" :disabled="Boolean(testingModelKey)" @click="deleteModel(model)">删除</el-button></div>
                </div>
                <div v-if="!filteredModels.length" class="empty-copy">没有匹配的模型</div>
              </div>
            </section>
            <SectionAction :dirty="providerDirty || modelsDirty" :saving="saving === 'provider'" :invalid="!providerDraft.name.trim()" :effect="providerSaveEffect" reset-label="撤销修改" @reset="resetProvider" @save="saveProvider" />
          </main>
          <main v-else class="provider-empty"><i class="el-icon-connection"></i><p>选择或添加一个 AI 服务商</p></main>
        </div>
      </el-tab-pane>

      <el-tab-pane label="默认模型" name="default_models">
        <section class="settings-section"><div class="section-title"><div><h2>默认任务模型</h2><p>只显示适合对应任务的已配置模型，以及所含模型全部适合该任务的路由组。</p></div></div>
          <el-form label-position="top" class="default-grid"><el-form-item v-for="task in defaultTasks" :key="task.key" :label="task.label" :error="operationError(`default_models.${task.key}`)"><el-select :value="sectionDrafts.default_models[task.key]" clearable filterable placeholder="未配置" class="full-control" @change="setDefaultModel(task.key, $event)"><el-option-group label="模型"><el-option v-for="model in modelsForTask(task.key)" :key="model.fullName" :label="model.fullName" :value="model.fullName" /></el-option-group><el-option-group label="路由组"><el-option v-for="group in groupsForTask(task.key)" :key="group" :label="group" :value="group" /></el-option-group></el-select></el-form-item></el-form>
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
          <el-alert v-if="personaError" title="AI 人设加载失败" type="error" :closable="false" show-icon>
            <p>{{ personaError }}</p>
            <el-button size="small" plain @click="loadPersona">重新加载</el-button>
          </el-alert>
          <el-alert v-else-if="personaAvailable === false" title="当前没有可管理的人设" type="info" :closable="false" show-icon>
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
            <el-form-item label="语气样例"><el-input v-model="personaToneText" type="textarea" :rows="4" placeholder="每行一条，最多 12 条，只用于参考表达方式" @input="markPersonaDirty" /></el-form-item>
            <el-form-item label="示例对话"><el-input v-model="personaDialogueText" type="textarea" :rows="6" placeholder="每段一组示例对话，段落之间留一个空行，最多 12 段" @input="markPersonaDirty" /></el-form-item>
          </el-form>
        </section>
        <SectionAction v-if="personaAvailable" :dirty="personaDirty" :saving="personaSaving" :invalid="!personaDraft.name.trim() || !personaDraft.prompt.trim()" effect="下一条消息生效" @reset="resetPersona" @save="savePersona" />
      </el-tab-pane>

      <el-tab-pane label="AI聊天" name="chat_plugins" lazy>
        <StoreTemplate ref="chatStore" capability="ai_chat" embedded @session-expired="sessionExpired = true; aiEpoch += 1" />
      </el-tab-pane>

      <el-tab-pane v-for="tab in schemaTabs" :key="tab.name" :label="tab.label" :name="tab.name">
        <SettingsLayout v-model="settingsCategory[tab.name]" :query="settingsSearch[tab.name]" :groups="settingGroups[tab.name]" @search="settingsSearch[tab.name] = $event">
          <section v-for="group in settingGroups[tab.name]" v-show="settingsSearch[tab.name].trim() ? group.count > 0 : settingsCategory[tab.name] === group.key" :key="group.key">
            <header class="settings-group-heading"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><el-tag :type="group.restart ? 'warning' : 'success'" size="mini">{{ group.restart ? "部分设置需重启" : "保存后热加载" }}</el-tag></header>
            <div v-for="(field, index) in group.fields" v-show="settingMatches(tab.name, field)" :key="field.path">
              <h4 v-if="field.section && (index === 0 || group.fields[index - 1].section !== field.section)" class="advanced-provider-heading">{{ field.section }}</h4>
              <SchemaField presentation="settings" :value="settingValue(tab.name, field)" :schema="field.schema" :root-schema="schema" :label="field.label" :path="field.path" :ui="settingUi(tab.name, field)" :query="settingsSearch[tab.name]" :issues="settingIssues(tab.name)" @input="updateSetting(tab.name, field, $event)">
                <template #meta><el-tag v-if="field.ui.restart" size="mini" type="warning" class="setting-restart">重启后生效</el-tag><span v-if="settingChanged(tab.name, field)" class="advanced-modified">未保存修改</span></template>
              </SchemaField>
            </div>
            <p v-if="group.key === 'client_settings'" class="advanced-proxy-note">代理由统一网络策略管理。<el-button type="text" @click="$router.push('/network-proxy')">打开网络代理设置</el-button></p>
          </section>
          <template #footer><div class="save-description"><strong>{{ settingChangeCount(tab.name) ? settingChangeCount(tab.name) + " 项未保存修改" : "没有未保存的修改" }}</strong><span v-if="settingChangeCount(tab.name)">保存本页全部分类，{{ tab.effect }}</span></div><el-button :disabled="!isSectionDirty(tab.name) || Boolean(saving)" @click="resetSettings(tab.name)">撤销修改</el-button><el-button type="primary" :disabled="!isSectionDirty(tab.name)" :loading="saving === tab.name" @click="saveSettings(tab.name)">{{ tab.saveLabel }}</el-button></template>
        </SettingsLayout>
      </el-tab-pane>
    </el-tabs>
    </template>

    <el-dialog title="修复失效引用" :visible.sync="repairVisible" width="min(720px, 94vw)" append-to-body>
      <p>保留服务商、密钥和有效路由。只清除以下失效引用；已有草稿会保留。</p>
      <div v-for="(change, index) in repairPreview.changes || []" :key="index" class="repair-change"><code>{{ change.path }}</code><p>{{ JSON.stringify(change.before) }} → {{ JSON.stringify(change.after) }}</p></div>
      <el-alert v-if="(repairPreview.remaining_issues || []).length" type="warning" :closable="false" title="仍有需要手动处理的项目"><p v-for="(issue, index) in repairPreview.remaining_issues" :key="index">{{ issue.message }}</p></el-alert>
      <span slot="footer"><el-button @click="repairVisible = false">取消</el-button><el-button type="primary" :loading="saving === 'repair'" :disabled="!(repairPreview.changes || []).length || Boolean(saving)" @click="applyRepair">确认修复</el-button></span>
    </el-dialog>

    <el-dialog :title="modelEditIndex == null ? '添加模型' : '编辑模型'" :visible.sync="modelDialog" width="min(620px, 92vw)" append-to-body>
      <el-form label-position="top" class="model-form"><el-form-item label="模型名称"><el-input v-model="modelDraft.model_name" /></el-form-item><el-form-item label="启用"><el-switch v-model="modelDraft.is_available" /></el-form-item><el-form-item label="任务类型"><el-select v-model="modelDraft.task_type" clearable class="full-control"><el-option label="自动识别" :value="null" /><el-option label="图像生成" value="image_generation" /><el-option label="Embedding" value="embedding" /><el-option label="Rerank" value="rerank" /><el-option label="TTS" value="tts" /></el-select></el-form-item><el-form-item label="最大输入 Token"><el-input-number v-model="modelDraft.max_input_tokens" :min="1" controls-position="right" class="full-control" /></el-form-item><el-form-item label="最大输出 Token"><el-input-number v-model="modelDraft.max_output_tokens" :min="1" controls-position="right" class="full-control" /></el-form-item><el-form-item label="推理强度"><el-select v-model="modelDraft.reasoning_effort" clearable class="full-control"><el-option v-for="item in ['none','low','medium','high','xhigh']" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-form>
      <span slot="footer"><el-button icon="el-icon-close" @click="modelDialog = false">取消</el-button><el-button type="primary" icon="el-icon-check" @click="confirmModel">确定</el-button></span>
    </el-dialog>

    <el-dialog title="发现模型" :visible.sync="discoveryDialog" width="min(680px, 92vw)" append-to-body>
      <el-input v-model="discoverySearch" clearable prefix-icon="el-icon-search" placeholder="筛选远端模型" />
      <el-checkbox-group v-model="selectedDiscovered" class="discovery-list"><el-checkbox v-for="name in filteredDiscovered" :key="name" :label="name">{{ name }}</el-checkbox></el-checkbox-group>
      <span slot="footer"><span class="dialog-note">发现 {{ discoveredModels.length }} 个模型</span><el-button icon="el-icon-close" @click="discoveryDialog = false">取消</el-button><el-button type="primary" icon="el-icon-plus" :disabled="!selectedDiscovered.length" @click="addDiscoveredModels">添加到模型列表</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import SettingsLayout from "@/components/config/SettingsLayout.vue"
import SchemaField from "@/components/config/SchemaField.vue"
import { advancedSettingGroups, aiSectionGroups, valueAt, updateAt } from "@/components/config/settings-ui"
import { fieldMatches, validateField } from "@/components/config/schema-utils"
import StoreTemplate from "@/components/store/StoreTemplate.vue"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"
import { localLogin } from "@/utils/local-login"
import { removeRoutingGroup, routingGroupsForModels } from "@/utils/ai-routing"

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const emptyModel = () => ({ model_name: "", is_available: true, temperature: null, max_output_tokens: null, api_type: null, endpoint: null, task_type: null, path_prefix: null, max_input_tokens: null, reasoning_effort: null })

const TASK_TYPES = { embedding: ["embedding"], rerank: ["rerank"], image: ["image_generation"], tts: ["tts"] }
const SECTION_KEYS = { context: "context_settings", agent: "agent_settings", sandbox: "sandbox" }

const SectionAction = {
  props: { dirty: Boolean, saving: Boolean, invalid: Boolean, effect: String, invalidText: { type: String, default: "请先修正表单错误" }, resetLabel: { type: String, default: "撤销本区修改" } },
  render(h) {
    return h("div", { class: "section-action" }, [
      h("span", this.invalid ? this.invalidText : this.effect),
      h("el-button", { props: { icon: "el-icon-refresh-left", disabled: !this.dirty }, on: { click: () => this.$emit("reset") } }, this.resetLabel),
      h("el-button", { props: { type: "primary", icon: "el-icon-check", loading: this.saving, disabled: !this.dirty || this.invalid }, on: { click: () => this.$emit("save") } }, "保存"),
    ])
  },
}

export default {
  name: "AIConfiguration",
  components: { SchemaField, SettingsLayout, StoreTemplate, SectionAction },
  data() {
    return {
      settingsCategory: { context: "llm_summary", agent: "loop", sandbox: "runtime", advanced: "client_settings" }, settingsSearch: { context: "", agent: "", sandbox: "", advanced: "" }, settingsLocalIssues: {}, repairVisible: false, repairPreview: {}, sessionExpired: false, loginUsername: "", loginPassword: "", loggingIn: false, aiEpoch: 0,
      loading: false, loadError: "", saving: "", activeSection: "providers", revision: "", schema: {}, apiTypes: [], defaultApiBases: {}, discoveryApiTypes: [], providers: [], validationIssues: [], operationIssues: [], selectedProviderName: "", providerDraft: null,
      providerSearch: "", providerDirty: false, modelsDirty: false, modelSearch: "", sectionDrafts: { default_models: {}, model_groups: {}, context: {}, agent: {}, sandbox: {}, advanced: {} }, originalSections: {}, dirtySections: {}, invalidSections: {}, groupRows: [], routeSearch: "", selectedRouteGroupId: "", routingIssues: [],
      discovering: false, discoveryDialog: false, discoveredModels: [], selectedDiscovered: [], discoverySearch: "", providerProbeResults: {}, modelDialog: false, modelDraft: emptyModel(), modelEditIndex: null, testingModelKey: "",
      personaLoading: false, personaSaving: false, personaAvailable: null, personaError: "", personaRevision: "", personaDraft: { name: "", prompt: "", style: "", enabled: true }, personaOriginal: null, personaToneText: "", personaDialogueText: "", personaDirty: false,
      defaultTasks: [{ key: "chat", label: "对话" }, { key: "embedding", label: "向量嵌入" }, { key: "tts", label: "语音合成" }, { key: "image", label: "图像生成" }, { key: "rerank", label: "文本重排" }],
      schemaTabs: [
        { name: "context", label: "上下文", saveLabel: "保存上下文设置", effect: "保存后立即热加载" },
        { name: "agent", label: "Agent", saveLabel: "保存 Agent 设置", effect: "保存后立即热加载" },
        { name: "sandbox", label: "沙箱", saveLabel: "保存沙箱设置", effect: "部分设置在新会话或重启后生效" },
        { name: "advanced", label: "高级设置", saveLabel: "保存高级设置", effect: "保存后立即热加载" },
      ],
    }
  },
  computed: {
    /**
     * 移动端分区下拉框的选项，与标签页一一对应
     * @returns {{ name: string, label: string }[]} 分区名称与标题
     */
    sectionOptions() {
      return [
        { name: "providers", label: "服务商与模型" },
        { name: "default_models", label: "默认模型" },
        { name: "model_groups", label: "模型路由" },
        { name: "persona", label: "AI人设" },
        { name: "chat_plugins", label: "AI聊天" },
        ...this.schemaTabs.map(({ name, label }) => ({ name, label })),
      ]
    },
    dirtyCount() { return Number(this.providerDirty) + Number(this.modelsDirty) + Number(this.personaDirty) + Object.values(this.dirtySections).filter(Boolean).length },
    filteredProviders() { const key = this.providerSearch.trim().toLowerCase(); return this.providers.filter((item) => `${item.name} ${item.api_type}`.toLowerCase().includes(key)) },
    filteredModels() { const key = this.modelSearch.trim().toLowerCase(); return (this.providerDraft?.models || []).filter((item) => item.model_name.toLowerCase().includes(key)) },
    allModels() { return this.providers.flatMap((provider) => provider.models.map((model) => ({ ...model, provider: provider.name, fullName: `${provider.name}/${model.model_name}` }))) },
    filteredRouteGroups() { const key = this.routeSearch.trim().toLowerCase(); return this.groupRows.filter((item) => !key || item.name.toLowerCase().includes(key)) },
    selectedRouteGroup() { return this.groupRows.find((item) => item.clientId === this.selectedRouteGroupId) || null },
    filteredDiscovered() { const key = this.discoverySearch.trim().toLowerCase(); return this.discoveredModels.filter((item) => item.toLowerCase().includes(key)) },
    /**
     * 上下文、Agent、沙箱与高级设置各分区的设置分组，按依赖开关隐藏不可用的字段
     * @returns {Object<string, object[]>} 分区名称到设置分组的映射
     */
    settingGroups() {
      return Object.fromEntries(this.schemaTabs.map(({ name }) => {
        const draft = this.sectionDrafts[name] || {}
        const groups = name === "advanced" ? advancedSettingGroups(this.schema, draft) : aiSectionGroups(name, this.sectionSchema(name), this.schema, draft)
        return [name, groups.map((group) => {
          const fields = group.fields.filter((field) => !field.ui.requires || valueAt(draft, field.ui.requires) === true)
          return { ...group, fields, count: fields.filter((field) => this.settingMatches(name, field)).length }
        })]
      }))
    },
    /**
     * 对话类模型与路由组选项，供总结模型等字段选择
     * @returns {{ value: string, label: string }[]} 选项，空值表示使用默认对话模型
     */
    chatModelOptions() { return [{ value: "", label: "使用默认对话模型" }, ...this.modelsForTask("chat").map((model) => ({ value: model.fullName, label: model.fullName })), ...this.groupsForTask("chat").map((group) => ({ value: group, label: `${group}（路由组）` }))] },
    providerHasKey() { return Boolean(this.providerDraft?.api_key_slots.some((slot) => String(slot.value || "").trim())) },
    providerSaveEffect() {
      if (this.providerDraft?.isNew) return "服务商参数、密钥和模型列表将一起保存"
      if (this.providerDirty && this.modelsDirty) return "服务商参数与模型列表均有修改，将一起保存并热加载"
      if (this.modelsDirty) return "模型列表有未保存修改，保存后热加载"
      return this.providerDirty ? "服务商参数有未保存修改，保存后热加载" : "保存后立即热加载"
    },
    providerDiscoverySupported() { return Boolean(this.providerDraft && this.discoveryApiTypes.includes(this.providerDraft.api_type)) },
    providerDraftStatus() {
      if (!this.providerDraft) return { code: "unavailable", label: "状态待确认", type: "info", reason: "请先选择服务商" }
      if (!this.providerDiscoverySupported) return { code: "manual_only", label: "仅手动添加", type: "info", reason: "该 API 类型不支持安全的模型自动发现，请手动添加模型" }
      const original = this.providers.find((item) => item.name === this.selectedProviderName)
      const draftBase = String(this.providerDraft.api_base || this.defaultApiBases[this.providerDraft.api_type] || "").replace(/\/$/, "")
      const originalBase = String(original?.api_base || this.defaultApiBases[original?.api_type] || "").replace(/\/$/, "")
      const temporaryKey = Boolean(this.temporaryKey)
      if (original && !temporaryKey && (original.api_type !== this.providerDraft.api_type || originalBase !== draftBase)) return { code: "scope_changed", label: "凭据范围已变化", type: "warning", reason: "修改 API 类型或地址后，请填写临时 API Key 再测试" }
      if (!draftBase) return { code: "missing_base", label: "缺少 API 地址", type: "warning", reason: "请先填写 API 地址" }
      const hasSavedKey = this.providerDraft.api_key_slots.some((slot) => (original?.api_key || []).includes(String(slot.value || "").trim()))
      if (!temporaryKey && !hasSavedKey) return { code: "missing_credentials", label: "缺少有效凭据", type: "warning", reason: "请先填写有效 API Key" }
      return { code: "ready", label: "可自动发现", type: "success", reason: "" }
    },
    temporaryKey() {
      if (!this.providerDraft) return null
      const saved = this.providerDraft.isNew ? [] : this.providers.find((item) => item.name === this.selectedProviderName)?.api_key || []
      return this.providerDraft.api_key_slots.map((slot) => String(slot.value || "").trim()).find((value) => value && !saved.includes(value)) || null
    },
    selectedProbeResult() { return this.providerProbeResults[this.selectedProviderName || "__new__"] || null },
    groupNameErrors() {
      const counts = this.groupRows.reduce((result, row) => { const name = row.name.trim(); if (name) result[name] = (result[name] || 0) + 1; return result }, {})
      return this.groupRows.map((row) => !row.name.trim() ? "请填写路由组名称。" : counts[row.name.trim()] > 1 ? "路由组名称不能重复。" : "")
    },
    hasGroupErrors() { return this.groupNameErrors.some(Boolean) || this.groupRows.some((group) => Boolean(this.groupIssue(group))) },
  },
  watch: {
    activeSection(value) {
      const chatStore = this.$refs.chatStore
      if (value === "chat_plugins" && chatStore) chatStore.loadChatSwitches().catch(error => { if (error.response?.status === 401) this.sessionExpired = true })
      if (value === "persona" && this.personaAvailable === false && !this.personaLoading) this.loadPersona()
    },
  },
  mounted() { this.loadConfiguration() },
  beforeDestroy() { clearDirtyState("ai-configuration") },
  methods: {
    async aiRequest(method, url, data = {}, options = {}) {
      const epoch = this.aiEpoch
      try {
        const response = await this[`${method}Request`](url, data, { ...options, authFailureMode: "local" })
        if (epoch !== this.aiEpoch) throw new Error("响应已过期，草稿已保留，请重试。")
        return response
      } catch (error) {
        if (error.response?.status === 401) { this.sessionExpired = true; this.aiEpoch += 1 }
        throw error
      }
    },
    aiGet(...args) { return this.aiRequest("get", ...args) },
    aiPost(...args) { return this.aiRequest("post", ...args) },
    aiPut(...args) { return this.aiRequest("put", ...args) },
    aiDelete(...args) { return this.aiRequest("delete", ...args) },
    async relogin() {
      if (this.loggingIn) return
      this.loggingIn = true
      try { await localLogin(this.loginUsername, this.loginPassword); this.aiEpoch += 1; this.sessionExpired = false; this.$message.success("已重新登录，草稿保持不变。") }
      catch (error) { this.$message.error(error.message) }
      finally { this.loginPassword = ""; this.loggingIn = false }
    },
    async previewRepair() {
      if (this.saving) return
      this.saving = "repair-preview"
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/configuration/repair-references/preview`, { expected_revision: this.revision })
        if (!response.suc) throw new Error(response.info)
        this.repairPreview = response.data; this.repairVisible = true
      } catch (error) { this.captureOperationError(error, "修复预览失败，草稿已保留。") }
      finally { this.saving = "" }
    },
    async applyRepair() {
      if (this.saving) return
      this.saving = "repair"
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/configuration/repair-references/apply`, { expected_revision: this.repairPreview.revision })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") { this.applySavedConfiguration(response.data, this.selectedProviderName, {}); this.repairVisible = false }
        await this.handleAiApply(response)
      } catch (error) { this.captureOperationError(error, "修复失败，草稿已保留。") }
      finally { this.saving = "" }
    },
    async loadConfiguration() {
      if (this.loading || this.saving) return
      if (this.dirtyCount && !(await this.confirmDiscard())) return
      this.loading = true
      this.loadError = ""
      try {
        const response = await this.aiGet(`${this.$root.prefix}/ai/configuration`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.applyConfiguration(response.data)
        await this.loadPersona()
      } catch (error) { this.loadError = apiErrorDetail(error, "AI 配置加载失败，请检查服务状态后重试。") }
      finally { this.loading = false }
    },
    applyConfiguration(data, preferredName = "") {
      this.settingsLocalIssues = {}
      this.revision = data.revision; this.schema = data.schema || {}; this.apiTypes = data.api_types || []; this.defaultApiBases = data.default_api_bases || {}; this.discoveryApiTypes = data.discovery_api_types || []; this.providers = clone(data.providers || []); this.validationIssues = data.validation_issues || []; this.operationIssues = []
      this.originalSections = clone(data.sections || {}); this.sectionDrafts = clone(data.sections || {}); this.dirtySections = {}; this.invalidSections = {}; this.groupRows = this.groupsToRows(this.sectionDrafts.model_groups); this.selectedRouteGroupId = this.groupRows.some((item) => item.clientId === this.selectedRouteGroupId) ? this.selectedRouteGroupId : this.groupRows[0]?.clientId || ""; this.routingIssues = []
      const target = preferredName || this.selectedProviderName; this.selectedProviderName = this.providers.some((item) => item.name === target) ? target : this.providers[0]?.name || ""
      this.resetProviderDraft(); this.providerDirty = false; this.modelsDirty = false; this.syncDirty()
    },
    resetProviderDraft() {
      const provider = this.providers.find((item) => item.name === this.selectedProviderName)
      if (!provider) { this.providerDraft = null; return }
      const slots = (provider.api_key || []).map((value) => ({ value, clientId: uid() }))
      if (!slots.length) slots.push({ value: "", clientId: uid() })
      this.providerDraft = { ...clone(provider), api_key_slots: slots, isNew: false }
    },
    applySavedConfiguration(data, preferredName, submitted) {
      const draft = clone(this.providerDraft)
      const providerDirty = this.providerDirty
      const modelsDirty = this.modelsDirty
      const sections = clone(this.sectionDrafts)
      const dirtySections = { ...this.dirtySections }
      const invalidSections = clone(this.invalidSections)
      const rows = clone(this.groupRows)
      const routeId = this.selectedRouteGroupId
      this.applyConfiguration(data, preferredName)
      Object.keys(dirtySections).forEach((name) => {
        const current = name === "model_groups" ? rows : sections[name]
        const savedValue = submitted.sections?.[name] ?? (submitted.section === name ? submitted.value : undefined)
        if (dirtySections[name] && JSON.stringify(current) !== savedValue) {
          this.$set(this.sectionDrafts, name, sections[name])
          this.$set(this.dirtySections, name, true)
          this.$set(this.invalidSections, name, invalidSections[name] || [])
          if (name === "model_groups") { this.groupRows = rows; this.selectedRouteGroupId = routeId }
        }
      })
      if (draft) {
        const { models, ...fields } = draft
        if (providerDirty && submitted.provider !== JSON.stringify(fields)) {
          this.providerDraft = { ...fields, models: this.providerDraft?.models || [] }
          if (submitted.provider) this.providerDraft.isNew = false
          this.providerDirty = true
        }
        if (modelsDirty && submitted.models !== JSON.stringify(models)) {
          if (!this.providerDraft) this.providerDraft = draft
          this.providerDraft.models = models
          this.modelsDirty = true
        }
      }
      this.syncDirty()
    },
    async selectProvider(name) { if (this.saving) return; if ((this.providerDirty || this.modelsDirty) && !(await this.confirmDiscard())) return; this.selectedProviderName = name; this.providerDirty = false; this.modelsDirty = false; this.resetProviderDraft(); this.syncDirty() },
    async confirmDiscard() { try { await this.$confirm("当前 AI 配置有尚未保存的修改。", "放弃修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", type: "warning" }); return true } catch (_) { return false } },
    async createProvider() { if (this.saving) return; if ((this.providerDirty || this.modelsDirty) && !(await this.confirmDiscard())) return; this.selectedProviderName = ""; this.providerDraft = { name: "", api_type: "openai", api_base: "", timeout: 180, temperature: null, max_output_tokens: null, api_key_slots: [{ value: "", clientId: uid() }], models: [], isNew: true }; this.providerDirty = true; this.modelsDirty = false; this.syncDirty() },
    invalidateProbeResults() {
      const key = this.selectedProviderName || "__new__"
      if (this.providerProbeResults[key]) this.$delete(this.providerProbeResults, key)
    },
    markProviderDirty() { this.providerDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    handleApiTypeChange(value) { if (!this.providerDraft.api_base && this.defaultApiBases[value]) this.providerDraft.api_base = this.defaultApiBases[value]; this.markProviderDirty() },
    addKey() { this.providerDraft.api_key_slots.push({ value: "", clientId: uid() }); this.markProviderDirty() },
    removeKey(index) { this.providerDraft.api_key_slots.splice(index, 1); this.markProviderDirty() },
    providerPayload({ includeModels = false } = {}) { return { expected_revision: this.revision, name: this.providerDraft.name.trim(), api_type: this.providerDraft.api_type, api_base: this.providerDraft.api_base?.trim() || null, timeout: this.providerDraft.timeout, temperature: this.providerDraft.temperature, max_output_tokens: this.providerDraft.max_output_tokens, api_keys: this.providerDraft.api_key_slots.map((slot) => String(slot.value || "").trim()).filter(Boolean), models: this.providerDraft.isNew || includeModels ? this.providerDraft.models.map(({ capabilities, capability_source, ...model }) => model) : null } },
    /**
     * 一次保存服务商参数、密钥与模型列表；模型列表未修改时不提交模型
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveProvider() {
      if (this.saving || !this.providerDraft) return false
      const includeModels = this.modelsDirty || this.providerDraft.isNew
      this.saving = "provider"
      try {
        const { models, ...fields } = clone(this.providerDraft)
        const submitted = { provider: JSON.stringify(fields), models: includeModels ? JSON.stringify(models) : undefined }
        const path = this.providerDraft.isNew ? "/ai/providers" : `/ai/providers/${encodeURIComponent(this.selectedProviderName)}`
        const payload = this.providerPayload({ includeModels })
        const response = this.providerDraft.isNew ? await this.aiPost(`${this.$root.prefix}${path}`, payload) : await this.aiPut(`${this.$root.prefix}${path}`, payload)
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode === "failed") { await this.handleAiApply(response); return false }
        this.applySavedConfiguration(response.data, payload.name, submitted); await this.handleAiApply(response)
        return true
      } catch (error) { this.captureOperationError(error, "服务商保存失败。"); return false }
      finally { this.saving = "" }
    },
    /** 撤销当前服务商的未保存修改；新建中的服务商回到列表中的第一个服务商 */
    resetProvider() {
      if (this.saving) return
      if (this.providerDraft?.isNew) this.selectedProviderName = this.providers[0]?.name || ""
      this.providerDirty = false; this.modelsDirty = false; this.operationIssues = []
      this.resetProviderDraft(); this.invalidateProbeResults(); this.syncDirty()
    },
    async removeProvider() {
      if (this.saving) return
      try { await this.$confirm(`删除 ${this.providerDraft.name} 后，引用该服务商的默认模型和路由必须先调整。`, "删除服务商？", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }) } catch (_) { return }
      this.saving = "provider"
      try { const { models, ...fields } = this.providerDraft; const submitted = { provider: JSON.stringify(fields), models: JSON.stringify(models) }; const response = await this.aiDelete(`${this.$root.prefix}/ai/providers/${encodeURIComponent(this.selectedProviderName)}?expected_revision=${encodeURIComponent(this.revision)}`); if (!response.suc) throw new Error(response.info); if (response.data?.apply_mode !== "failed") this.applySavedConfiguration(response.data, "", submitted); await this.handleAiApply(response) } catch (error) { this.captureOperationError(error, "服务商删除失败。") } finally { this.saving = "" }
    },
    async discoverModels() {
      this.discovering = true
      const resultKey = this.selectedProviderName || "__new__"
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/providers/discover`, { expected_revision: this.revision, provider_name: this.providerDraft.name.trim() || null, saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName, api_type: this.providerDraft.api_type, api_base: this.providerDraft.api_base, api_key: this.temporaryKey }, { suppressErrorToast: true })
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
        ready: { label: "可自动发现", type: "success" },
        manual_only: { label: "仅手动添加", type: "info" },
        missing_credentials: { label: "缺少有效凭据", type: "warning" },
        missing_base: { label: "缺少 API 地址", type: "warning" },
      }
      return states[provider.discovery_status] || { label: "状态待确认", type: "info" }
    },
    addDiscoveredModels() {
      const exists = new Set(this.providerDraft.models.map((item) => item.model_name))
      let added = 0
      this.selectedDiscovered.forEach((name) => {
        if (!exists.has(name)) {
          this.providerDraft.models.push({ ...emptyModel(), model_name: name })
          exists.add(name); added += 1
        }
      })
      this.modelsDirty = this.modelsDirty || added > 0
      this.syncDirty()
      this.discoveryDialog = false
      this.selectedDiscovered = []
      this.$message.success(added ? `已添加 ${added} 个模型，保存后生效。` : "所选模型已在列表中。")
    },
    openModelEditor(model = null, index = null) { this.modelDraft = model ? { ...clone(model), capabilities: undefined, capability_source: undefined } : emptyModel(); this.modelEditIndex = index; this.modelDialog = true },
    confirmModel() { const name = this.modelDraft.model_name.trim(); if (!name) return this.$message.warning("请填写模型名称。"); if (this.providerDraft.models.some((item, index) => item.model_name === name && index !== this.modelEditIndex)) return this.$message.warning("该服务商下已有同名模型。"); const value = { ...this.modelDraft, model_name: name }; delete value.capabilities; delete value.capability_source; if (this.modelEditIndex == null) this.providerDraft.models.push(value); else this.providerDraft.models.splice(this.modelEditIndex, 1, value); this.modelsDirty = true; this.invalidateProbeResults(); this.modelDialog = false; this.syncDirty() },
    modelIndex(model) { return this.providerDraft.models.findIndex((item) => item === model || item.model_name === model.model_name) },
    modelTestKey(model) { return `${this.providerDraft?.name || this.selectedProviderName}/${model.model_name}` },
    deleteModel(model) { const actual = this.modelIndex(model); if (actual < 0) return; this.providerDraft.models.splice(actual, 1); this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    /**
     * 获取已收录模型的能力；未收录的模型只有宽松的默认能力，不用于判断任务类型
     * @param {object} model 模型视图
     * @returns {object} 已收录时为模型能力，否则为空对象
     */
    knownCapabilities(model) { return model.capability_source === "registry" ? model.capabilities || {} : {} },
    capabilityTags(model) { const caps = this.knownCapabilities(model); const result = []; if (caps.is_embedding_model || model.task_type === "embedding") result.push("Embedding"); if (caps.is_rerank_model || model.task_type === "rerank") result.push("Rerank"); if ((caps.output_modalities || []).includes("image") || model.task_type === "image_generation") result.push("图像"); if ((caps.output_modalities || []).includes("audio") || model.task_type === "tts") result.push("语音"); if (caps.supports_tool_calling) result.push("工具"); if (model.capability_source === "default" && !model.task_type) result.push("能力未收录"); return result.slice(0, 3) },
    modelTask(model) { const caps = this.knownCapabilities(model); if (caps.is_embedding_model || model.task_type === "embedding") return "embedding"; if (caps.is_rerank_model || model.task_type === "rerank") return "rerank"; if ((caps.output_modalities || []).includes("image") || model.task_type === "image_generation") return "image"; if ((caps.output_modalities || []).includes("audio") || model.task_type === "tts") return "tts"; return "chat" },
    async testModel(model) {
      const task = this.modelTask(model)
      const providerName = this.providerDraft.name.trim() || this.selectedProviderName
      if (!providerName) return this.$message.warning("请先填写服务商名称。")
      const testKey = `${providerName}/${model.model_name}`
      if (this.testingModelKey) return
      this.testingModelKey = testKey
      try { await this.$confirm(`将对 ${providerName}/${model.model_name} 发起一次最小 ${task} 请求，可能产生费用。`, "确认模型测试", { type: "warning" }) } catch (_) { this.testingModelKey = ""; return }
      try {
        const { capabilities, ...modelConfig } = model
        const response = await this.aiPost(`${this.$root.prefix}/ai/models/test`, {
          expected_revision: this.revision,
          model: `${providerName}/${model.model_name}`,
          provider_name: providerName,
          saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName,
          api_type: this.providerDraft.api_type,
          api_base: this.providerDraft.api_base,
          api_key: this.temporaryKey,
          timeout: this.providerDraft.timeout,
          model_config: modelConfig,
          task,
          confirmed_paid_request: true,
        }, { suppressErrorToast: true })
        this.$message.success(`连接成功，延迟 ${response.data.latency_ms} ms`)
      } catch (error) { this.$message.error(apiErrorDetail(error, "模型测试失败。")) }
      finally { if (this.testingModelKey === testKey) this.testingModelKey = "" }
    },
    async loadPersona() {
      this.personaLoading = true; this.personaError = ""
      try {
        const response = await this.aiGet(`${this.$root.prefix}/ai/personas/default`, {}, { suppressErrorToast: true })
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
        this.personaError = apiErrorDetail(error, "AI 人设加载失败。")
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
      const snapshot = this.personaSnapshot()
      if (snapshot.tone_examples.length > 12 || snapshot.preset_dialogues.length > 12) return this.$message.warning("语气样例和示例对话各最多 12 条。")
      this.personaSaving = true
      try {
        const response = await this.aiPut(`${this.$root.prefix}/ai/personas/default`, { expected_revision: this.personaRevision, ...snapshot })
        if (!response.suc) throw new Error(response.info)
        this.personaRevision = response.data.revision; this.personaDraft = clone(response.data.persona)
        this.personaToneText = (this.personaDraft.tone_examples || []).join("\n"); this.personaDialogueText = (this.personaDraft.preset_dialogues || []).join("\n\n")
        this.personaOriginal = this.personaSnapshot(); this.personaDirty = false; this.syncDirty(); this.$message.success(response.info || "AI 人设已保存。")
      } catch (error) { this.$message.error(apiErrorDetail(error, "AI 人设保存失败。")) }
      finally { this.personaSaving = false }
    },
    resolveSchema(node) { if (!node?.$ref) return node || {}; return node.$ref.replace(/^#\//, "").split("/").reduce((value, key) => value?.[key], this.schema) || node },
    sectionSchema(name) { const properties = this.schema.properties || {}; const map = { context: "context_settings", agent: "agent_settings", sandbox: "sandbox" }; if (name === "advanced") return { type: "object", properties: { client_settings: properties.client_settings, debug_log: properties.debug_log, provider_settings: properties.provider_settings } }; return this.resolveSchema(properties[map[name]]) },
    /**
     * 读取设置项的草稿值；模型选择字段的 null 显示为“使用默认对话模型”
     * @param {string} tab 分区名称
     * @param {object} field 设置项
     * @returns {*} 草稿值
     */
    settingValue(tab, field) { const value = valueAt(this.sectionDrafts[tab], field.segments); return field.ui.modelTask && value == null ? "" : value },
    settingUi(tab, field) {
      if (!field.ui.modelTask) return field.ui
      const current = valueAt(this.sectionDrafts[tab], field.segments)
      const options = this.chatModelOptions
      return { ...field.ui, options: current && !options.some((item) => item.value === current) ? [...options, { value: current, label: `${current}（当前值）` }] : options }
    },
    settingChanged(tab, field) { return JSON.stringify(valueAt(this.sectionDrafts[tab], field.segments)) !== JSON.stringify(valueAt(this.originalSections[tab], field.segments)) },
    settingMatches(tab, field) { return fieldMatches(this.settingsSearch[tab], `${field.path} ${field.label} ${field.section} ${field.ui.description || ""}`, field.schema, valueAt(this.sectionDrafts[tab], field.segments), this.schema) },
    /**
     * 获取分区的本地与服务端校验问题，路径统一为分区内的相对路径
     * @param {string} tab 分区名称
     * @returns {object[]} 校验问题
     */
    settingIssues(tab) {
      const prefix = new RegExp(`^(AI\\.)?(value|${tab}|${SECTION_KEYS[tab] || tab})\\.`)
      return [...(this.settingsLocalIssues[tab] || []), ...this.operationIssues.map((issue) => ({ ...issue, path: String(issue.path || "").replace(prefix, "") }))]
    },
    settingChangeCount(tab) { return (this.settingGroups[tab] || []).reduce((count, group) => count + group.fields.filter((field) => this.settingChanged(tab, field)).length, 0) },
    updateSetting(tab, field, value) {
      const next = field.ui.modelTask && value === "" ? null : value
      this.$set(this.sectionDrafts, tab, updateAt(this.sectionDrafts[tab], field.segments, next))
      this.$set(this.settingsLocalIssues, tab, (this.settingsLocalIssues[tab] || []).filter((issue) => issue.path !== field.path && !String(issue.path).startsWith(`${field.path}.`)))
      this.operationIssues = this.operationIssues.filter((issue) => !String(issue.path).endsWith(field.path))
      this.markSectionDirty(tab)
    },
    resetSettings(tab) { this.resetSection(tab); this.$set(this.settingsLocalIssues, tab, []); this.operationIssues = []; this.$set(this.invalidSections, tab, []) },
    focusSettingIssue(tab) {
      const issue = this.settingIssues(tab)[0]
      if (!issue) return
      const group = this.settingGroups[tab].find((item) => item.fields.some((field) => issue.path === field.path || issue.path.startsWith(`${field.path}.`)))
      if (group) this.settingsCategory[tab] = group.key
      this.settingsSearch[tab] = ""
      this.$nextTick(() => this.$el.querySelector(".el-tab-pane:not([style*='display: none']) .settings-workspace .field-error")?.scrollIntoView({ block: "center", behavior: "smooth" }))
    },
    /**
     * 本地校验后保存设置分区，校验失败时定位到第一个问题
     * @param {string} tab 分区名称
     */
    async saveSettings(tab) {
      const draft = this.sectionDrafts[tab] || {}
      const issues = tab === "advanced"
        ? [...new Set(["client_settings", "provider_settings", "debug_log", ...Object.keys(draft)])].flatMap((key) => validateField(draft[key], this.schema.properties?.[key] || {}, this.schema, key))
        : validateField(draft, this.sectionSchema(tab), this.schema, "")
      this.$set(this.settingsLocalIssues, tab, issues)
      this.$set(this.invalidSections, tab, issues.map((issue) => issue.path))
      if (issues.length) { this.focusSettingIssue(tab); return }
      await this.saveSection(tab)
      if (this.settingIssues(tab).length) this.focusSettingIssue(tab)
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
    sectionInvalid(name) { return Boolean(this.invalidSections[name]?.length) },
    async saveSection(name, value = this.sectionDrafts[name]) { if (this.sectionInvalid(name) || (this.saving && this.saving !== "model_groups")) return; this.saving = name; try { const submitted = { section: name, value: JSON.stringify(name === "model_groups" ? this.groupRows : this.sectionDrafts[name]) }; const response = await this.aiPut(`${this.$root.prefix}/ai/configuration/sections/${name}`, { expected_revision: this.revision, value }); if (!response.suc) throw new Error(response.info); if (response.data?.apply_mode !== "failed") this.applySavedConfiguration(response.data, this.selectedProviderName, submitted); await this.handleAiApply(response) } catch (error) { this.captureOperationError(error, "AI 配置保存失败。") } finally { this.saving = "" } },
    groupsToRows(groups) { const names = new Set(Object.keys(groups || {})); return Object.entries(groups || {}).map(([name, targets]) => ({ name, targets: targets.map((value) => ({ kind: names.has(value) ? "group" : "model", value, clientId: uid() })), clientId: uid() })) },
    addGroup() { const group = { name: "", targets: [], clientId: uid() }; this.groupRows.push(group); this.selectedRouteGroupId = group.clientId; this.markGroupsDirty() },
    async removeSelectedGroup() {
      const index = this.groupRows.findIndex(item => item.clientId === this.selectedRouteGroupId)
      if (index < 0 || this.saving) return
      const change = removeRoutingGroup(this.groupRows, this.sectionDrafts.default_models, this.selectedRouteGroupId)
      if (change.tasks.length || change.affected.length || change.removed.length > 1) {
        try { await this.$confirm(`将删除路由组 ${change.removed.join("、")}，清除默认任务 ${change.tasks.join("、") || "无"} 及路由组 ${change.affected.join("、") || "无"} 的引用，保存时一起应用。`, "删除引用确认", { type: "warning" }) } catch (_) { return }
      }
      this.groupRows = change.rows
      change.tasks.forEach(task => this.$set(this.sectionDrafts.default_models, task, null))
      if (change.tasks.length) this.$set(this.dirtySections, "default_models", true)
      this.selectedRouteGroupId = this.groupRows[Math.max(0, index - 1)]?.clientId || ""
      this.markGroupsDirty()
    },
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
      if (this.saving) return
      if (this.hasGroupErrors) { this.$message.warning("请先修正路由组名称、目标或循环引用。"); return }
      const value = this.groupRows.map((item) => ({ name: item.name.trim(), targets: item.targets.map((target) => target.value.trim()) }))
      this.saving = "model_groups"
      let fallback = "模型路由校验失败。"
      try {
        const defaults = clone(this.sectionDrafts.default_models)
        const submitted = { sections: { model_groups: JSON.stringify(this.groupRows), default_models: JSON.stringify(defaults) } }
        const expectedRevision = this.revision
        const validation = await this.aiPost(`${this.$root.prefix}/ai/configuration/validate-routing`, { value, default_models: defaults, expected_revision: expectedRevision })
        this.routingIssues = validation.data?.issues || []
        if (!validation.suc || !validation.data?.valid) { this.$message.warning("模型路由校验未通过。"); return }
        fallback = "模型路由保存失败。"
        const response = await this.aiPut(`${this.$root.prefix}/ai/configuration/routing`, { expected_revision: expectedRevision, model_groups: value, default_models: defaults })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") this.applySavedConfiguration(response.data, this.selectedProviderName, submitted)
        await this.handleAiApply(response)
      } catch (error) { this.captureOperationError(error, fallback) }
      finally { if (this.saving === "model_groups") this.saving = "" }
    },
    /**
     * 获取适合指定任务的路由组
     * @param {string} task 任务键
     * @returns {string[]} 路由组名称
     */
    groupsForTask(task) { return routingGroupsForModels(this.groupRows, new Set(this.modelsForTask(task).map((model) => model.fullName))) },
    /**
     * 获取适合指定任务的已启用模型；专用任务只认已收录能力或显式任务类型
     * @param {string} task 任务键
     * @returns {object[]} 模型列表
     */
    modelsForTask(task) {
      return this.allModels.filter((model) => {
        if (!model.is_available) return false
        const caps = this.knownCapabilities(model)
        const outputs = caps.output_modalities || []
        if (task === "chat") return !Object.values(TASK_TYPES).flat().includes(model.task_type) && !caps.is_embedding_model && !caps.is_rerank_model && (!outputs.length || outputs.includes("text"))
        if (TASK_TYPES[task].includes(model.task_type)) return true
        return { embedding: caps.is_embedding_model, rerank: caps.is_rerank_model, image: outputs.includes("image"), tts: outputs.includes("audio") }[task] === true
      })
    },
    /**
     * 设置默认任务模型，清空时保存为 null
     * @param {string} task 任务键
     * @param {string} value 模型或路由组名称
     */
    setDefaultModel(task, value) { this.$set(this.sectionDrafts.default_models, task, value || null); this.markSectionDirty("default_models") },
    captureOperationError(error, fallback) { this.operationIssues = apiErrorIssues(error); this.$message.error(apiErrorDetail(error, fallback)) },
    handleAiApply(response) { return handleApplyResult(this, response, { restartPrompt: "AI 启动期配置已保存，需要重启后生效。", restartRequest: () => this.aiPost(`${this.$root.prefix}/system/configuration/restart`, {}), returnRoute: "/ai", recoveryMessage: "AI 启动期配置将在新进程中生效。" }) },
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
.ai-page { border-radius:16px; max-width:1600px; margin:0 auto; min-height: 100%; padding: 20px 22px 32px; overflow-y: auto; color: var(--text-color); background: var(--bg-color-secondary,#fff); }.page-header, .section-title, .subheading, .provider-actions, .section-action { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.page-header { margin-bottom: 12px; }.configuration-warning { margin-bottom: 12px; }.configuration-warning code { margin-right: 6px; }.load-error { display: grid; min-height: 260px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 28px; border: 1px solid var(--danger-color); border-radius: 8px; background: var(--bg-color-secondary); }.load-error > i { color: var(--danger-color); font-size: 34px; }.load-error h2 { margin: 0; font-size: 18px; }.load-error p { margin: 8px 0 0; color: var(--text-color-secondary); }.page-header h1, .section-title h2, .subheading h3 { margin: 0; letter-spacing: 0; }.page-header h1 { font-size: 24px; }.page-header p, .section-title p, .subheading p { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 13px; }.header-status { display: flex; align-items: center; gap: 8px; }.ai-tabs { min-height: 0; }.provider-workbench { display: grid; min-height: 650px; grid-template-columns: 250px minmax(0, 1fr); border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.provider-sidebar { min-width: 0; padding: 16px; border-right: 1px solid var(--border-color); }.sidebar-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }.provider-list { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }.provider-list button { display: flex; width: 100%; min-height: 58px; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.provider-list button:hover { background: var(--bg-color-hover); }.provider-list button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.provider-list span { display: flex; min-width: 0; flex-direction: column; }.provider-list strong, .provider-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.provider-list small { margin-top: 4px; color: var(--text-color-secondary); }.provider-main { min-width: 0; padding: 20px 22px 26px; }.provider-form, .advanced-grid, .default-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.full-control { width: 100%; }.secret-section, .models-section { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-color-light); }.secret-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 10px; }.advanced-collapse { margin-top: 14px; border-bottom: 0; }.provider-actions { margin-top: 18px; }.models-section { margin-top: 24px; }.model-search { max-width: 420px; margin: 14px 0 10px; }.model-list { border-top: 1px solid var(--border-color-light); }.model-row { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-color-light); }.model-name { display: flex; min-width: 0; flex-direction: column; gap: 7px; }.model-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.model-name span { display: flex; flex-wrap: wrap; gap: 5px; }.model-actions { flex: none; white-space: nowrap; }.provider-empty { display: grid; place-content: center; color: var(--text-color-secondary); text-align: center; }.provider-empty i { font-size: 42px; }.settings-section { min-height: 480px; padding: 20px 22px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.section-action { position: sticky; bottom: 0; z-index: 3; margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color); }.section-action span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.group-row { display: grid; grid-template-columns: 210px minmax(0, 1fr) auto; gap: 10px; margin-top: 12px; }.empty-copy { padding: 30px 12px; color: var(--text-color-secondary); text-align: center; }.danger-text { color: var(--danger-color) !important; }.model-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }.discovery-list { display: grid; max-height: 360px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; overflow-y: auto; }.discovery-list .el-checkbox { min-width: 0; margin-right: 0; overflow: hidden; text-overflow: ellipsis; }.dialog-note { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }
.advanced-settings-section { min-height: 0; }







@media (max-width: 820px) { .ai-page { padding: 12px; }.page-header, .section-title, .subheading { align-items: flex-start; flex-direction: column; }.header-status { width: 100%; flex-wrap: wrap; }.load-error { min-height: 220px; grid-template-columns: auto minmax(0, 1fr); padding: 20px; }.load-error .el-button { grid-column: 1 / -1; }.provider-workbench { grid-template-columns: 1fr; }.provider-sidebar { border-right: 0; border-bottom: 1px solid var(--border-color); }.provider-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.provider-main { padding: 16px; }.provider-form, .advanced-grid, .default-grid, .model-form { grid-template-columns: 1fr; }.group-row { grid-template-columns: 1fr auto; }.group-row .el-select { grid-column: 1 / -1; grid-row: 2; }.model-row { align-items: flex-start; flex-direction: column; padding: 10px 0; }.model-actions { align-self: flex-end; }.discovery-list { grid-template-columns: 1fr; } }
.mobile-provider-select { display: none; width: 100%; margin-top: 10px; }
.mobile-section-select { display: none; width: 100%; margin-bottom: 12px; }
@media (max-width: 767px) { .mobile-section-select { display: block; }.ai-tabs ::v-deep > .el-tabs__header { display: none; } }
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
.secret-hint { margin: 10px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.6; }.secret-section .field-error { margin-top: 8px; color: var(--danger-color); font-size: 12px; }.provider-main > .section-action { margin-top: 20px; }.setting-restart { margin: 6px 8px 0 0; }
@media (max-width: 820px) { .mobile-provider-select { display: block; }.provider-list { display: none; } }
@media (max-width: 820px) { .route-workbench { grid-template-columns: 1fr; }.route-sidebar { border-right: 0; border-bottom: 1px solid var(--border-color); }.route-editor { padding: 16px; }.route-target-row { grid-template-columns: 54px 100px minmax(0, 1fr); padding: 10px 0; }.route-target-actions { grid-column: 2 / -1; justify-content: flex-end; } }
@media (max-width: 620px) { .persona-basics { grid-template-columns: 1fr; gap: 0; } }
@media (max-width: 460px) { .provider-list { grid-template-columns: 1fr; }.provider-actions, .section-action { align-items: stretch; flex-direction: column; }.section-action span { margin: 0; }.secret-row { grid-template-columns: 1fr; } }
</style>

<style scoped>
.advanced-provider-heading { font-size:13px; font-weight:600; margin:24px 0 0; color:var(--primary-color,#5c83d6); }.advanced-modified { display:inline-block; margin-top:8px; font-size:11px; color:var(--primary-color,#5c83d6); }.advanced-proxy-note { margin:18px 0 0; font-size:12px; color:var(--text-color-secondary); }.advanced-proxy-note .el-button { margin-left:8px; }@media(max-width:768px) { .ai-page .page-header { flex-direction:column; align-items:stretch; }.ai-page .header-status { flex-wrap:wrap; }.ai-page .header-status > * { margin-left:0; } }
</style>
