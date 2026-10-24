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
        <div class="provider-workbench" :class="{ 'no-sidebar': !providers.length }">
          <aside v-if="providers.length" class="provider-sidebar">
            <div class="sidebar-heading"><strong>服务商</strong><el-button type="text" icon="el-icon-plus" @click="createProvider">添加</el-button></div>
            <el-input v-model="providerSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索服务商" />
            <el-select :value="selectedProviderName" class="mobile-provider-select" size="small" placeholder="选择服务商" @change="selectProvider">
              <el-option v-for="provider in filteredProviders" :key="provider.name" :label="provider.name" :value="provider.name" />
            </el-select>
            <div class="provider-list">
              <button v-for="provider in filteredProviders" :key="provider.name" :class="{ active: selectedProviderName === provider.name }" @click="selectProvider(provider.name)">
                <ProviderLogo :preset="provider.preset || ''" :label="provider.name" />
                <span><strong>{{ provider.name }}</strong><small>{{ providerKind(provider) }} · {{ provider.models.length }} 个模型</small></span>
                <el-tag size="mini" :type="providerStatus(provider).type">{{ providerStatus(provider).label }}</el-tag>
              </button>
              <div v-if="!filteredProviders.length" class="empty-copy">没有匹配的服务商</div>
            </div>
          </aside>

          <main v-if="providerDraft" class="provider-main">
            <div class="provider-header">
              <ProviderLogo :preset="providerDraft.preset || ''" :label="providerDraft.name" size="40px" />
              <div class="provider-title">
                <h2>{{ providerDraft.isNew ? `添加服务商 · ${providerDraft.name || "未命名"}` : providerDraft.name }}</h2>
                <p>{{ connectionSummary }}<a v-if="keyUrl" :href="keyUrl" target="_blank" rel="noopener noreferrer" class="external-link">控制台<i class="el-icon-top-right"></i></a></p>
              </div>
              <div class="provider-heading-actions">
                <el-tag size="small" :type="providerDraftStatus.type">{{ providerDraftStatus.label }}</el-tag>
                <el-button size="small" :icon="connectionOpen ? 'el-icon-arrow-up' : 'el-icon-edit-outline'" @click="connectionOpen = !connectionOpen">{{ connectionOpen ? "收起连接" : "编辑连接" }}</el-button>
                <el-button v-if="!providerDraft.isNew" type="text" icon="el-icon-delete" class="danger-text" @click="removeProvider">删除</el-button>
              </div>
            </div>

            <section v-show="connectionOpen" class="connection-panel">
              <el-form label-position="top" class="provider-form">
                <el-form-item label="服务商名称" :error="operationError('providers.name')"><el-input v-model="providerDraft.name" maxlength="80" @input="markProviderDirty" /></el-form-item>
                <el-form-item label="厂商预设"><el-select :value="providerDraft.preset || ''" clearable filterable placeholder="自定义" class="full-control" @change="setProviderScope({ preset: $event || null })"><el-option v-for="(item, key) in presets" :key="key" :label="item.label" :value="key" /></el-select></el-form-item>
                <el-form-item label="接口协议" :error="operationError('providers.protocol')"><el-select :value="providerDraft.protocol" class="full-control" @change="setProviderScope({ protocol: $event })"><el-option v-for="item in protocols" :key="item" :label="protocolLabel(item)" :value="item" /></el-select></el-form-item>
                <el-form-item label="接口地址" :error="operationError('providers.base_url')"><el-input v-model="providerDraft.base_url" :placeholder="presetBaseUrl(providerDraft.preset, providerDraft.protocol) || 'https://api.example.com/v1'" @input="markProviderDirty" /></el-form-item>
                <el-form-item label="请求超时（秒）" :error="operationError('providers.timeout')"><el-input-number v-model="providerDraft.timeout" :min="1" :max="1800" controls-position="right" class="full-control" @change="markProviderDirty" /></el-form-item>
              </el-form>
              <div class="secret-section">
                <div class="subheading"><div><h3>API Keys<a v-if="keyUrl" :href="keyUrl" target="_blank" rel="noopener noreferrer" class="external-link">前往 {{ presets[providerDraft.preset].label }} 获取 API Key<i class="el-icon-top-right"></i></a></h3><p>支持多密钥轮询；已保存的密钥默认隐藏，删除某一行即删除该密钥。</p></div><el-button size="small" icon="el-icon-plus" @click="addKey">添加密钥</el-button></div>
                <div v-for="(slot, index) in providerDraft.api_key_slots" :key="slot.clientId" class="secret-row">
                  <el-input v-model="slot.value" autocomplete="new-password" placeholder="输入 API Key" show-password @input="markProviderDirty" />
                  <el-button type="text" icon="el-icon-delete" class="danger-text" @click="removeKey(index)">删除</el-button>
                </div>
                <div v-if="operationError('api_key')" class="field-error" role="alert">{{ operationError("api_key") }}</div>
                <p v-else-if="!providerHasKey" class="secret-hint"><i class="el-icon-info"></i> 未填写 API Key 也可以保存服务商和模型，但调用需要鉴权的服务时会失败。</p>
              </div>
              <el-collapse class="advanced-collapse">
                <el-collapse-item title="服务商高级参数" name="advanced">
                  <el-form label-position="top" class="advanced-grid">
                    <el-form-item label="默认生成参数（JSON）" :error="jsonError(providerDraft.paramsText)"><el-input v-model="providerDraft.paramsText" type="textarea" :rows="4" placeholder='{"temperature": 0.7}' @input="markProviderDirty" /></el-form-item>
                    <el-form-item label="附加请求头（JSON）" :error="jsonError(providerDraft.headersText)"><el-input v-model="providerDraft.headersText" type="textarea" :rows="4" placeholder='{"X-Title": "zhenxun"}' @input="markProviderDirty" /></el-form-item>
                  </el-form>
                  <p class="secret-hint">temperature、max_tokens 等通用参数会按协议转换，其他键原样合并进请求体；模型参数优先于服务商参数。</p>
                </el-collapse-item>
              </el-collapse>
            </section>

            <section class="models-section">
              <div class="models-toolbar">
                <h3>模型 <small>{{ providerDraft.models.length }}</small></h3>
                <el-input v-model="modelSearch" size="small" clearable prefix-icon="el-icon-search" placeholder="搜索模型" class="model-search" />
                <el-tooltip :disabled="providerDraftStatus.code === 'ready'" :content="providerDraftStatus.reason" placement="top">
                  <span><el-button size="small" type="primary" plain icon="el-icon-connection" :loading="discovering" :disabled="providerDraftStatus.code !== 'ready'" @click="discoverModels">发现模型</el-button></span>
                </el-tooltip>
                <el-button size="small" icon="el-icon-plus" @click="openEditor()">手动添加</el-button>
                <el-button v-if="uncheckedModels.length" size="small" icon="el-icon-finished" :loading="batchChecking" :disabled="Boolean(testingModelKey) && !batchChecking" @click="checkUncheckedModels">核验未核验（{{ uncheckedModels.length }}）</el-button>
              </div>
              <el-alert v-if="selectedProbeResult" class="provider-probe-result" :type="selectedProbeResult.success ? 'success' : 'error'" :closable="false" show-icon :title="selectedProbeResult.message" />
              <p v-if="upstreamModels" class="upstream-summary">上游共 {{ upstreamModels.length }} 个模型（{{ formatTime(providerDraft.discovery.updated_at) }} 查询，每天自动刷新）<template v-if="missingModelCount">，{{ missingModelCount }} 个已配置模型上游已下线</template></p>
              <ModelTable :models="filteredModels" :defaults="sectionDrafts.default_models || {}" :provider-name="selectedProviderName" :saved-names="savedModelNames" :upstream="upstreamModels" :busy="Boolean(testingModelKey)" :loading-name="testingModelName" :available="upstreamAvailable" :available-total="newUpstreamModels.length" :available-open.sync="upstreamOpen" @add="addUpstreamModels([$event])" @add-all="addUpstreamModels(upstreamAvailable.map((item) => item.name))" @edit="openEditor" @remove="deleteModel" @check="quickCheck" @test="testModel" @toggle="toggleModel" @set-default="setDefault">
                <template #empty>{{ providerDraft.models.length ? "没有匹配的模型" : providerHasKey ? "点击“发现模型”从服务商获取模型列表，或手动添加" : "填写 API Key 后可发现模型，也可以手动添加" }}</template>
              </ModelTable>
            </section>
            <SectionAction :dirty="providerDirty || modelsDirty" :saving="saving === 'provider'" :invalid="providerInvalid" :effect="providerSaveEffect" reset-label="撤销修改" @reset="resetProvider" @save="saveProviderWithCheck" />
          </main>
          <main v-else class="provider-main"><ProviderStarter :presets="presets" :first="!providers.length" @pick="startProvider" @cancel="cancelStarter" /></main>
        </div>
      </el-tab-pane>

      <el-tab-pane label="默认与路由" name="routing">
        <section class="settings-section routing-defaults"><div class="section-title"><div><h2>默认任务模型</h2><p>只显示适合对应任务的已启用模型，以及所含模型全部适合该任务的路由组。</p></div></div>
          <el-form label-position="top" class="default-grid"><el-form-item v-for="task in defaultTasks" :key="task.key" :label="task.label" :error="operationError(`default_models.${task.key}`)"><el-select :value="sectionDrafts.default_models[task.key]" clearable filterable placeholder="未配置" class="full-control" @change="setDefaultModel(task.key, $event)"><el-option-group label="模型"><el-option v-for="model in modelsForTask(task.key)" :key="model.fullName" :label="model.fullName" :value="model.fullName" /></el-option-group><el-option-group label="路由组"><el-option v-for="group in groupsForTask(task.key)" :key="group" :label="group" :value="group" /></el-option-group></el-select></el-form-item></el-form>
        </section>
        <section class="settings-section route-section">
          <div class="section-title"><div><h2>模型路由组</h2><p>按主模型和后备顺序尝试；路由组可以作为默认模型或其他路由组的目标。</p></div><el-button size="small" icon="el-icon-plus" @click="addGroup">添加路由组</el-button></div>
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
            <main v-else class="provider-empty"><i class="el-icon-guide"></i><p>多个模型互为后备时，可添加路由组</p></main>
          </div>
        </section>
        <SectionAction :dirty="routingDirty" :saving="saving === 'model_groups'" :invalid="hasGroupErrors" effect="默认模型与路由组一起保存，保存后立即热加载" @reset="resetRouting" @save="saveGroups" />
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

      <el-tab-pane label="运行设置" name="settings">
        <el-radio-group v-model="settingsTab" size="small" class="settings-switch">
          <el-radio-button v-for="tab in schemaTabs" :key="tab.name" :label="tab.name">{{ tab.label }}<i v-if="isSectionDirty(tab.name)" class="dirty-dot" title="有未保存修改"></i></el-radio-button>
        </el-radio-group>
        <div v-for="tab in schemaTabs" v-show="settingsTab === tab.name" :key="tab.name" :ref="`settings-${tab.name}`">
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
              <p v-if="group.key === 'client_settings'" class="advanced-proxy-note">模型能力库：{{ catalogText }}<el-button type="text" icon="el-icon-refresh" :loading="catalogUpdating" @click="refreshCatalog">立即更新</el-button></p>
            </section>
            <template #footer><div class="save-description"><strong>{{ settingChangeCount(tab.name) ? settingChangeCount(tab.name) + " 项未保存修改" : "没有未保存的修改" }}</strong><span v-if="settingChangeCount(tab.name)">保存本页全部分类，{{ tab.effect }}</span></div><el-button :disabled="!isSectionDirty(tab.name) || Boolean(saving)" @click="resetSettings(tab.name)">撤销修改</el-button><el-button type="primary" :disabled="!isSectionDirty(tab.name)" :loading="saving === tab.name" @click="saveSettings(tab.name)">{{ tab.saveLabel }}</el-button></template>
          </SettingsLayout>
        </div>
      </el-tab-pane>
    </el-tabs>
    </template>

    <el-dialog title="修复失效引用" :visible.sync="repairVisible" width="min(720px, 94vw)" append-to-body>
      <p>保留服务商、密钥和有效路由。只清除以下失效引用；已有草稿会保留。</p>
      <div v-for="(change, index) in repairPreview.changes || []" :key="index" class="repair-change"><code>{{ change.path }}</code><p>{{ JSON.stringify(change.before) }} → {{ JSON.stringify(change.after) }}</p></div>
      <el-alert v-if="(repairPreview.remaining_issues || []).length" type="warning" :closable="false" title="仍有需要手动处理的项目"><p v-for="(issue, index) in repairPreview.remaining_issues" :key="index">{{ issue.message }}</p></el-alert>
      <span slot="footer"><el-button @click="repairVisible = false">取消</el-button><el-button type="primary" :loading="saving === 'repair'" :disabled="!(repairPreview.changes || []).length || Boolean(saving)" @click="applyRepair">确认修复</el-button></span>
    </el-dialog>

    <ModelEditor :visible.sync="editorVisible" :model="editorModel" :names="editorNames" :protocols="protocols" :can-check="!testingModelKey && Boolean(providerDraft && (providerDraft.name.trim() || selectedProviderName))" :checker="requestModelCheck" :presets="presets" :connection="editorConnection" @save="saveEditedModel" />

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
import { CHECK_STATES, DEFAULT_CHECK_ITEMS, PROTOCOL_LABELS, PROTOCOL_SHORT, TASK_LABELS, briefDetail, checkState, checkSummary, clone, formatTokens, jsonError, jsonText, modelProfile, modelTask, parseJsonObject, uid } from "@/utils/ai-models"
import ModelEditor from "./ModelEditor.vue"
import ModelTable from "./ModelTable.vue"
import ProviderLogo from "./ProviderLogo.vue"
import ProviderStarter from "./ProviderStarter.vue"

