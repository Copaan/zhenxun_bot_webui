<template>
  <section class="nonebot-store">
    <header class="store-header">
      <div>
        <h1>NoneBot 官方插件</h1>
        <p>优先复用现有依赖，确认摘要后应用；可热加载时直接生效，否则重启验证</p>
      </div>
      <el-button icon="el-icon-refresh" :loading="loading" @click="loadPlugins(true)">检查更新</el-button>
    </header>

    <div class="store-toolbar">
      <el-input v-model.trim="search" clearable prefix-icon="el-icon-search" placeholder="搜索名称、包名、模块或作者" />
      <el-button class="filter-toggle" :class="{ 'is-open': filtersOpen }" icon="el-icon-s-operation" :aria-expanded="String(filtersOpen)" @click="filtersOpen = !filtersOpen">筛选<span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span></el-button>
      <div class="store-filters" :class="{ 'is-open': filtersOpen }">
      <el-select v-model="statusFilter" aria-label="安装状态">
        <el-option label="全部状态" value="all" />
        <el-option label="未安装" value="not_installed" />
        <el-option label="已安装" value="installed" />
        <el-option label="WebUI 托管" value="managed" />
        <el-option label="可更新" value="update_available" />
        <el-option label="外部安装" value="external" />
        <el-option label="不可安装" value="blocked" />
        <el-option label="操作失败" value="failed" />
      </el-select>
      <el-select v-model="typeFilter" aria-label="插件类型">
        <el-option label="全部类型" value="all" />
        <el-option label="应用插件" value="application" />
        <el-option label="库插件" value="library" />
      </el-select>
      <el-select v-model="adapterFilter" aria-label="适配器">
        <el-option label="全部适配器" value="all" />
        <el-option v-for="adapter in enabledAdapters" :key="adapter" :label="adapterName(adapter)" :value="adapter" />
      </el-select>
      <el-checkbox v-model="includeIncompatible" class="incompatible-toggle">显示不可安装项</el-checkbox>
      </div>
    </div>

    <div v-if="registryMeta.fetched_at" class="catalog-note">
      <i class="el-icon-collection-tag"></i>
      Registry 数据：{{ formatTime(registryMeta.fetched_at) }}
      <el-tag v-if="registryMeta.stale" size="mini" type="warning" effect="plain">离线缓存</el-tag>
      <el-tag v-else-if="registryMeta.cached" size="mini" type="info" effect="plain">缓存</el-tag>
      <el-tag v-if="registryMeta.invalid_entries" size="mini" type="warning" effect="plain">
        已隔离 {{ registryMeta.invalid_entries }} 条异常数据
      </el-tag>
    </div>

    <el-alert v-if="registryMeta.unavailable" title="远端目录暂不可用，仍可管理和卸载本地托管插件。" type="warning" :closable="false" />
    <el-alert v-if="environment && environment.orm_manual" title="等待控制台处理外部数据库结构" type="warning" :closable="false">
      <p>停止本实例并完成数据库备份后，在 {{ environment.orm_manual.working_directory }} 执行以下命令，完成后重新启动。命令使用待处理候选环境，不安装或升级依赖。</p>
      <pre class="console-command">{{ environment.orm_manual.command }}</pre>
    </el-alert>
    <div v-if="environment && environment.sync && environment.sync.status === 'prepared'" class="environment-status is-warning">
      <div><strong>基础环境修复已准备，等待手动重启</strong><p>可通过重启按钮执行，也可撤销后重新分析其他变更。</p></div>
      <el-button :disabled="readsPaused || authExpired || repairing" @click="cancelPreparedRepair">撤销待执行修复</el-button>
    </div>
    <div v-if="environment" class="environment-status" :class="`is-${environmentTone}`">
      <i :class="environmentIcon"></i>
      <div>
        <strong>{{ environmentTitle }}</strong>
        <p>{{ environmentDescription }}</p>
      </div>
      <el-button v-if="environment.repairable" type="warning" plain :loading="repairing" @click="repairEnvironment">预览依赖修复</el-button>
    </div>

    <div v-if="environment && (environment.candidate_built || environment.startup_verification?.dependency_verification)" class="verification-status">
      <span>最近依赖事务：</span>
      <el-tag v-if="environment.candidate_built" type="info" size="small">候选已构建，等待重启验证</el-tag>
      <el-tag v-if="environment.startup_verification?.dependency_verification" :type="environment.startup_verification.dependency_verification.state === 'passed' ? 'success' : 'warning'" size="small">{{ environment.startup_verification.dependency_verification.state === 'passed' ? '依赖核验通过' : environment.startup_verification.dependency_verification.state === 'partial' ? '所选依赖已核验，仍有冲突' : '依赖核验未通过' }}</el-tag>
      <el-tag v-if="environment.startup_verification?.plugin_verification" :title="(environment.startup_verification.failed || []).map(item => `${item.module_name || item.store_key}：${item.detail || (item.paths || []).join('、') || item.code}`).join('\n')" :type="environment.startup_verification.plugin_verification === 'passed' ? 'success' : 'danger'" size="small">{{ environment.startup_verification.plugin_verification === 'passed' ? '插件加载通过' : '插件加载失败' }}</el-tag>
    </div>
    <details v-if="environmentIssues.length" class="environment-details">
      <summary>核心依赖详情（{{ environmentIssues.length }} 项）</summary>
      <div v-for="(item, index) in environmentIssues" :key="`${item.owner}-${item.name}-${index}`" class="dependency-change">
        <code>{{ item.name || "核心环境" }}</code>
        <span>{{ coreIssueDescription(item) }}</span>
      </div>
    </details>

    <el-dialog title="依赖修复预览" :visible.sync="repairVisible" width="min(800px, 94vw)" append-to-body>
      <p v-if="repairPreview && repairPreview.mode === 'base'">基础环境将按项目锁文件同步并重启验证，保留额外安装的包；托管插件版本不在此处调整。</p>
      <p v-else>只调整勾选组的依赖，不更换插件版本。未解决的冲突继续保留，准备完成后需重启验证。</p>
      <div v-if="repairPreview && repairPreview.mode === 'base'">
        <div v-for="item in repairPreview.changes || []" :key="item.name" class="dependency-change"><code>{{ item.name }}</code><span>{{ item.actual || '缺失' }} → {{ item.expected }}</span></div>
      </div>
      <el-alert v-if="repairError" :title="repairError" type="error" :closable="false" class="repair-error" />
      <div v-for="group in repairPreview ? repairPreview.groups || [] : []" :key="group.id" class="repair-group">
        <el-checkbox v-model="repairSelected" :label="group.id" :disabled="group.status !== 'repairable'">{{ group.roots.join('、') }}</el-checkbox>
        <el-tag size="mini" :type="group.status === 'repairable' ? 'success' : 'danger'">{{ group.status === 'repairable' ? '可定向修复' : '需要处理约束或环境问题' }}</el-tag>
        <div v-for="item in group.changes" :key="item.name" class="dependency-change"><code>{{ item.name }}</code><span>{{ item.from || '缺失' }} → {{ item.to }}</span></div>
        <details v-if="group.issues.length"><summary>约束来源</summary><p v-for="(item, index) in group.issues" :key="index">{{ item.owner || '真寻' }}：{{ item.requirement }}；实际 {{ item.actual || '缺失' }}</p></details>
        <pre v-if="group.diagnostic">{{ group.diagnostic }}</pre>
        <p v-if="group.source_build_required">此项需要源码构建；确认准备同时确认本摘要中的构建与包变更。</p>
      </div>
      <template #footer>
        <el-button @click="repairVisible = false">关闭</el-button>
        <el-button v-if="!repairPreview" :disabled="readsPaused || repairing" @click="repairEnvironment">重新分析</el-button>
        <el-button type="primary" :loading="repairing" :disabled="readsPaused || (!repairSelected.length && repairPreview?.mode !== 'base') || repairing" @click="applyEnvironmentRepair">确认准备修复</el-button>
      </template>
    </el-dialog>

    <div v-if="error" class="inline-state is-error">
      <i class="el-icon-warning-outline"></i><span>{{ error }}</span>
      <el-button type="text" @click="loadPlugins(false)">重新加载</el-button>
    </div>

    <div v-loading="loading && plugins.length > 0" class="plugin-list">
      <template v-if="loading && !plugins.length">
        <div v-for="index in 5" :key="'skeleton-' + index" class="plugin-row is-skeleton" aria-hidden="true">
          <div class="plugin-main">
            <span class="zx-skeleton skeleton-title"></span>
            <span class="zx-skeleton skeleton-module"></span>
          </div>
          <div class="skeleton-body">
            <span class="zx-skeleton"></span>
            <span class="zx-skeleton is-short"></span>
          </div>
        </div>
      </template>
      <article v-for="plugin in plugins" :key="plugin.store_key" class="plugin-row">
        <div class="plugin-main">
          <div class="plugin-title-line">
            <h2>{{ plugin.name }}</h2>
            <el-tag v-if="plugin.is_official" size="mini" type="success" effect="plain">官方</el-tag>
            <el-tag size="mini" effect="plain">{{ typeLabel(plugin.plugin_type) }}</el-tag>
            <el-tag :type="stateTag(plugin).type" size="mini" effect="plain">{{ stateTag(plugin).label }}</el-tag>
            <el-tag v-if="plugin.compatibility_override_stale" size="mini" type="danger" effect="plain">兼容状态已变化</el-tag>
            <el-tag v-else-if="plugin.compatibility_unverified" size="mini" type="warning" effect="plain">兼容试运行</el-tag>
            <el-tooltip v-for="warning in plugin.warnings || []" :key="warning.code" :content="reasonLabel(warning) + (plugin.install_state === 'not_installed' ? '仍可尝试安装，安装时会检查依赖并实际加载验证。' : '')" placement="top">
              <el-tag size="mini" type="info" effect="plain">{{ warningTag(warning) }}</el-tag>
            </el-tooltip>
          </div>
          <div class="module-line">{{ plugin.project_link }} · {{ plugin.module_name }}</div>
          <p>{{ plugin.description || "暂无简介" }}</p>
          <div class="meta-line">
            <span><i class="el-icon-user"></i>{{ plugin.author || "未知作者" }}</span>
            <span><i class="el-icon-price-tag"></i>{{ plugin.version }}</span>
            <span><i class="el-icon-connection"></i>{{ adapterLabel(plugin) }}</span>
          </div>
          <div v-if="plugin.blocked_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.blocked_reasons[0]) }}
          </div>
          <p v-if="plugin.catalog_source === 'local'">远端目录无此条目，按本地托管记录管理。</p>
          <div v-if="plugin.failure_reasons && plugin.failure_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.failure_reasons[0]) }}
            <span v-if="plugin.failure_reasons[0].paths && plugin.failure_reasons[0].paths.length">
              （配置项：{{ plugin.failure_reasons[0].paths.join("、") }}）
            </span>
          </div>
          <div v-if="plugin.pending_reasons && plugin.pending_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.pending_reasons[0]) }}
          </div>
        </div>
        <div class="plugin-actions">
          <el-alert v-if="plugin.apply_mode === 'recovery_required'" title="回滚未确认，请先处理事务诊断" type="error" :closable="false" />
          <el-alert v-if="plugin.apply_mode === 'cleanup_pending'" title="变更已生效，临时文件将在下次依赖变更时清理" type="warning" :closable="false" />
          <el-button type="text" @click="openDetail(plugin)">详情</el-button>
          <el-button v-if="plugin.apply_mode === 'recovery_required'" disabled size="small">事务待处理</el-button>
          <el-tooltip v-else-if="plugin.apply_mode === 'restart_pending'" :content="plugin.transaction_state === 'migration_blocked' ? '外部数据库迁移尚未完成；手工迁移后再次重启即可重新检查' : '事务已保存，重启并通过启动验证后生效'" placement="top">
            <span class="pending-actions">
              <el-button size="small" icon="el-icon-time" disabled>{{ plugin.transaction_state === "migration_blocked" ? "等待手工迁移" : "等待重启" }}</el-button>
              <el-button size="small" type="danger" plain icon="el-icon-close" :loading="transactionAction === (plugin.store_key || plugin.id)" :disabled="Boolean(transactionAction) || applying || readsPaused || authExpired || ['building', 'verification_pending'].includes(plugin.transaction_state)" @click="cancelPending(plugin)">取消事务</el-button>
            </span>
          </el-tooltip>
          <el-tooltip v-else-if="plugin.apply_mode === 'failed'" :content="plugin.rollback_confirmed ? '插件启动验证失败，原运行版本已恢复' : '插件操作失败，请查看具体阶段与诊断'" placement="top">
            <span class="pending-actions">
              <el-button size="small" icon="el-icon-warning-outline" disabled>{{ plugin.rollback_confirmed ? '已回滚' : '操作失败' }}</el-button>
              <el-button v-if="plugin.rollback_confirmed" size="small" :disabled="Boolean(transactionAction) || applying || readsPaused || authExpired" @click="startAnalysis(plugin.managed ? 'update' : 'install', plugin)">重新分析</el-button>
              <el-button v-if="plugin.dependency_retry_available" size="small" type="warning" :disabled="Boolean(transactionAction) || applying || readsPaused || authExpired" @click="startAnalysis(plugin.managed ? 'update' : 'install', plugin, false)">分析最小依赖调整</el-button>
              <el-button v-else-if="!plugin.rollback_confirmed" size="small" type="danger" plain icon="el-icon-delete" :loading="transactionAction === (plugin.store_key || plugin.id)" :disabled="Boolean(transactionAction) || applying || readsPaused || authExpired" @click="clearFailed(plugin)">处理失败事务</el-button>
            </span>
          </el-tooltip>
          <el-button
            v-else-if="plugin.install_state === 'not_installed'"
            type="primary"
            size="small"
            icon="el-icon-download"
            :disabled="analysisVisible || Boolean(transactionAction) || applying || readsPaused || authExpired"
            @click="startAnalysis('install', plugin)"
          >安装</el-button>
          <el-button
            v-else-if="plugin.install_state === 'update_available'"
            type="warning"
            size="small"
            icon="el-icon-top"
            :disabled="analysisVisible || Boolean(transactionAction) || applying || readsPaused || authExpired"
            @click="startAnalysis('update', plugin)"
          >更新插件</el-button>
          <el-tooltip v-else-if="plugin.install_state === 'external'" content="该分发包在 WebUI 之外安装，不能自动接管或卸载" placement="top">
            <span><el-button size="small" disabled>外部安装</el-button></span>
          </el-tooltip>
          <el-tooltip v-else-if="plugin.install_state === 'blocked'" :content="reasonLabel(plugin.blocked_reasons[0])" placement="top">
            <span><el-button size="small" disabled>不可安装</el-button></span>
          </el-tooltip>
          <el-dropdown v-else trigger="click" :disabled="analysisVisible || Boolean(transactionAction) || applying || readsPaused || authExpired" @command="startAnalysis($event, plugin)">
            <el-button size="small" :disabled="analysisVisible || Boolean(transactionAction) || applying || readsPaused || authExpired">已安装<i class="el-icon-arrow-down el-icon--right" /></el-button>
            <el-dropdown-menu slot="dropdown">
              <el-dropdown-item command="uninstall">卸载</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </article>
      <div v-if="!loading && !plugins.length && !error" class="empty-state">
        <i class="el-icon-box"></i>
        <h2>没有符合条件的插件</h2>
        <p>调整搜索或兼容性筛选后重试</p>
      </div>
    </div>

    <el-pagination
      v-if="total > pageSize"
      class="store-pagination"
      background
      layout="prev, pager, next"
      :current-page.sync="page"
      :page-size="pageSize"
      :total="total"
      @current-change="loadPlugins(false)"
    />

    <el-drawer
      :visible.sync="analysisVisible"
      title="依赖分析"
      :size="drawerSize"
      append-to-body
      :before-close="closeAnalysis"
    >
      <div class="analysis-drawer">
        <template v-if="analysisPlugin">
          <div class="analysis-heading">
            <div>
              <h2>{{ analysisPlugin.name }}</h2>
              <span>{{ analysisPlugin.project_link }}@{{ analysisPlugin.version }}</span>
            </div>
            <el-tag :type="analysisStatusType" effect="plain">{{ analysisStatusLabel }}</el-tag>
          </div>

          <div v-if="analysisLoading" class="analysis-loading">
            <i class="el-icon-loading"></i>
            <strong>正在解析 PyPI 元数据与完整依赖图</strong>
            <span>不会安装软件包，也不会修改当前环境</span>
          </div>
          <template v-else-if="analysis">
            <el-alert
              v-if="analysis.status === 'blocked' || analysis.status === 'failed'"
              :title="(analysis.blocked_reasons || []).some(reason => ['current_environment_dependency_conflict', 'dependency_layer_state_mismatch', 'core_dependency_conflict'].includes(reason.code)) ? '当前环境阻止安装' : '此插件不能安装'"
              type="error"
              :closable="false"
              show-icon
            >
              <div v-for="(reason, reasonIndex) in analysis.blocked_reasons || []" :key="`${reason.code}-${reasonIndex}`" class="reason-item">
                <code>{{ reason.code }}</code>
                <strong>{{ reasonLabel(reason) }}</strong>
                <span v-if="reasonDetail(reason)">{{ reasonDetail(reason) }}</span>
                <div v-if="Array.isArray(reason.details) && reason.details.length" class="drift-list">
                  <div v-for="(item, itemIndex) in reason.details" :key="`${reason.code}-${item.owner}-${item.name}-${itemIndex}`" class="dependency-change">
                    <code>{{ item.name }}</code><span>{{ driftDescription(item) }}</span>
                  </div>
                </div>
              </div>
              <el-button v-if="analysis.environment && analysis.environment.repairable" type="warning" plain icon="el-icon-refresh" :loading="repairing" @click="repairEnvironment">预览依赖修复</el-button>
              <el-button v-if="(analysis.blocked_reasons || []).some(reason => reason.code === 'dependency_source_metadata_unavailable')" type="warning" plain icon="el-icon-cpu" @click="startAnalysis(analysis.action, analysisPlugin, analysis.prefer_existing !== false, true)">允许源码构建并重新分析</el-button>
            </el-alert>
            <template v-else-if="analysis.status === 'ready'">
              <section class="analysis-section core-ok">
                <i class="el-icon-circle-check"></i>
                <div><h3>真寻核心依赖保持不变</h3><p>NoneBot、Pydantic、FastAPI、适配器及核心闭包均已锁定。</p></div>
              </section>

              <section class="analysis-section">
                <h3>插件与依赖变更</h3>
                <p class="dependency-note">优先保留现有版本；为满足依赖要求而调整的其他包会标注为连带变化，已有待应用变更会单独标注。</p>
                <div v-if="!allChanges.length" class="muted">{{ sharedChanges.length ? "仅有下方共享依赖变更。" : "不会增加或修改 Python 包。" }}</div>
                <div v-for="item in allChanges" :key="`${item.kind}-${item.name}`" class="dependency-change">
                  <div><code>{{ item.name }}</code><div class="dependency-note">{{ dependencySource(item.name) }}</div></div>
                  <span v-if="item.kind === 'added'">新增 {{ item.version }}</span>
                  <span v-else-if="item.kind === 'changed'">{{ item.from }} → {{ item.to }}</span>
                  <span v-else>移除插件包 {{ item.version }}</span>
                </div>
                <p v-if="analysis.action === 'uninstall'" class="dependency-note">卸载只移除插件分发包，插件的依赖会保留，以免影响其他共用这些依赖的插件。</p>
              </section>

              <section v-if="sharedChanges.length" class="analysis-section shared-changes">
                <h3>共享依赖变化</h3>
                <p>这些包会影响整个真寻进程，只能在重启并完成启动验证后生效。</p>
                <div v-for="item in sharedChanges" :key="`shared-${item.name}`" class="dependency-change">
                  <div><code>{{ item.name }}</code><div class="dependency-note">{{ dependencySource(item.name) }}</div></div><span>{{ item.from || "缺失" }} → {{ item.to }}</span>
                </div>
              </section>

              <el-alert v-if="compatibilityOverrides.length" title="非核心依赖兼容试运行" type="warning" :closable="false" show-icon>
                <p>下列插件声明未包含当前较新版本。系统不会降级共享包，将通过重启验证并在失败时回滚。</p>
                <div v-for="item in compatibilityOverrides" :key="`override-${item.name}`" class="dependency-change">
                  <code>{{ item.name }}</code><span>{{ item.declared_requirement }} · 当前 {{ item.effective_version }}</span>
                </div>
              </el-alert>

              <el-alert v-if="analysis.plan.non_core_changes.length" title="非核心依赖版本将变化" type="warning" :closable="false" show-icon>
                <p>这些变化可能影响其他第三方插件，需要单独确认。</p>
              </el-alert>
              <el-alert v-if="analysis.plan.source_build_required" title="需要从源码构建" type="warning" :closable="false" show-icon>
                <p>确认后会先在临时目录构建，构建失败时不保存任何改动；构建成功后需重启验证。</p>
              </el-alert>
              <el-alert v-if="analysis.plan.database_migration_possible" title="插件可能包含数据库迁移" type="warning" :closable="false" show-icon>
                <p v-if="analysis.plan.database_type === 'external'">当前使用外部数据库。系统只执行迁移检查，不会自动修改；迁移未完成时将保留旧运行版本。</p>
                <p v-else>launcher 将在停止 worker 后备份 SQLite、非交互执行迁移，并在迁移或启动失败时恢复数据库。</p>
              </el-alert>

              <el-alert v-if="analysis.plan.hot_apply_expected" title="预计可热加载" type="success" :closable="false" show-icon>
                <p v-if="analysis.action === 'uninstall'">插件支持热卸载且不涉及其他依赖变化，将直接在运行中卸载生效；卸载失败会恢复原插件。若发现无法热卸载，则改为等待重启。</p>
                <p v-else>插件与依赖均为纯 Python 且不改动已加载的包，将直接在运行中生效；加载失败会回滚依赖层并恢复原插件。若构建后发现原生扩展或不可热加载的代码，则改为等待重启。</p>
              </el-alert>
              <el-alert v-else title="需要重启生效" type="info" :closable="false" show-icon>
                <p>依赖层将先准备好，由你点击重启并通过启动验证后生效。新装插件若因缺少配置等原因无法加载，会保留安装并跳过该插件，结束时提示原因。</p>
              </el-alert>

              <div class="confirmations">
                <p>点击下方按钮即确认以上插件代码、依赖和构建范围。</p>
                <p>已安装的 ORM 包（nonebot-plugin-orm、SQLAlchemy、Alembic）版本保持不变；插件需要的新 ORM 包会随依赖安装。</p>
              </div>
            </template>
          </template>
        </template>
      </div>
      <div v-if="analysis && analysis.status === 'ready'" class="drawer-actions">
        <el-button @click="analysisVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canApply" :loading="applying" @click="applyAnalysis">
          {{ applyButtonLabel }}
        </el-button>
      </div>
    </el-drawer>

    <el-drawer :visible.sync="detailVisible" :title="detail ? detail.name : '插件详情'" :size="drawerSize" append-to-body>
      <div v-loading="detailLoading" class="detail-drawer">
        <template v-if="detail">
          <div class="detail-module">{{ detail.project_link }} · {{ detail.module_name }}</div>
          <h3>简介</h3><p>{{ detail.description || detail.pypi.summary || "暂无简介" }}</p>
          <h3>兼容信息</h3>
          <p>Python {{ detail.pypi.requires_python || "未限定" }} · Registry 版本 {{ detail.version }}</p>
          <h3>适配器</h3><p>{{ adapterLabel(detail) }}</p>
          <h3>配置说明</h3><p>NoneBot 插件不使用真寻 Schema 配置；插件所需环境项请按官方文档在「系统设置 → 配置中心 → 环境配置」中填写。</p>
          <el-button
            v-if="detail.managed"
            type="danger"
            plain
            icon="el-icon-delete"
            @click="startAnalysis('uninstall', detail)"
          >卸载插件</el-button>
          <p v-else-if="detail.install_state === 'external'" class="muted">该插件由其他安装来源管理，不能从 NoneBot 商店接管卸载。</p>
          <el-button v-if="detail.homepage" type="primary" plain icon="el-icon-link" @click="openHomepage(detail.homepage)">打开官方文档</el-button>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<script>
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from '@/utils/restart-network'
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { apiErrorDetail } from "@/utils/api-error"
import { newOperationId, pluginOperationResult, reasonLabels, rememberPluginOperation } from "@/utils/plugin-operation"


export default {
  name: "NoneBotStore",
  props: { initialSearch: { type: String, default: "" } },
  data() {
    return {
      plugins: [], total: 0, page: 1, pageSize: 30, loading: false, error: "",
      search: this.initialSearch, statusFilter: "all", typeFilter: "all", adapterFilter: "all", includeIncompatible: false, filtersOpen: false,
      enabledAdapters: [],
      registryMeta: {}, searchTimer: null, analysisVisible: false, analysisLoading: false,
      analysis: null, analysisPlugin: null, analysisTimer: null, applying: false,
      transactionAction: "", retrySummary: null, retryingSummary: false,
      detailVisible: false, detailLoading: false, detail: null,
      environment: null, repairing: false, repairVisible: false, repairPreview: null, repairSelected: [], repairError: "",
      pluginLoadInFlight: false, queuedPluginLoad: null, componentDestroyed: false, routeActionConsumed: false,
      readsPaused: false, readEpoch: 0, analysisEpoch: 0, detailEpoch: 0, repairEpoch: 0, repairSubmitting: false, authExpired: false,
    }
  },
  computed: {
    coreSummary() {
      return this.environment?.core_summary || { status: "unconfirmed", checked_count: 0, issues: [] }
    },
    environmentIssues() {
      return this.coreSummary.issues || []
    },
    drawerSize() { return window.innerWidth <= 680 ? "94%" : "600px" },
    /**
     * 统计偏离默认值的筛选项数量
     * @returns {number} 已启用的筛选项数量
     */
    activeFilterCount() { return [this.statusFilter !== "all", this.typeFilter !== "all", this.adapterFilter !== "all", this.includeIncompatible].filter(Boolean).length },
    analysisStatusLabel() {
      const labels = { queued: "等待分析", analyzing: "分析中", ready: "可应用", blocked: "已阻止", failed: "分析失败" }
      return labels[this.analysis?.status] || "准备中"
    },
    analysisStatusType() { return this.analysis?.status === "ready" ? "success" : ["blocked", "failed"].includes(this.analysis?.status) ? "danger" : "info" },
    environmentTone() { return this.coreSummary.status === "incompatible" ? "danger" : this.coreSummary.status === "healthy" ? "info" : "warning" },
    environmentIcon() { return this.environmentTone === "danger" ? "el-icon-warning-outline" : this.environmentTone === "warning" ? "el-icon-info" : "el-icon-circle-check" },
    environmentTitle() {
      const labels = { healthy: "真寻核心依赖检查通过", incompatible: "真寻核心依赖存在问题", unconfirmed: "核心依赖状态未确认" }
      return labels[this.coreSummary.status] || labels.unconfirmed
    },
    environmentDescription() {
      if (this.coreSummary.status === "healthy") return `已核对 ${this.coreSummary.checked_count || 0} 个真寻核心依赖；安装插件时会进一步检查整体兼容性。`
      if (this.coreSummary.status === "incompatible") return "请展开核心依赖详情核对版本和来源；此检查不会自动修改环境。"
      return "尚未确认核心依赖的版本或来源，请查看详情或重新加载。此状态不代表检查通过。"
    },
    sharedChanges() { return this.analysis?.plan?.shared_changes || [] },
    compatibilityOverrides() { return this.analysis?.plan?.compatibility_overrides || [] },
    allChanges() {
      const changes = this.analysis?.plan?.package_changes
      if (!changes) return []
      const shared = new Set(this.sharedChanges.map((item) => item.name))
      return [
        ...(changes.added || []).map((item) => ({ ...item, kind: "added" })),
        ...(changes.changed || []).map((item) => ({ ...item, kind: "changed" })),
        ...(changes.removed || []).map((item) => ({ ...item, kind: "removed" })),
      ].filter((item) => !shared.has(item.name))
    },
    canApply() {
      return this.analysis?.status === 'ready' && !this.applying && !this.readsPaused && !this.authExpired
    },
    applyButtonLabel() {
      return { install: "安装插件", update: "更新插件", uninstall: "卸载插件" }[this.analysis?.action] || "应用"
    },
  },
  watch: {
    analysisVisible(value) { if (!value) { this.analysisEpoch++; clearTimeout(this.analysisTimer); this.analysisLoading = false } },
    detailVisible(value) { if (!value) { this.detailEpoch++; this.detailLoading = false } },
    repairVisible(value) { if (!value && !this.repairSubmitting) { this.repairEpoch++; this.repairing = false } },
    search() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page = 1; this.loadPlugins(false) }, 350) },
    statusFilter() { this.page = 1; this.loadPlugins(false) },
    typeFilter() { this.page = 1; this.loadPlugins(false) },
    adapterFilter() { this.page = 1; this.loadPlugins(false) },
    includeIncompatible() { this.page = 1; this.loadPlugins(false) },
  },
  mounted() {
    this.readControllers = new Set()
    this.onVisibility = () => { if (document.hidden) this.pauseReads(); else this.resumeReads() }
    this.onExpired = () => { this.authExpired = true; this.pauseReads(); this.error = '登录已过期；已提交操作继续执行，请重新登录后查看。' }
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('zhenxun-auth-expired', this.onExpired)
    this.unsubscribeNetwork = onBusinessNetworkChange(value => { if (value) this.pauseReads(); else this.resumeReads() })
    this.resumeReads()
  },
  beforeDestroy() { this.componentDestroyed = true; this.pauseReads(); this.unsubscribeNetwork?.(); document.removeEventListener('visibilitychange', this.onVisibility); window.removeEventListener('zhenxun-auth-expired', this.onExpired) },
  methods: {
    async cancelPreparedRepair() {
      if (this.repairing || this.readsPaused || this.authExpired) return
      const epoch = this.readEpoch
      this.repairing = true
      try {
        const response = await this.deleteRequest(`${this.$root.prefix}/store/transactions/pending/${encodeURIComponent(this.environment.sync.operation_id)}`, {})
        if (epoch !== this.readEpoch) return
        if (!response.suc) throw response
        await this.loadEnvironment()
      } catch (error) { if (epoch === this.readEpoch) this.$message.error(this.diagnostic(error)) }
      finally { this.repairing = false }
    },
    pauseReads() {
      // 记录暂停时是否有未完成的读取，恢复时据此决定是否需要重新加载
      if (!this.readsPaused) this.pausedAt = Date.now()
      this.readsInterrupted = this.readsInterrupted || Boolean(this.readControllers?.size || this.pluginLoadInFlight || this.queuedPluginLoad || this.searchTimer)
      this.readsPaused = true; this.readEpoch++; this.analysisEpoch++; this.detailEpoch++; this.repairEpoch++
      if (!this.repairSubmitting) this.repairing = false
      this.queuedPluginLoad = null; clearTimeout(this.searchTimer); this.searchTimer = null; clearTimeout(this.analysisTimer)
      for (const controller of this.readControllers || []) controller.abort()
      this.readControllers?.clear(); this.loading = false; this.pluginLoadInFlight = false; this.analysisLoading = false; this.detailLoading = false
    },
    resumeReads() {
      if (this.componentDestroyed || this.authExpired || document.hidden || isBusinessNetworkFrozen()) return
      const stale = !this.pluginsLoaded || this.readsInterrupted || Date.now() - (this.pausedAt || 0) > 5 * 60 * 1000
      this.readsPaused = false; this.readsInterrupted = false
      if (stale) { this.loadEnvironment(); this.loadPlugins(false, this.pluginsLoaded) }
      if (this.analysisVisible && this.analysis?.analysis_id) this.pollAnalysis(this.analysis.analysis_id)
      else this.restoreAnalysis()
    },
    async storeRead(path, params = {}) {
      const controller = new AbortController(); this.readControllers.add(controller)
      try { return await this.getRequest(path, params, { signal: controller.signal, suppressErrorToast: true }) }
      finally { this.readControllers.delete(controller) }
    },
    diagnostic(error) {
      const body = error?.response?.data || error || {}
      const detail = body.detail || body.details
      const code = typeof detail === 'string' ? detail : detail?.code || body.info || body.message || 'dependency_request_failed'
      return [reasonLabels[code] || code, detail?.stage ? `阶段：${detail.stage}` : '', detail?.diagnostic || detail?.message, code !== reasonLabels[code] && reasonLabels[code] ? `错误码：${code}` : ''].filter(Boolean).join('\n')
    },
    coreIssueDescription(item) {
      const labels = {
        interpreter_mismatch: "当前解释器不是项目 .venv，尚未确认目标环境。",
        project_lock_stale: "项目声明与锁文件的一致性尚未确认。",
        core_scope_unavailable: "未取得核心依赖清单。",
        source_unverified: "依赖来源无法确认。",
        duplicate_metadata: "发现多份发行包元数据，实际来源需要核对。",
        loaded_source_mismatch: "已加载模块与目标依赖来源不同，尚未确认生效状态。",
        environment_check_failed: "核心依赖检测未完成，请重新加载后检查。",
      }
      if (item.kind === "layer_mismatch") return `活动依赖层与记录不一致；记录 ${item.recorded || "无"}，实际 ${item.actual || "缺失"}。`
      if (labels[item.kind]) return labels[item.kind]
      if (item.kind === "requires_python") return `${item.owner} 要求 ${item.requirement}，当前 Python 不满足此要求。`
      const layer = item.layer === "active_generation" ? "活动依赖层" : item.layer === "base" ? "基础环境" : "来源未确认"
      return `${item.owner || "真寻"} 要求 ${item.requirement || item.expected}；实际 ${item.actual || "缺失"}（${layer}）`
    },
    dependencySource(name) {
      const source = this.analysis?.plan?.change_sources?.[name]
      if (source?.kind === "requested_plugin") return "本次选择的插件"
      if (source?.kind === "candidate_dependency") return `依赖来源：${source.required_by}`
      if (source?.kind === "pending_transaction") return "已有待应用事务"
      if (source?.kind === "linked_change") return "连带变化：满足其他依赖的版本要求"
      return this.analysis?.action === "uninstall" ? "本次卸载" : "依赖变更"
    },
    formatTime(value) { try { return new Date(value).toLocaleString("zh-CN", { hour12: false }) } catch (_) { return value } },
    typeLabel(type) { return type === "library" ? "库插件" : "应用插件" },
    adapterName(adapter) {
      const labels = { "nonebot.adapters.onebot.v11": "OneBot V11", "nonebot.adapters.qq": "QQ 官方", "nonebot.adapters.telegram": "Telegram" }
      return labels[adapter] || adapter.split(".").slice(-2).join(".")
    },
    adapterLabel(plugin) {
      const adapters = plugin.supported_adapters
      if (!Array.isArray(adapters) || !adapters.length) return "通用/未限定"
      return adapters.map(this.adapterName).join("、")
    },
    stateTag(plugin) {
      if (plugin.apply_mode === "restart_pending") return { label: "等待重启", type: "warning" }
      if (plugin.load_failed) return { label: "未加载", type: "danger" }
      const states = {
        not_installed: { label: "未安装", type: "info" }, managed: { label: "已安装", type: "success" },
        update_available: { label: "可更新", type: "warning" }, external: { label: "外部安装", type: "info" },
        blocked: { label: "不可安装", type: "danger" }, failed: { label: "失败", type: "danger" },
      }
      return states[plugin.install_state] || { label: plugin.install_state, type: "info" }
    },
    reasonLabel(reason) { return reasonLabels[reason?.code] || reason?.message || reason?.code || "当前环境不兼容" },
    warningTag(warning) { return { registry_plugin_invalid: "未通过官方测试", registry_plugin_untested: "官方未测试", adapter_incompatible: "适配器不匹配" }[warning?.code] || "提示" },
    reasonDetail(reason) { const label = reasonLabels[reason?.code]; return label && reason?.message && reason.message !== label ? reason.message : "" },
    driftDescription(item) {
      if (item.requirement) return `${item.owner || '真寻'} 要求 ${item.requirement} · 实际 ${item.actual || '未安装'} · ${item.layer === 'active_generation' ? '活动依赖层' : '基础环境'}`
      if (Object.prototype.hasOwnProperty.call(item, 'recorded')) return `记录 ${item.recorded || '无'} · 实际 ${item.actual || '未安装'} · 代际 ${item.generation ?? '无'}`
      if (item.kind === "constraint_conflict") return `插件要求 ${item.expected || item.requirement || "-"} · 当前 ${item.actual || "未安装"}`
      const relation = { missing: "缺失", older: "版本偏低", newer: "版本偏高", version_mismatch: "版本不一致" }[item.kind] || "不一致"
      return `${relation} · 期望 ${item.expected || item.from || "-"} · 实际 ${item.actual || item.to || "未安装"}`
    },
    async loadEnvironment() {
      if (this.readsPaused) return
      const epoch = this.readEpoch
      try {
        const response = await this.storeRead(`${this.$root.prefix}/store/nonebot/environment`)
        if (epoch === this.readEpoch && response?.suc) this.environment = response.data
      } catch (_) { if (epoch === this.readEpoch) this.environment = { status: "failed", repairable: false } }
    },
    async loadPlugins(refresh = false, silent = false) {
      if (this.readsPaused || this.componentDestroyed) return
      const epoch = this.readEpoch
      const previous = this.queuedPluginLoad
      this.queuedPluginLoad = {
        params: {
          search: this.search, page: this.page, page_size: this.pageSize, status: this.statusFilter,
          plugin_type: this.typeFilter, adapter: this.adapterFilter,
          include_incompatible: this.includeIncompatible || this.statusFilter === 'blocked',
        },
        refresh: Boolean(refresh || previous?.refresh),
      }
      if (this.pluginLoadInFlight) return
      this.pluginLoadInFlight = true
      this.loading = !silent; this.error = ""
      try {
        while (this.queuedPluginLoad && !this.componentDestroyed) {
          const request = this.queuedPluginLoad
          this.queuedPluginLoad = null
          try {
            const response = await this.storeRead(`${this.$root.prefix}/store/nonebot/plugins`, {
              ...request.params,
              refresh: request.refresh,
            })
            if (this.componentDestroyed || epoch !== this.readEpoch) return
            if (this.queuedPluginLoad) continue
            if (!response.suc) throw new Error(response.info || "NoneBot Registry 加载失败")
            this.plugins = response.data.items || []; this.total = Number(response.data.total || 0); this.registryMeta = response.data.registry || {}
            this.enabledAdapters = response.data.enabled_adapters || []
            this.pluginsLoaded = true
            this.consumeRouteAction()
          } catch (error) {
            if (this.componentDestroyed || epoch !== this.readEpoch) return
            if (this.queuedPluginLoad) continue
            this.plugins = []; this.total = 0; this.error = error.response?.data?.detail || error.message || "NoneBot Registry 暂时不可用。"
          }
        }
      } finally {
        if (epoch === this.readEpoch) { this.pluginLoadInFlight = false; if (!this.componentDestroyed) this.loading = false }
      }
    },
    consumeRouteAction() {
      if (this.routeActionConsumed || this.$route.query.action !== "uninstall") return
      const target = String(this.$route.query.search || "").trim().toLowerCase()
      const plugin = this.plugins.find((item) => String(item.project_link || "").toLowerCase() === target || String(item.module_name || item.module || "").toLowerCase() === target)
      if (!plugin) return
      this.routeActionConsumed = true
      if (plugin.install_state === "external") {
        this.$message.warning("该插件由其他安装来源管理，请在对应来源中卸载。")
        return
      }
      this.startAnalysis("uninstall", plugin)
    },
    async openDetail(plugin) {
      if (this.readsPaused) return
      const epoch = ++this.detailEpoch
      this.detail = null; this.detailVisible = true; this.detailLoading = true
      try {
        const response = await this.storeRead(`${this.$root.prefix}/store/nonebot/plugins/${encodeURIComponent(plugin.project_link)}`)
        if (epoch !== this.detailEpoch) return
        if (!response.suc) throw new Error(response.info || "详情加载失败")
        this.detail = response.data
      } catch (error) { if (epoch === this.detailEpoch) { this.$message.error(this.diagnostic(error)); this.detailVisible = false } }
      finally { if (epoch === this.detailEpoch) this.detailLoading = false }
    },
    openHomepage(url) { window.open(url, "_blank", "noopener,noreferrer") },
    async startAnalysis(action, plugin, preferExisting = true, allowSourceBuild = false) {
      if (this.readsPaused || this.componentDestroyed) return
      const epoch = ++this.analysisEpoch
      if (this.$store.state.pluginOperation.active) { this.$message.warning("已有插件操作正在进行，请等待完成。"); return }
      this.analysisPlugin = plugin; this.analysis = null; this.analysisLoading = true; this.analysisVisible = true
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/analyze`, { project_link: plugin.project_link, action, prefer_existing: preferExisting, allow_source_build: allowSourceBuild })
        if (epoch !== this.analysisEpoch) return
        if (!response.suc) throw new Error(response.info || "依赖分析无法启动")
        this.analysis = response.data
        sessionStorage.setItem("zhenxun_nonebot_analysis", JSON.stringify({ analysisId: response.data.analysis_id, plugin, action }))
        this.pollAnalysis(response.data.analysis_id)
      } catch (error) { if (epoch === this.analysisEpoch) { this.analysisLoading = false; this.analysis = { status: "failed", blocked_reasons: [{ code: "analysis_failed", message: error.message }] } } }
    },
    async pollAnalysis(id) {
      clearTimeout(this.analysisTimer)
      if (this.readsPaused || this.componentDestroyed) return
      const epoch = this.analysisEpoch
      try {
        const response = await this.storeRead(`${this.$root.prefix}/store/nonebot/analyses/${id}`)
        if (epoch !== this.analysisEpoch) return
        if (!response.suc) {
          if (response.info === "analysis_not_found") {
            sessionStorage.removeItem("zhenxun_nonebot_analysis")
            throw new Error('分析已过期，请重新点击分析；不会自动重新提交。')
          }
          throw new Error(response.info || "依赖分析失败")
        }
        this.analysis = response.data
        if (response.data.environment) this.environment = response.data.environment
        if (["queued", "analyzing"].includes(response.data.status)) {
          this.analysisTimer = setTimeout(() => this.pollAnalysis(id), 700)
        } else {
          this.analysisLoading = false
          if (this.retrySummary) {
            const unchanged = response.data.status === 'ready' && response.data.plan?.summary_revision === this.retrySummary
            this.retrySummary = null
            if (unchanged) { await this.applyAnalysis(); return }
            this.retryingSummary = false; this.$message.info('环境已变化，摘要已更新；请核对差异后确认。')
          }
        }
      } catch (error) { if (epoch === this.analysisEpoch) { this.analysisLoading = false; this.analysis = { status: "failed", blocked_reasons: [{ code: "analysis_failed", message: error.message }] } } }
    },
    restoreAnalysis() {
      try {
        const saved = JSON.parse(sessionStorage.getItem("zhenxun_nonebot_analysis") || "null")
        if (!saved?.analysisId || !saved?.plugin) return
        this.analysisPlugin = saved.plugin; this.analysisVisible = true; this.analysisLoading = true
        this.pollAnalysis(saved.analysisId)
      } catch (_) { sessionStorage.removeItem("zhenxun_nonebot_analysis") }
    },
    closeAnalysis(done) {
      if (this.applying) return
      this.analysisEpoch++
      clearTimeout(this.analysisTimer); sessionStorage.removeItem("zhenxun_nonebot_analysis")
      if (typeof done === "function") done()
    },
    async repairEnvironment() {
      const environment = this.analysis?.environment || this.environment
      if (!environment?.repairable || this.repairing || this.readsPaused) return
      const epoch = ++this.repairEpoch
      const controller = new AbortController(); this.readControllers.add(controller)
      this.repairing = true; this.repairVisible = true; this.repairPreview = null; this.repairSelected = []; this.repairError = ""
      try {
        const inspected = await this.postRequest(`${this.$root.prefix}/store/nonebot/environment/repair/preview`, {}, { signal: controller.signal, suppressErrorToast: true })
        if (epoch !== this.repairEpoch) return
        if (!inspected.suc) throw inspected
        this.repairPreview = inspected.data
        this.repairSelected = (inspected.data.groups || []).filter(group => group.status === "repairable").map(group => group.id)
      } catch (error) { if (epoch === this.repairEpoch) this.repairError = this.diagnostic(error) }
      finally { this.readControllers.delete(controller); if (epoch === this.repairEpoch) this.repairing = false }
    },
    async applyEnvironmentRepair() {
      if (this.readsPaused || this.repairing || !this.repairPreview || (!this.repairSelected.length && this.repairPreview.mode !== 'base')) return
      this.repairing = true; this.repairSubmitting = true; this.repairError = ""
      const operationId = newOperationId()
      rememberPluginOperation(operationId, "repair", "依赖环境", "nonebot")
      this.$store.commit("START_PLUGIN_OPERATION", { action: "repair", pluginName: "依赖环境", title: "正在准备依赖修复", message: "正在构建候选层，重启验证后生效。" })
      try {
        const preview = this.repairPreview
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/environment/repair`, { operation_id: operationId, expected_fingerprint: preview.fingerprint, preview_id: preview.preview_id, group_ids: this.repairSelected, confirmed: true })
        if (this.componentDestroyed || this.authExpired) return
        if (!response.suc) throw response
        this.repairVisible = false
        this.$store.commit("FINISH_PLUGIN_OPERATION", pluginOperationResult({ result: response.data, status: response.data.status }, true))
        this.$message.success(response.info); notifyRestartStatusChanged()
      } catch (error) {
        if (!this.componentDestroyed && !this.authExpired) {
          this.repairError = this.diagnostic(error)
          this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "error", title: "修复结果待查询", message: this.repairError, applyMode: "unknown" })
        }
      }
      finally { this.repairing = false; this.repairSubmitting = false }
    },
    async cancelPending(plugin) {
      const actionKey = plugin.store_key || plugin.id
      if (this.transactionAction || this.applying || this.readsPaused || this.authExpired) return
      this.transactionAction = actionKey
      const confirmed = await this.$confirmAction({ title: "取消待重启事务", message: `将撤销 ${plugin.name} 的待应用变更并恢复当前运行版本；同一事务中排在它之后的操作也会一并撤销。`, confirmButtonText: "撤销事务", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) { this.transactionAction = ""; return }
      try {
        const endpoint = plugin.pending_operation_id
          ? `${this.$root.prefix}/store/transactions/pending/${encodeURIComponent(plugin.pending_operation_id)}`
          : `${this.$root.prefix}/store/nonebot/transactions/cancel`
        const response = plugin.pending_operation_id
          ? await this.deleteRequest(endpoint)
          : await this.postRequest(endpoint, {})
        if (!response.suc) throw response
        this.$message.success(response.info || "待重启插件事务已撤销")
        notifyRestartStatusChanged(); await this.loadPlugins(false)
      } catch (error) { this.$message.error(this.diagnostic(error)) }
      finally { this.transactionAction = "" }
    },
    async clearFailed(plugin) {
      const actionKey = plugin.store_key || plugin.id
      if (this.transactionAction || this.applying || this.readsPaused || this.authExpired) return
      this.transactionAction = actionKey
      const confirmed = await this.$confirmAction({ title: "清除失败记录", message: `${plugin.name} 本次操作未完成。将清除整个待处理事务中的全部操作记录（包括同一事务中的其他插件或依赖操作），清除后可以重新分析或安装。`, confirmButtonText: "清除记录", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) { this.transactionAction = ""; return }
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/transactions/cancel`, {})
        if (!response.suc) throw response
        this.$message.success(response.info || "插件失败记录已清除")
        notifyRestartStatusChanged(); await this.loadPlugins(false)
      } catch (error) { this.$message.error(this.diagnostic(error)) }
      finally { this.transactionAction = "" }
    },
    async applyAnalysis() {
      if (!this.canApply) return
      this.applying = true
      const action = this.analysis.action
      const labels = { install: "安装", update: "更新", uninstall: "卸载" }
      const operationId = newOperationId()
      rememberPluginOperation(operationId, action, this.analysisPlugin.name, "nonebot")
      this.$store.commit("START_PLUGIN_OPERATION", { action, pluginName: this.analysisPlugin.name, title: `正在${labels[action]} NoneBot 插件`, message: "正在构建隔离依赖层并验证运行时边界。" })
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/apply`, {
          analysis_id: this.analysis.analysis_id, operation_id: operationId,
          confirmed: true, summary_revision: this.analysis.plan.summary_revision,
        })
        if (this.componentDestroyed || this.authExpired) return
        if (!response.suc) {
          if (['analysis_stale', 'analysis_not_found'].includes(response.info) && !this.retryingSummary) {
            this.retrySummary = this.analysis.plan.summary_revision; this.retryingSummary = true; this.applying = false
            this.$store.commit('CLEAR_PLUGIN_OPERATION'); sessionStorage.removeItem('zhenxun_plugin_operation')
            await this.startAnalysis(action, this.analysisPlugin, this.analysis.prefer_existing !== false, Boolean(this.analysis.allow_source_build)); return
          }
          throw new Error(this.diagnostic(response))
        }
        this.$store.commit("FINISH_PLUGIN_OPERATION", pluginOperationResult({ result: response.data, status: response.data.status }))
        this.retryingSummary = false
        notifyRestartStatusChanged(); sessionStorage.removeItem("zhenxun_nonebot_analysis"); this.analysisVisible = false; await this.loadPlugins(false)
      } catch (error) {
        if (this.componentDestroyed || this.authExpired) return
        this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "error", title: `插件${labels[action]}失败`, message: apiErrorDetail(error, "操作失败") })
      } finally { this.applying = false }
    },
  },
}
</script>