const SECTION_KEYS = { context: "context_settings", agent: "agent_settings", sandbox: "sandbox", web_search: "web_search" }
const CONNECTION_ERRORS = ["providers.name", "providers.protocol", "providers.base_url", "providers.timeout", "api_key"]
const hostOf = (url) => { try { return new URL(url).host } catch (_) { return url || "" } }

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
  components: { ModelEditor, ModelTable, ProviderLogo, ProviderStarter, SchemaField, SettingsLayout, StoreTemplate, SectionAction },
  data() {
    return {
      settingsCategory: { context: "llm_summary", agent: "loop", sandbox: "runtime", web_search: "search", advanced: "client_settings" }, settingsSearch: { context: "", agent: "", sandbox: "", web_search: "", advanced: "" }, settingsLocalIssues: {}, repairVisible: false, repairPreview: {}, sessionExpired: false, loginUsername: "", loginPassword: "", loggingIn: false, aiEpoch: 0,
      loading: false, loadError: "", saving: "", activeSection: "providers", revision: "", schema: {}, presets: {}, protocols: [], providers: [], validationIssues: [], operationIssues: [], selectedProviderName: "", providerDraft: null,
      providerSearch: "", providerDirty: false, modelsDirty: false, modelSearch: "", sectionDrafts: { default_models: {}, model_groups: {}, context: {}, agent: {}, sandbox: {}, web_search: {}, advanced: {} }, originalSections: {}, dirtySections: {}, invalidSections: {}, groupRows: [], routeSearch: "", selectedRouteGroupId: "", routingIssues: [],
      discovering: false, upstreamOpen: false, catalog: {}, catalogUpdating: false, providerProbeResults: {}, testingModelKey: "", batchChecking: false,
      connectionOpen: false, editorVisible: false, editorModel: null, editorIndex: null, settingsTab: "context",
      personaLoading: false, personaSaving: false, personaAvailable: null, personaError: "", personaRevision: "", personaDraft: { name: "", prompt: "", style: "", enabled: true }, personaOriginal: null, personaToneText: "", personaDialogueText: "", personaDirty: false,
      taskLabels: TASK_LABELS,
      defaultTasks: [{ key: "chat", label: "对话" }, { key: "vision", label: "视觉（对话模型不支持图片时转述图片）" }, { key: "embedding", label: "向量嵌入" }, { key: "tts", label: "语音合成" }, { key: "image", label: "图像生成" }, { key: "rerank", label: "文本重排" }],
      schemaTabs: [
        { name: "context", label: "上下文", saveLabel: "保存上下文设置", effect: "保存后立即热加载" },
        { name: "agent", label: "Agent", saveLabel: "保存 Agent 设置", effect: "保存后立即热加载" },
        { name: "sandbox", label: "沙箱", saveLabel: "保存沙箱设置", effect: "部分设置在新会话或重启后生效" },
        { name: "web_search", label: "联网搜索", saveLabel: "保存联网搜索设置", effect: "保存后立即热加载" },
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
        { name: "routing", label: "默认与路由" },
        { name: "persona", label: "AI人设" },
        { name: "chat_plugins", label: "AI聊天" },
        { name: "settings", label: "运行设置" },
      ]
    },
    /**
     * 模型编辑器所属服务商的连接信息，用于判断内置工具是否自动发送
     * @returns {{ base_url: string, protocol: string, official: string|null }} 接口地址、协议与官方厂商
     */
    editorConnection() {
      const draft = this.providerDraft || {}
      const saved = this.savedProvider
      return { base_url: draft.base_url || "", protocol: draft.protocol || "", preset: draft.preset || null, official: saved && saved.base_url === draft.base_url ? saved.official || null : null }
    },
    routingDirty() { return this.isSectionDirty("default_models") || this.isSectionDirty("model_groups") },
    savedProvider() { return this.providers.find((item) => item.name === this.selectedProviderName) || null },
    /**
     * 已保存且启用的模型名称，只有这些模型可以直接设为默认
     * @returns {string[]} 模型名称
     */
    savedModelNames() { return this.providerDraft?.isNew ? [] : (this.savedProvider?.models || []).filter((model) => model.enabled !== false).map((model) => model.name) },
    testingModelName() { return (this.providerDraft?.models || []).find((model) => this.modelTestKey(model) === this.testingModelKey)?.name || "" },
    editorNames() { return (this.providerDraft?.models || []).filter((_, index) => index !== this.editorIndex).map((model) => model.name) },
    /**
     * 收起连接设置时显示的一行摘要：厂商或协议、接口地址与密钥数量
     * @returns {string} 摘要文本
     */
    connectionSummary() {
      const draft = this.providerDraft
      const keys = draft.api_key_slots.filter((slot) => String(slot.value || "").trim()).length
      const base = draft.base_url || this.presetBaseUrl(draft.preset, draft.protocol)
      return [this.presets[draft.preset]?.label || "自定义", this.protocolLabel(draft.protocol), hostOf(base) || "未填写接口地址", keys ? `${keys} 个密钥` : "未填写密钥"].join(" · ")
    },
    connectionError() { return CONNECTION_ERRORS.some((path) => this.operationError(path)) },
    dirtyCount() { return Number(this.providerDirty) + Number(this.modelsDirty) + Number(this.personaDirty) + Object.values(this.dirtySections).filter(Boolean).length },
    filteredProviders() { const key = this.providerSearch.trim().toLowerCase(); return this.providers.filter((item) => `${item.name} ${item.preset || ""} ${item.protocol}`.toLowerCase().includes(key)) },
    filteredModels() { const key = this.modelSearch.trim().toLowerCase(); return (this.providerDraft?.models || []).filter((item) => item.name.toLowerCase().includes(key)) },
    allModels() { return this.providers.flatMap((provider) => provider.models.map((model) => ({ ...model, provider: provider.name, fullName: `${provider.name}/${model.name}` }))) },
    filteredRouteGroups() { const key = this.routeSearch.trim().toLowerCase(); return this.groupRows.filter((item) => !key || item.name.toLowerCase().includes(key)) },
    selectedRouteGroup() { return this.groupRows.find((item) => item.clientId === this.selectedRouteGroupId) || null },
    upstreamModels() { const profiles = this.providerDraft?.discovery?.profiles; return profiles ? Object.keys(profiles).sort() : null },
    newUpstreamModels() { const upstream = this.upstreamModels || []; return upstream.filter((name) => !this.isConfiguredModel(name)) },
    /**
     * 上游有但尚未添加的模型，按模型搜索框过滤，并附上能力提示
     * @returns {{ name: string, hint: string }[]} 模型
     */
    upstreamAvailable() {
      const key = this.modelSearch.trim().toLowerCase()
      return this.newUpstreamModels.filter((name) => name.toLowerCase().includes(key)).map((name) => ({ name, hint: this.discoveredHint(name) }))
    },
    keyUrl() { return this.presets[this.providerDraft?.preset]?.key_url || "" },
    missingModelCount() { return (this.providerDraft?.models || []).filter((model) => this.missingUpstream(model)).length },
    /**
     * 尚未核验或跳过核验的已启用对话模型
     * @returns {object[]} 模型配置
     */
    uncheckedModels() { return (this.providerDraft?.models || []).filter((model) => model.enabled !== false && this.modelTask(model) === "chat" && this.checkState(model) !== CHECK_STATES.checked) },
    catalogText() {
      if (!this.catalog.updated_at) return "尚未下载，配置服务商后会在后台自动下载"
      return `${this.catalog.count} 个模型，${this.formatTime(this.catalog.updated_at)} 更新，每 7 天自动更新`
    },
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
    providerInvalid() { return !this.providerDraft?.name.trim() || Boolean(this.jsonError(this.providerDraft.paramsText) || this.jsonError(this.providerDraft.headersText)) },
    providerDraftStatus() {
      if (!this.providerDraft) return { code: "unavailable", label: "状态待确认", type: "info", reason: "请先选择服务商" }
      const draft = this.providerDraft
      const original = this.providers.find((item) => item.name === this.selectedProviderName)
      const draftBase = String(draft.base_url || this.presetBaseUrl(draft.preset, draft.protocol)).trim().replace(/\/$/, "")
      const originalBase = String(original?.base_url || "").replace(/\/$/, "")
      const temporaryKey = Boolean(this.temporaryKey)
      if (original && !temporaryKey && (original.protocol !== draft.protocol || originalBase !== draftBase)) return { code: "scope_changed", label: "凭据范围已变化", type: "warning", reason: "修改协议或地址后，请填写临时 API Key 再测试" }
      if (!draftBase) return { code: "missing_base", label: "缺少接口地址", type: "warning", reason: "请先填写接口地址" }
      const hasSavedKey = draft.api_key_slots.some((slot) => (original?.api_keys || []).includes(String(slot.value || "").trim()))
      if (!temporaryKey && !hasSavedKey) return { code: "missing_credentials", label: "缺少有效凭据", type: "warning", reason: "请先填写有效 API Key" }
      return { code: "ready", label: "可自动发现", type: "success", reason: "" }
    },
    temporaryKey() {
      if (!this.providerDraft) return null
      const saved = this.providerDraft.isNew ? [] : this.providers.find((item) => item.name === this.selectedProviderName)?.api_keys || []
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
    connectionError(value) { if (value) this.connectionOpen = true },
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
      this.revision = data.revision; this.schema = data.schema || {}; this.presets = data.presets || {}; this.protocols = data.protocols || []; this.providers = clone(data.providers || []); this.validationIssues = data.validation_issues || []; this.operationIssues = []; this.catalog = data.catalog || {}
      this.originalSections = clone(data.sections || {}); this.sectionDrafts = clone(data.sections || {}); this.dirtySections = {}; this.invalidSections = {}; this.groupRows = this.groupsToRows(this.sectionDrafts.model_groups); this.selectedRouteGroupId = this.groupRows.some((item) => item.clientId === this.selectedRouteGroupId) ? this.selectedRouteGroupId : this.groupRows[0]?.clientId || ""; this.routingIssues = []
      const target = preferredName || this.selectedProviderName; this.selectedProviderName = this.providers.some((item) => item.name === target) ? target : this.providers[0]?.name || ""
      this.resetProviderDraft(); this.providerDirty = false; this.modelsDirty = false; this.syncDirty()
    },
    resetProviderDraft() {
      const provider = this.providers.find((item) => item.name === this.selectedProviderName)
      if (!provider) { this.providerDraft = null; return }
      this.connectionOpen = !(provider.api_keys || []).length
      const slots = (provider.api_keys || []).map((value) => ({ value, clientId: uid() }))
      if (!slots.length) slots.push({ value: "", clientId: uid() })
      this.providerDraft = { ...clone(provider), api_key_slots: slots, paramsText: jsonText(provider.params), headersText: jsonText(provider.headers), isNew: false }
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
    async createProvider() { if (this.saving) return; if ((this.providerDirty || this.modelsDirty) && !(await this.confirmDiscard())) return; this.selectedProviderName = ""; this.providerDraft = null; this.providerDirty = false; this.modelsDirty = false; this.syncDirty() },
    /**
     * 按所选厂商预设新建服务商草稿，自动填写名称、协议与地址
     * @param {string|null} key 厂商预设，为空时为自定义服务商
     */
    startProvider(key) {
      const preset = this.presets[key]
      const label = preset?.label || "自定义服务商"
      let name = label
      for (let index = 2; this.providers.some((item) => item.name === name); index += 1) name = `${label} ${index}`
      const protocol = preset?.protocol || "openai_chat"
      this.providerDraft = { name, preset: key || null, protocol, base_url: this.presetBaseUrl(key, protocol), timeout: 120, paramsText: "", headersText: "", api_key_slots: [{ value: "", clientId: uid() }], models: [], isNew: true }
      this.connectionOpen = true; this.providerDirty = true; this.modelsDirty = false; this.syncDirty()
      this.$nextTick(() => this.$el.querySelector(key ? ".secret-row input" : ".provider-form input")?.focus())
    },
    cancelStarter() { this.selectedProviderName = this.providers[0]?.name || ""; this.resetProviderDraft() },
    invalidateProbeResults() {
      const key = this.selectedProviderName || "__new__"
      if (this.providerProbeResults[key]) this.$delete(this.providerProbeResults, key)
    },
    markProviderDirty() { this.providerDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    presetBaseUrl(preset, protocol) { return this.presets[preset]?.base_urls?.[protocol] || "" },
    protocolLabel(protocol) { return PROTOCOL_LABELS[protocol] || protocol || "未设置协议" },
    providerKind(provider) { return this.presets[provider.preset]?.label || this.protocolLabel(provider.protocol) },
    jsonError,
    modelTask,
    checkState,
    /**
     * 切换厂商预设或协议；地址为空或仍是原预设默认地址时随之切换
     * @param {object} changes 变更的 preset / protocol
     */
    setProviderScope(changes) {
      const draft = this.providerDraft
      const previousBase = this.presetBaseUrl(draft.preset, draft.protocol)
      Object.assign(draft, changes)
      const preset = this.presets[draft.preset]
      if ("preset" in changes && preset && !preset.base_urls[draft.protocol]) draft.protocol = preset.protocol
      if (!String(draft.base_url || "").trim() || draft.base_url === previousBase) draft.base_url = this.presetBaseUrl(draft.preset, draft.protocol)
      this.markProviderDirty()
    },
    addKey() { this.providerDraft.api_key_slots.push({ value: "", clientId: uid() }); this.markProviderDirty() },
    removeKey(index) { this.providerDraft.api_key_slots.splice(index, 1); this.markProviderDirty() },
    providerPayload({ includeModels = false } = {}) {
      const draft = this.providerDraft
      return { expected_revision: this.revision, name: draft.name.trim(), preset: draft.preset || null, protocol: draft.protocol, base_url: String(draft.base_url || "").trim() || null, timeout: draft.timeout, headers: parseJsonObject(draft.headersText), params: parseJsonObject(draft.paramsText), api_keys: draft.api_key_slots.map((slot) => String(slot.value || "").trim()).filter(Boolean), models: draft.isNew || includeModels ? draft.models.map(({ resolved_profile, check, ...model }) => model) : null }
    },
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
        const response = await this.aiPost(`${this.$root.prefix}/ai/providers/discover`, { expected_revision: this.revision, provider_name: this.providerDraft.name.trim() || null, saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName, preset: this.providerDraft.preset || null, protocol: this.providerDraft.protocol, base_url: String(this.providerDraft.base_url || "").trim() || null, api_key: this.temporaryKey }, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.$set(this.providerDraft, "discovery", { updated_at: Date.now() / 1000, profiles: response.data.profiles || {} })
        this.upstreamOpen = true
        this.$set(this.providerProbeResults, resultKey, { success: true, message: `连接成功，发现 ${response.data.models?.length || 0} 个模型，其中 ${this.newUpstreamModels.length} 个未添加，耗时 ${response.data.latency_ms || 0} ms。` })
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
        missing_credentials: { label: "缺少有效凭据", type: "warning" },
        missing_base: { label: "缺少接口地址", type: "warning" },
      }
      return states[provider.discovery_status] || { label: "状态待确认", type: "info" }
    },
    /**
     * 把上游模型加入模型列表，保存后生效
     * @param {string[]} names 模型名称
     */
    addUpstreamModels(names) {
      const added = names.filter((name) => !this.isConfiguredModel(name))
      added.forEach((name) => this.providerDraft.models.push({ name, enabled: true, protocol: null, base_url: null, profile: {}, params: {} }))
      if (!added.length) return
      this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty()
      this.$message.success(added.length === 1 ? `已添加 ${added[0]}，保存后生效。` : `已添加 ${added.length} 个模型，保存后生效。`)
    },
    modelIndex(model) { return this.providerDraft.models.findIndex((item) => item === model || item.name === model.name) },
    modelTestKey(model) { return `${this.providerDraft?.name || this.selectedProviderName}/${model.name}` },
    deleteModel(model) { const actual = this.modelIndex(model); if (actual < 0) return; this.providerDraft.models.splice(actual, 1); this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    isConfiguredModel(name) { return (this.providerDraft?.models || []).some((model) => model.name === name) },
    missingUpstream(model) { const upstream = this.upstreamModels; return Boolean(upstream) && !model.protocol && !model.base_url && !upstream.includes(model.name) },
    formatTime(seconds) { return seconds ? new Date(seconds * 1000).toLocaleString() : "" },
    async refreshCatalog() {
      this.catalogUpdating = true
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/catalog/refresh`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.catalog = response.data || {}
        this.$message.success(`能力库已更新，共 ${this.catalog.count} 个模型。`)
        await this.loadConfiguration()
      } catch (error) { this.$message.error(apiErrorDetail(error, "能力库更新失败。")) }
      finally { this.catalogUpdating = false }
    },
    discoveredHint(name) {
      const profile = this.providerDraft?.discovery?.profiles?.[name]
      if (!profile) return ""
      const parts = [profile.tasks.map((item) => TASK_LABELS[item] || item).join("、")]
      if (profile.input_modalities.some((item) => item !== "text")) parts.push("多模态")
      if (profile.reasoning) parts.push("推理")
      parts.push(profile.catalog ? `${formatTokens(profile.context_window)} 上下文` : "能力库未收录")
      if (profile.protocols) parts.push(profile.protocols.map((item) => PROTOCOL_SHORT[item] || item).join("/"))
      return parts.join(" · ")
    },
    async testModel(model) {
      const task = this.modelTask(model)
      const providerName = this.providerDraft.name.trim() || this.selectedProviderName
      if (!providerName) return this.$message.warning("请先填写服务商名称。")
      const testKey = `${providerName}/${model.name}`
      if (this.testingModelKey) return
      this.testingModelKey = testKey
      try { await this.$confirm(`将对 ${providerName}/${model.name} 发起一次最小 ${TASK_LABELS[task] || task} 请求，可能产生费用。`, "确认模型测试", { type: "warning" }) } catch (_) { this.testingModelKey = ""; return }
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/models/test`, this.modelRequestPayload(model, task), { suppressErrorToast: true })
        this.$message.success(`连接成功，延迟 ${response.data.latency_ms} ms`)
      } catch (error) { this.$message.error(apiErrorDetail(error, "模型测试失败。")) }
      finally { if (this.testingModelKey === testKey) this.testingModelKey = "" }
    },
    /**
     * 按当前服务商草稿构造模型测试与核验的请求体
     * @param {object} model 模型配置
     * @param {string} task 任务类型
     * @returns {object} 请求体
     */
    modelRequestPayload(model, task) {
      const providerName = this.providerDraft.name.trim() || this.selectedProviderName
      const { resolved_profile, check, ...modelConfig } = model
      return {
        expected_revision: this.revision,
        model: `${providerName}/${model.name}`,
        provider_name: providerName,
        saved_provider_name: this.providerDraft.isNew ? null : this.selectedProviderName,
        preset: this.providerDraft.preset || null,
        protocol: this.providerDraft.protocol,
        base_url: String(this.providerDraft.base_url || "").trim() || null,
        api_key: this.temporaryKey,
        timeout: this.providerDraft.timeout,
        model_config: modelConfig,
        task,
        confirmed_paid_request: true,
      }
    },
    /**
     * 核验模型能力，并把核验状态与能力档案写回草稿与已保存配置中的同名模型
     * @param {object} model 模型配置，可以是编辑中尚未写回列表的配置
     * @param {string[]} items 核验项目
     * @returns {Promise<object>} 后端返回的核验结果
     */
    async requestModelCheck(model, items) {
      const testKey = this.modelTestKey(model)
      this.testingModelKey = testKey
      try {
        const response = await this.aiPost(`${this.$root.prefix}/ai/models/check`, { ...this.modelRequestPayload(model, "chat"), items }, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        const { check, resolved_profile } = response.data
        const targets = [this.providerDraft?.models, this.savedProvider?.models].map((models) => (models || []).find((item) => item.name === model.name))
        targets.filter(Boolean).forEach((item) => { this.$set(item, "check", check); this.$set(item, "resolved_profile", resolved_profile) })
        return response.data
      } finally { if (this.testingModelKey === testKey) this.testingModelKey = "" }
    },
    /**
     * 按默认项目逐个核验模型，结束后汇总失败的模型
     * @param {object[]} models 模型配置
     */
    async checkModels(models) {
      if (!models.length || this.testingModelKey) return
      const failed = []
      this.batchChecking = true
      try {
        for (const model of models) {
          try { await this.requestModelCheck(model, DEFAULT_CHECK_ITEMS) } catch (error) { failed.push(`${model.name}：${apiErrorDetail(error, "核验失败")}`) }
        }
      } finally { this.batchChecking = false }
      if (failed.length) this.$message.error({ message: `${failed.length} 个模型核验失败，可稍后重试。${failed.join("；")}`, duration: 8000 })
      else this.$message.success(`已核验 ${models.length} 个模型。`)
    },
    async checkUncheckedModels() {
      const models = [...this.uncheckedModels]
      try { await this.$confirm(`将按默认项目核验 ${models.length} 个对话模型，每个模型发起数次小请求，可能产生费用。`, "核验未核验模型", { type: "warning", confirmButtonText: "开始核验", cancelButtonText: "取消" }) } catch (_) { return }
      await this.checkModels(models)
    },
    /**
     * 保存服务商；有新增且未核验的对话模型时，由用户选择保存后核验或跳过核验
     */
    async saveProviderWithCheck() {
      if (this.saving || !this.providerDraft) return
      const saved = this.providerDraft.isNew ? [] : (this.providers.find((item) => item.name === this.selectedProviderName)?.models || []).map((item) => item.name)
      const added = this.providerDraft.models.filter((model) => !saved.includes(model.name) && model.enabled !== false && this.modelTask(model) === "chat" && this.checkState(model) !== CHECK_STATES.checked).map((model) => model.name)
      let check = false
      if (added.length) {
        try {
          await this.$confirm(`新增的对话模型 ${added.join("、")} 尚未核验能力。核验会按默认项目发起少量请求，可能产生费用；跳过时按能力库与名称推断处理，之后可随时核验。`, "保存后核验模型？", { confirmButtonText: "保存并核验", cancelButtonText: "跳过核验", distinguishCancelAndClose: true, type: "info" })
          check = true
        } catch (action) { if (action !== "cancel") return }
      }
      if (!(await this.saveProvider())) return
      if (check) await this.checkModels((this.providerDraft?.models || []).filter((model) => added.includes(model.name)))
      await this.fillDefaultModels()
    },
    /**
     * 为尚未配置默认模型的任务选用当前服务商中合适的模型；对话任务优先选用已核验且对话正常的模型
     */
    async fillDefaultModels() {
      const provider = this.savedProvider
      const defaults = this.sectionDrafts.default_models || {}
      if (!provider) return
      const pending = this.routingDirty
      const failed = (model) => (model.check?.results || []).some((row) => row.item === "chat" && row.status === "failed")
      const filled = []
      this.defaultTasks.forEach(({ key, label }) => {
        if (defaults[key]) return
        const candidates = provider.models.filter((model) => model.enabled !== false && modelProfile(model).tasks.includes(key) && !failed(model))
        const model = (key === "chat" && candidates.find((item) => item.check?.status === "checked")) || candidates[0]
        if (!model) return
        this.$set(this.sectionDrafts.default_models, key, `${provider.name}/${model.name}`)
        filled.push(`${model.name}（${label}）`)
      })
      if (!filled.length) return
      const text = `已将 ${filled.join("、")} 设为默认模型，可在「默认与路由」中修改。`
      if (pending) { this.markSectionDirty("default_models"); this.$message.info(`${text}与其他未保存的路由修改一起保存后生效。`); return }
      await this.saveSection("default_models", { successMessage: text })
    },
    /**
     * 把模型设为其主要任务的默认模型；默认与路由有未保存修改时只写入草稿
     * @param {object} model 模型配置
     */
    async setDefault(model) {
      if (this.saving) return
      const task = modelTask(model)
      const pending = this.routingDirty
      this.$set(this.sectionDrafts.default_models, task, `${this.selectedProviderName}/${model.name}`)
      const text = `已将 ${model.name} 设为默认${TASK_LABELS[task] || task}模型。`
      if (pending) { this.markSectionDirty("default_models"); this.$message.info(`${text}「默认与路由」有未保存修改，保存后一起生效。`); return }
      await this.saveSection("default_models", { successMessage: text })
    },
    /**
     * 按默认项目核验单个对话模型，并以一行摘要提示结果
     * @param {object} model 模型配置
     */
    async quickCheck(model) {
      if (this.testingModelKey) return
      if (!(this.providerDraft.name.trim() || this.selectedProviderName)) return this.$message.warning("请先填写服务商名称。")
      try { await this.$confirm(`将对 ${model.name} 按默认项目各发起一到两次小请求，用实测结果确定能力，可能产生少量费用。需要核验网页搜索等项目时，请在“编辑”中选择。`, "核验模型能力", { type: "info", confirmButtonText: "开始核验", cancelButtonText: "取消" }) } catch (_) { return }
      try {
        const data = await this.requestModelCheck(model, DEFAULT_CHECK_ITEMS)
        const failed = data.results.find((row) => row.item === "chat" && row.status === "failed")
        if (failed) this.$message.error({ message: `${model.name} 核验失败：${briefDetail(failed.detail)}`, duration: 6000 })
        else this.$message.success(`${model.name} 核验完成：${checkSummary(data.results) || "连通正常"}`)
      } catch (error) { this.$message.error(apiErrorDetail(error, "模型核验失败。")) }
    },
    toggleModel(model, enabled) { this.$set(model, "enabled", enabled); this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty() },
    openEditor(model = null) { this.editorModel = model; this.editorIndex = model ? this.modelIndex(model) : null; this.editorVisible = true },
    saveEditedModel(value) {
      if (this.editorIndex == null) this.providerDraft.models.push(value); else this.providerDraft.models.splice(this.editorIndex, 1, value)
      this.modelsDirty = true; this.invalidateProbeResults(); this.syncDirty()
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
    sectionSchema(name) { const properties = this.schema.properties || {}; const map = SECTION_KEYS; if (name === "advanced") return { type: "object", properties: { client_settings: properties.client_settings, debug_log: properties.debug_log } }; return this.resolveSchema(properties[map[name]]) },
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
      this.settingsSearch[tab] = ""; this.settingsTab = tab
      this.$nextTick(() => [].concat(this.$refs[`settings-${tab}`])[0]?.querySelector(".field-error")?.scrollIntoView({ block: "center", behavior: "smooth" }))
    },
    /**
     * 本地校验后保存设置分区，校验失败时定位到第一个问题
     * @param {string} tab 分区名称
     */
    async saveSettings(tab) {
      const draft = this.sectionDrafts[tab] || {}
      const issues = tab === "advanced"
        ? [...new Set(["client_settings", "debug_log", ...Object.keys(draft)])].flatMap((key) => validateField(draft[key], this.schema.properties?.[key] || {}, this.schema, key))
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
    resetRouting() { this.resetSection("default_models"); this.resetSection("model_groups") },
    resetSection(name) { this.$set(this.sectionDrafts, name, clone(this.originalSections[name])); if (name === "model_groups") { this.groupRows = this.groupsToRows(this.sectionDrafts.model_groups); this.selectedRouteGroupId = this.groupRows[0]?.clientId || ""; this.routingIssues = [] } this.$set(this.dirtySections, name, false); this.syncDirty() },
    sectionInvalid(name) { return Boolean(this.invalidSections[name]?.length) },
    async saveSection(name, { successMessage } = {}) { const value = this.sectionDrafts[name]; if (this.sectionInvalid(name) || (this.saving && this.saving !== "model_groups")) return; this.saving = name; try { const submitted = { section: name, value: JSON.stringify(name === "model_groups" ? this.groupRows : this.sectionDrafts[name]) }; const response = await this.aiPut(`${this.$root.prefix}/ai/configuration/sections/${name}`, { expected_revision: this.revision, value }); if (!response.suc) throw new Error(response.info); if (response.data?.apply_mode !== "failed") this.applySavedConfiguration(response.data, this.selectedProviderName, submitted); await this.handleAiApply(response, { successMessage }) } catch (error) { this.captureOperationError(error, "AI 配置保存失败。") } finally { this.saving = "" } },
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
    targetOptions(kind, currentGroup) { if (kind === "group") return this.groupRows.filter((item) => item.clientId !== currentGroup.clientId && item.name.trim()).map((item) => ({ label: item.name.trim(), value: item.name.trim(), tag: "路由组" })); return this.allModels.filter((item) => item.enabled !== false).map((item) => ({ label: item.fullName, value: item.fullName, tag: TASK_LABELS[this.modelTask(item)] })) },
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
     * 获取能力档案包含指定任务的已启用模型
     * @param {string} task 任务键
     * @returns {object[]} 模型列表
     */
    modelsForTask(task) { return this.allModels.filter((model) => { const profile = modelProfile(model); return model.enabled !== false && (task === "vision" ? profile.tasks.includes("chat") && (profile.input_modalities || []).includes("image") : profile.tasks.includes(task)) }) },
    /**
     * 设置默认任务模型，清空时保存为 null
     * @param {string} task 任务键
     * @param {string} value 模型或路由组名称
     */
    setDefaultModel(task, value) { this.$set(this.sectionDrafts.default_models, task, value || null); this.markSectionDirty("default_models") },
    captureOperationError(error, fallback) { this.operationIssues = apiErrorIssues(error); this.$message.error(apiErrorDetail(error, fallback)) },
    handleAiApply(response, options = {}) { return handleApplyResult(this, response, { ...options, restartPrompt: "AI 启动期配置已保存，需要重启后生效。", restartRequest: () => this.aiPost(`${this.$root.prefix}/system/configuration/restart`, {}), returnRoute: "/ai", recoveryMessage: "AI 启动期配置将在新进程中生效。" }) },
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
.ai-page { border-radius:16px; max-width:1600px; margin:0 auto; min-height: 100%; padding: 20px 22px 32px; overflow-y: auto; color: var(--text-color); background: var(--bg-color-secondary,#fff); }.page-header, .section-title, .subheading, .section-action { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.page-header { margin-bottom: 12px; }.configuration-warning { margin-bottom: 12px; }.configuration-warning code { margin-right: 6px; }.load-error { display: grid; min-height: 260px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 28px; border: 1px solid var(--danger-color); border-radius: 8px; background: var(--bg-color-secondary); }.load-error > i { color: var(--danger-color); font-size: 34px; }.load-error h2 { margin: 0; font-size: 18px; }.load-error p { margin: 8px 0 0; color: var(--text-color-secondary); }.page-header h1, .section-title h2, .subheading h3 { margin: 0; letter-spacing: 0; }.page-header h1 { font-size: 24px; }.page-header p, .section-title p, .subheading p { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 13px; }.header-status { display: flex; align-items: center; gap: 8px; }.ai-tabs { min-height: 0; }.provider-workbench { display: grid; min-height: 650px; grid-template-columns: 250px minmax(0, 1fr); border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.provider-sidebar { min-width: 0; padding: 16px; border-right: 1px solid var(--border-color); }.sidebar-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }.provider-list { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }.provider-list button { display: flex; width: 100%; min-height: 58px; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.provider-list button:hover { background: var(--bg-color-hover); }.provider-list button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.provider-list span { display: flex; min-width: 0; flex-direction: column; }.provider-list strong, .provider-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.provider-list small { margin-top: 4px; color: var(--text-color-secondary); }.provider-main { min-width: 0; padding: 20px 22px 26px; }.provider-form, .advanced-grid, .default-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.full-control { width: 100%; }.secret-section, .models-section { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-color-light); }.secret-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 10px; }.advanced-collapse { margin-top: 14px; border-bottom: 0; }.provider-empty { display: grid; place-content: center; color: var(--text-color-secondary); text-align: center; }.provider-empty i { font-size: 42px; }.settings-section { min-height: 480px; padding: 20px 22px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.section-action { position: sticky; bottom: 0; z-index: 3; margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color); }.section-action span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.empty-copy { padding: 30px 12px; color: var(--text-color-secondary); text-align: center; }.danger-text { color: var(--danger-color) !important; }.upstream-summary { margin: 8px 0 0; color: var(--text-color-secondary); font-size: 12px; }
@media (max-width: 820px) { .ai-page { padding: 12px; }.page-header, .section-title, .subheading { align-items: flex-start; flex-direction: column; }.header-status { width: 100%; flex-wrap: wrap; }.load-error { min-height: 220px; grid-template-columns: auto minmax(0, 1fr); padding: 20px; }.load-error .el-button { grid-column: 1 / -1; }.provider-workbench { grid-template-columns: 1fr; }.provider-sidebar { border-right: 0; border-bottom: 1px solid var(--border-color); }.provider-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.provider-main { padding: 16px; }.provider-form, .advanced-grid, .default-grid { grid-template-columns: 1fr; } }
.mobile-provider-select { display: none; width: 100%; margin-top: 10px; }
.mobile-section-select { display: none; width: 100%; margin-bottom: 12px; }
@media (max-width: 767px) { .mobile-section-select { display: block; }.ai-tabs ::v-deep > .el-tabs__header { display: none; } }
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
@media (max-width: 460px) { .provider-list { grid-template-columns: 1fr; }.section-action { align-items: stretch; flex-direction: column; }.section-action span { margin: 0; }.secret-row { grid-template-columns: 1fr; } }
.provider-workbench.no-sidebar { grid-template-columns: 1fr; }
.provider-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px 16px; }
.provider-title { min-width: 0; flex: 1 1 240px; }
.provider-header > .provider-logo { margin-top: 2px; }
.provider-list button > .provider-logo { margin-right: -2px; }
.provider-list button > span { flex: 1; }
.external-link { display: inline-flex; align-items: center; gap: 2px; margin-left: 10px; color: var(--primary-color); font-size: 12px; font-weight: normal; text-decoration: none; }
.external-link:hover { text-decoration: underline; }
.provider-title h2 { margin: 0; font-size: 18px; }
.provider-title p { margin: 6px 0 0; color: var(--text-color-secondary); font-size: 13px; word-break: break-all; }
.connection-panel { margin-top: 14px; padding: 16px 18px; border: 1px solid var(--border-color-light); border-radius: 8px; background: var(--bg-color); }
.connection-panel .secret-section { margin-top: 4px; padding-top: 14px; }
.models-section { margin-top: 18px; }
.models-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.models-toolbar h3 { margin: 0 auto 0 0; font-size: 15px; }
.models-toolbar h3 small { margin-left: 4px; color: var(--text-color-secondary); font-size: 12px; font-weight: normal; }
.models-toolbar .model-search { width: 220px; }
.models-toolbar .el-button + .el-button, .models-toolbar span + .el-button { margin-left: 0; }
.routing-defaults { min-height: 0; margin-bottom: 14px; }
.routing-defaults .default-grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); margin-top: 12px; }
.settings-switch { margin-bottom: 14px; }
.dirty-dot { display: inline-block; width: 6px; height: 6px; margin-left: 5px; border-radius: 50%; background: var(--warning-color, #e6a23c); vertical-align: middle; }
@media (max-width: 820px) {.connection-panel { padding: 12px; }.models-toolbar .model-search { width: 100%; order: 1; } }
</style>

<style scoped>
.advanced-provider-heading { font-size:13px; font-weight:600; margin:24px 0 0; color:var(--primary-color,#5c83d6); }.advanced-modified { display:inline-block; margin-top:8px; font-size:11px; color:var(--primary-color,#5c83d6); }.advanced-proxy-note { margin:18px 0 0; font-size:12px; color:var(--text-color-secondary); }.advanced-proxy-note .el-button { margin-left:8px; }@media(max-width:768px) { .ai-page .page-header { flex-direction:column; align-items:stretch; }.ai-page .header-status { flex-wrap:wrap; }.ai-page .header-status > * { margin-left:0; } }
</style>