<style scoped>
.console-command { white-space: pre-wrap; overflow-wrap: anywhere; }
.nonebot-store { min-height: 100%; padding: 22px; color: var(--text-color); background: var(--bg-color); }
.store-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.store-header h1 { margin: 0; font-size: 24px; }.store-header p { margin: 5px 0 0; color: var(--text-color-secondary); }
.store-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 150px 140px 150px auto; align-items: center; gap: 10px; }
.catalog-note { display: flex; align-items: center; gap: 7px; min-height: 34px; color: var(--text-color-secondary); font-size: 12px; }
.environment-status { display: flex; align-items: flex-start; gap: 12px; margin: 12px 0; padding: 13px 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color-secondary); }.environment-status > i { margin-top: 2px; color: var(--success-color); font-size: 21px; }.environment-status > div { min-width: 0; flex: 1; }.environment-status strong { display: block; color: var(--text-color); }.environment-status p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }.environment-status.is-warning { border-color: rgba(230,162,60,.45); }.environment-status.is-warning > i { color: var(--warning-color); }.environment-status.is-danger { border-color: rgba(245,108,108,.45); }.environment-status.is-danger > i { color: var(--danger-color); }
.plugin-list { min-height: 320px; border-top: 1px solid var(--border-color); }
.plugin-row { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(0, 2fr); gap: 18px; padding: 17px 4px; border-bottom: 1px solid var(--border-color); }
.plugin-row.is-skeleton .plugin-main, .skeleton-body { display: flex; flex-direction: column; gap: 10px; }.skeleton-title { width: 55%; height: 18px; }.skeleton-module { width: 75%; }.skeleton-body .zx-skeleton { width: 90%; }.skeleton-body .zx-skeleton.is-short { width: 55%; }
.plugin-main { min-width: 0; }.plugin-title-line { display: flex; min-width: 0; align-items: center; gap: 7px; }.plugin-title-line h2 { margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.module-line { margin-top: 4px; color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.plugin-main > p { margin: 9px 0; color: var(--text-color-secondary); line-height: 1.55; }.meta-line { display: flex; flex-wrap: wrap; gap: 14px; color: var(--text-color-secondary); font-size: 12px; }.meta-line i { margin-right: 4px; }
.blocked-reason { margin-top: 8px; color: var(--danger-color); font-size: 12px; }.plugin-actions, .pending-actions { display: flex; align-items: center; gap: 8px; }
.inline-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 100px; color: var(--text-color-secondary); }.inline-state.is-error { margin: 12px 0; border: 1px solid var(--el-color-danger-light-7); border-radius: 6px; color: var(--danger-color); }.empty-state { min-height: 300px; flex-direction: column; }.empty-state h2, .empty-state p { margin: 0; }.empty-state i { font-size: 34px; }
.store-pagination { margin-top: 20px; text-align: center; }.analysis-drawer, .detail-drawer { padding: 0 24px 90px; color: var(--text-color); }.analysis-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--border-color); }.analysis-heading h2 { margin: 0 0 4px; font-size: 20px; }.analysis-heading span, .detail-module { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.analysis-loading { display: flex; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-color-secondary); }.analysis-loading i { color: var(--primary-color); font-size: 34px; }.analysis-loading strong { color: var(--text-color); }
.analysis-section { margin: 18px 0; }.analysis-section h3 { margin: 0 0 10px; font-size: 14px; }.analysis-section p { margin: 3px 0; color: var(--text-color-secondary); line-height: 1.55; }.core-ok { display: flex; gap: 10px; padding: 13px; border: 1px solid var(--success-color); border-radius: 6px; }.core-ok > i { color: var(--success-color); font-size: 22px; }.core-ok h3 { margin: 0; }
.reason-item { display: flex; flex-direction: column; gap: 5px; margin: 7px 0; overflow-wrap: anywhere; }.reason-item > code { width: fit-content; }.reason-item > span { line-height: 1.5; }.drift-list { margin-top: 5px; padding: 0 10px; border: 1px solid rgba(245,108,108,.22); border-radius: 5px; }.shared-changes { padding: 12px; border: 1px solid rgba(230,162,60,.4); border-radius: 6px; }
.dependency-change { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(0, 2fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-color); }.dependency-change code { overflow-wrap: break-word; word-break: normal; } .dependency-change span { min-width: 0; overflow-wrap: anywhere; }.dependency-change span { color: var(--text-color-secondary); }.dependency-note, .muted { color: var(--text-color-secondary); font-size: 12px; }.confirmations { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
.reason-item { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; overflow-wrap: anywhere; }.drawer-actions { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--border-color); background: var(--bg-color); }.detail-drawer h3 { margin: 20px 0 7px; font-size: 14px; }.detail-drawer p { color: var(--text-color-secondary); line-height: 1.65; }
@media (max-width: 900px) { .store-toolbar { grid-template-columns: 1fr 1fr; }.plugin-row { grid-template-columns: 1fr; }.plugin-actions { justify-content: flex-end; } }
.store-filters { display: contents; }.filter-toggle { display: none; }
.filter-count { display: inline-block; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 9px; color: #fff; background: var(--primary-color); font-size: 11px; line-height: 18px; text-align: center; box-sizing: border-box; }
@media (max-width: 767px) {
  .store-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .filter-toggle { display: inline-block; margin-left: 0; }
  .filter-toggle.is-open { border-color: var(--primary-color); color: var(--primary-color); }
  .store-filters { display: none; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 10px; }
  .store-filters.is-open { display: grid; }
  .store-filters .incompatible-toggle { grid-column: 1 / -1; }
}
@media (max-width: 680px) { .nonebot-store { padding: 14px; }.store-header { align-items: flex-start; }.store-header h1 { font-size: 20px; }.environment-status { flex-wrap: wrap; }.environment-status .el-button { width: 100%; }.plugin-title-line { flex-wrap: wrap; }.plugin-actions, .pending-actions { flex-wrap: wrap; justify-content: flex-start; }.dependency-change { grid-template-columns: 1fr; gap: 3px; }.analysis-drawer, .detail-drawer { padding-right: 16px; padding-left: 16px; } }
.environment-details { margin: 12px 0 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; }
.environment-details summary, .repair-group summary { cursor: pointer; }
.repair-group { padding: 16px 0; border-bottom: 1px solid var(--border-color); }
.repair-group .el-checkbox { max-width: 100%; white-space: normal; margin-bottom: 10px; }
.repair-group pre, .repair-error { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; }
.verification-status { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
</style>
