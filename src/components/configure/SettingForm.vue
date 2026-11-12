<template>
  <main class="setup-shell">
    <section class="setup-workspace" v-loading="initializing">
      <header class="setup-header">
        <div class="brand-block">
          <img :src="logoUrl" alt="真寻" class="brand-logo" />
          <div>
            <p class="brand-kicker">ZHENXUN BOT</p>
            <h1>首次配置</h1>
            <p>完成真寻运行所需的基础设置</p>
          </div>
        </div>
        <div class="setup-header-actions">
          <span class="state-badge">{{ stateLabel }}</span>
        </div>
      </header>

      <div v-if="!claimed && serverState === 'restart_pending'" class="pending-layout">
        <i class="el-icon-refresh pending-icon" />
        <span class="section-number">配置已保存</span>
        <h2>真寻正在等待重启</h2>
        <p>当前浏览器没有可用的重启票据。可手动重启进程，然后重新检查服务状态。</p>
        <el-button type="primary" @click="loadStatus()">重新检查</el-button>
      </div>

      <div v-else-if="!claimed" class="claim-layout">
        <div class="claim-copy">
          <span class="section-number">需要控制台授权</span>
          <h2>从本次启动的控制台打开连接链接</h2>
          <p>
            连接链接会自动完成安全验证并返回这里。链接仅在当前真寻进程运行期间有效，请勿分享。
          </p>
        </div>
        <div class="claim-form">
          <i class="el-icon-link access-icon" />
          <p class="inline-result" :class="{ error: accessError }">
            <i :class="accessError ? 'el-icon-circle-close' : 'el-icon-info'" />
            {{ accessError || "等待控制台连接授权。" }}
          </p>
          <el-button
            type="primary"
            class="primary-action"
            @click="loadStatus()"
          >
            重新检查状态
          </el-button>
        </div>
      </div>

      <div v-else-if="!mode" class="mode-layout">
        <div class="step-intro">
          <span class="section-number">开始配置</span>
          <h2>选择部署方式</h2>
          <p>从备份恢复数据库；配置、插件代码及资源可按需选择。</p>
        </div>
        <div class="choice-grid mode-choices">
          <button type="button" class="choice-item" @click="mode = 'fresh'">
            <strong>全新配置</strong>
            <span>设置管理员、数据库、缓存与监听地址</span>
          </button>
          <button type="button" class="choice-item" @click="openRestore">
            <strong>从备份恢复</strong>
            <span>上传其他真寻导出的备份包，迁移到本机</span>
          </button>
        </div>
      </div>

      <template v-else-if="mode === 'restore'">
        <div class="step-body">
          <section class="step-section">
            <section v-if="restoreTask.state && restoreTask.state !== 'idle'" class="restore-progress" :class="{ 'needs-attention': restoreNeedsAttention }" aria-label="恢复任务进度">
              <div role="status" aria-live="polite" aria-atomic="true">
                <h2>{{ restoreProgressTitle }}</h2>
                <p class="restore-progress-step">当前阶段：{{ restoreProgressStep }}</p>
                <p>{{ restoreTaskMessage }}</p>
              </div>
              <template v-if="restoreTask.state === 'preparing' && restoreTask.preparation">
                <pre v-if="restoreTask.preparation.confirmation_required" class="restore-preparation-changes">{{ JSON.stringify({ 版本调整: (restoreTask.preparation.changes || {}).nearby, 跳过插件: (restoreTask.preparation.changes || {}).skipped_plugins }, null, 2) }}</pre>
                <div class="restore-progress-actions">
                  <el-button v-if="restoreTask.preparation.retryable" :loading="retryingRestore" :disabled="retryingRestore || restoreTask.cancel_requested" @click="retryPreparation">{{ restoreTask.preparation.confirmation_required ? '确认变更并继续' : '重试原任务' }}</el-button>
                  <el-button :loading="retryingRestore" :disabled="retryingRestore || (restoreTask.cancel_requested && restoreTask.preparation.phase !== 'cleanup_pending')" @click="cancelPreparation">{{ restoreTask.preparation.phase === 'cleanup_pending' ? '重试候选清理' : '取消本次恢复' }}</el-button>
                </div>
              </template>
            </section>
            <div class="step-intro">
              <span class="section-number">从备份恢复</span>
              <h2>上传备份包</h2>
              <p>选择数据库恢复方式，并设置目标端管理员；备份配置和文件均为可选。</p>
              <p v-if="restoreParametersLocked" class="restore-lock-hint">本次恢复参数已锁定，任务结束后可重新设置。</p>
            </div>
            <el-alert v-if="lastRestoreError" :title="`上次恢复未完成，已回到首次配置：${lastRestoreError}`" type="error" :closable="false" show-icon class="last-restore" />
            <div class="restore-upload">
              <input ref="backupFile" type="file" accept=".zx" hidden :disabled="restoreParametersLocked" @change="uploadBackup" />
              <el-button :loading="uploading !== null" :disabled="restoreParametersLocked" @click="$refs.backupFile.click()">
                <i class="el-icon-upload2" /> {{ uploading !== null ? `上传中 ${uploading}%` : backupName ? "重新选择" : "选择备份包" }}
              </el-button>
              <code v-if="backupName">{{ backupName }}</code>
            </div>
            <template v-if="backupName && !backupSummary">
              <el-form label-position="top" class="restore-password" :disabled="restoreParametersLocked" @submit.native.prevent="inspectBackup">
                <el-form-item label="备份密码（未加密可留空）">
                  <el-input v-model="backupPassword" type="password" show-password autocomplete="off" />
                </el-form-item>
              </el-form>
              <el-button :loading="inspecting" :disabled="restoreParametersLocked" @click="inspectBackup">读取备份</el-button>
            </template>
            <p v-if="restoreError" class="inline-result error">
              <i class="el-icon-circle-close" /> {{ restoreError }}
            </p>
            <template v-if="backupSummary">
              <dl class="backup-summary">
                <dt>导出时间</dt><dd>{{ new Date(backupSummary.created_at).toLocaleString() }}</dd>
                <dt>来源版本</dt><dd>{{ backupSummary.bot_version || "未知" }} · Python {{ backupSummary.python }} · {{ backupSummary.platform }}</dd>
                <dt>数据库</dt><dd>{{ backupSummary.database.dialect }} · {{ Object.keys(backupSummary.database.tables).length }} 张表</dd>
                <dt>管理员</dt><dd>{{ account.username || "请设置目标管理员" }}</dd>
                <template v-if="backupSummary.archive_summary"><dt>包体积</dt><dd>压缩 {{ formatBytes(backupSummary.archive_summary.archive_bytes || backupSummary.archive_summary.compressed_bytes) }} / 原始 {{ formatBytes(backupSummary.archive_summary.raw_bytes) }}</dd></template>
              </dl>
              <el-alert v-for="text in backupSummary.warnings" :key="text" :title="text" type="warning" :closable="false" show-icon />
              <details v-if="backupSummary.archive_summary">
                <summary>包体积分类与最大文件</summary>
                <p v-for="(info, key) in backupSummary.archive_summary.categories" :key="key" class="field-hint">{{ categoryLabels[key] || key }}：{{ info.files }} 项，压缩 {{ formatBytes(info.compressed_bytes) }} / 原始 {{ formatBytes(info.raw_bytes) }}</p>
                <p v-for="file in (backupSummary.archive_summary.largest_files || []).slice(0, 10)" :key="file.path" class="field-hint">{{ file.path }} · {{ formatBytes(file.compressed_bytes) }} / {{ formatBytes(file.raw_bytes) }}</p>
              </details>
              <label class="field-label">数据库恢复模式</label>
              <el-radio-group v-model="restoreMode" class="restore-modes" :disabled="restoreParametersLocked">
                <el-radio v-for="option in restoreModes" :key="option.value" :label="option.value">{{ option.label }}</el-radio>
              </el-radio-group>
              <p class="field-hint">{{ restoreModeDescription }}</p>
              <template v-if="restoreMode === 'replace_database'">
                <el-checkbox v-model="backupBeforeReplace" :disabled="restoreParametersLocked">清空前完整备份目标数据库</el-checkbox>
                <p v-if="backupBeforeReplace" class="field-hint">{{ nativeRecoveryHint }}</p>
                <p v-if="!backupBeforeReplace" class="inline-result error">清空后原数据可能无法自动恢复。</p>
              </template>
              <template v-else>
                <label class="field-label">导入的数据表</label>
                <el-select v-model="includedTables" :disabled="restoreParametersLocked" multiple filterable style="width: 100%" placeholder="选择需要导入的数据表">
                  <el-option v-for="name in Object.keys(backupSummary.database.tables)" :key="name" :label="name" :value="name" />
                </el-select>
              </template>
              <template v-if="restoreMode.startsWith('merge_')">
                <label class="field-label">旧包来源绑定（可选）</label>
                <el-input v-model.trim="sourceBinding" :disabled="restoreParametersLocked" maxlength="128" placeholder="同一旧实例的多个备份使用相同来源标识" />
                <p class="field-hint">不同旧包的历史数据可能视为新记录；多包合并请绑定稳定来源。</p>
              </template>
              <label class="field-label">目标端管理员</label>
              <el-form label-position="top" :disabled="restoreParametersLocked">
              <div class="field-grid two-columns">
                <el-form-item label="管理员账号"><el-input v-model.trim="account.username" maxlength="128" autocomplete="username" /></el-form-item>
                <el-form-item label="新密码"><el-input v-model="account.password" type="password" show-password autocomplete="new-password" /></el-form-item>
                <el-form-item label="确认密码"><el-input v-model="account.confirmPassword" type="password" show-password autocomplete="new-password" /></el-form-item>
              </div>
              </el-form>
              <p class="field-hint">密码至少 8 位，包含大小写字母和数字，两次输入一致；恢复不会采用来源实例的 JWT 密钥。</p>
              <label class="field-label">恢复的文件（可选）</label>
              <el-checkbox-group v-model="restoreCategories" class="restore-categories" :disabled="restoreParametersLocked">
                <el-checkbox v-for="key in backupSummary.categories" :key="key" :label="key">{{ categoryLabels[key] || key }}</el-checkbox>
              </el-checkbox-group>
              <p class="field-hint">数据库始终导入；勾选的文件按路径覆盖，不受数据库增量策略保护。</p>
              <el-checkbox v-model="skipFailed" :disabled="restoreParametersLocked">依赖无法安装时跳过对应插件继续恢复</el-checkbox>

              <div class="section-divider" />
              <p class="field-hint restore-database-hint">数据会按所选模式导入这里的数据库；备份中的数据库地址不会沿用。</p>
            <label class="field-label">数据库类型</label>
            <div class="choice-grid database-choices">
              <button
                v-for="option in databaseOptions"
                :key="option.value"
                type="button"
                class="choice-item"
                :class="{ active: database.mode === option.value }"
                :disabled="restoreParametersLocked"
                @click="selectDatabaseMode(option.value)"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
                <em v-if="option.recommended">推荐</em>
              </button>
            </div>

            <el-form label-position="top" class="service-form" :disabled="restoreParametersLocked">
              <DatabaseFields v-model="database" path-hint="路径必须位于真寻项目目录内。" />
            </el-form>
            <div class="probe-actions">
              <el-button
                class="probe-button"
                :loading="probing.database"
                :disabled="restoreParametersLocked"
                @click="probeDatabase"
              >
                <i class="el-icon-connection" /> 测试数据库
              </el-button>
              <probe-result :result="results.database" />
            </div>
            </template>
          </section>
        </div>
        <footer class="setup-actions">
          <el-button :disabled="restoreParametersLocked" @click="mode = null">返回</el-button>
          <span />
          <el-button type="primary" :loading="restoring || retryingRestore || (restoreTaskRunning && !restoreNeedsAttention)" :disabled="!canRestore" @click="startRestore">{{ restoreActionLabel }}</el-button>
        </footer>
      </template>

      <template v-else>
        <el-steps :active="step" finish-status="success" class="desktop-steps">
          <el-step v-for="item in setupSteps" :key="item.key" :title="item.title" />
        </el-steps>
        <div class="mobile-progress">
          <span>步骤 {{ step + 1 }} / {{ setupSteps.length }}</span>
          <strong>{{ currentStep.title }}</strong>
          <el-progress :percentage="Math.round((step + 1) / setupSteps.length * 100)" :show-text="false" />
        </div>

        <div class="step-body">
          <section v-show="currentStep.key === 'basic'" class="step-section">
            <div class="step-intro">
              <span class="section-number">{{ String(step + 1).padStart(2, '0') }}</span>
              <h2>基本信息</h2>
              <p>设置机器人的称呼和超级用户。</p>
            </div>
            <el-form :model="account" label-position="top">
              <label class="field-label">机器人</label>
              <div class="field-grid two-columns">
                <el-form-item label="Bot 名字">
                  <el-input
                    v-model.trim="account.selfNickname"
                    maxlength="32"
                    placeholder="小真寻"
                  />
                  <p class="field-hint">Bot 的自称，AI 聊天时也用这个名字。</p>
                </el-form-item>
                <el-form-item label="其他称呼">
                  <el-input
                    v-model="account.nicknames"
                    placeholder="真寻，绪山真寻"
                  />
                  <p class="field-hint">消息以名字或这些称呼开头时视为在叫 Bot，用逗号分隔。</p>
                </el-form-item>
                <el-form-item label="超级用户 QQ 号">
                  <el-input
                    v-model="account.superusers"
                    placeholder="多个号码用逗号分隔"
                  />
                  <p class="field-hint">填写你自己的 QQ 号，可在聊天中使用管理指令。</p>
                </el-form-item>
              </div>

            </el-form>
          </section>

          <section v-show="currentStep.key === 'account'" class="step-section">
            <div class="step-intro">
              <span class="section-number">{{ String(step + 1).padStart(2, '0') }}</span>
              <h2>WebUI 管理员</h2>
              <p>设置登录 WebUI 的管理员账户和密码。</p>
            </div>
            <el-form ref="accountForm" :model="account" label-position="top">
              <div class="field-grid two-columns">
                <el-form-item label="用户名" required>
                  <el-input
                    v-model.trim="account.username"
                    maxlength="128"
                    autocomplete="username"
                  />
                </el-form-item>
                <span />
                <el-form-item label="管理密码" required>
                  <el-input
                    v-model="account.password"
                    type="password"
                    show-password
                    autocomplete="new-password"
                  />
                </el-form-item>
                <el-form-item label="确认密码" required>
                  <el-input
                    v-model="account.confirmPassword"
                    type="password"
                    show-password
                    autocomplete="new-password"
                  />
                </el-form-item>
              </div>
              <ul class="password-rules">
                <li v-for="rule in passwordRules" :key="rule.label" :class="{ met: rule.met }">
                  <i :class="rule.met ? 'el-icon-circle-check' : 'el-icon-remove-outline'" />
                  {{ rule.label }}
                </li>
              </ul>
            </el-form>
          </section>

          <section v-show="currentStep.key === 'services'" class="step-section">
            <div class="step-intro">
              <span class="section-number">{{ String(step + 1).padStart(2, '0') }}</span>
              <h2>数据库与缓存</h2>
              <p>SQLite 和内存缓存适合大多数单机部署。</p>
            </div>

            <label class="field-label">数据库类型</label>
            <div class="choice-grid database-choices">
              <button
                v-for="option in databaseOptions"
                :key="option.value"
                type="button"
                class="choice-item"
                :class="{ active: database.mode === option.value }"
                @click="selectDatabaseMode(option.value)"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
                <em v-if="option.recommended">推荐</em>
              </button>
            </div>

            <el-form label-position="top" class="service-form">
              <DatabaseFields v-model="database" path-hint="路径必须位于真寻项目目录内。" />
            </el-form>
            <div class="probe-actions">
              <el-button
                class="probe-button"
                :loading="probing.database"
                @click="probeDatabase"
              >
                <i class="el-icon-connection" /> 测试数据库
              </el-button>
              <probe-result :result="results.database" />
            </div>

            <div class="section-divider" />
            <label class="field-label">缓存模式</label>
            <div class="cache-actions">
              <el-radio-group v-model="cache.mode" class="segmented-control">
                <el-radio-button label="MEMORY">内存缓存</el-radio-button>
                <el-radio-button label="NONE">关闭缓存</el-radio-button>
                <el-radio-button label="REDIS">Redis</el-radio-button>
              </el-radio-group>
              <el-button
                class="probe-button"
                :loading="probing.cache"
                @click="probeCache"
              >
                <i class="el-icon-connection" /> 测试缓存
              </el-button>
              <probe-result :result="results.cache" />
            </div>
            <div v-if="cache.mode === 'REDIS'" class="field-grid redis-fields">
              <el-form label-position="top">
                <el-form-item label="Redis 地址"><el-input v-model.trim="cache.host" /></el-form-item>
              </el-form>
              <el-form label-position="top">
                <el-form-item label="端口"><el-input-number v-model="cache.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
              </el-form>
              <el-form label-position="top">
                <el-form-item label="密码"><el-input v-model="cache.password" type="password" show-password autocomplete="new-password" /></el-form-item>
              </el-form>
            </div>

          </section>

          <section v-show="currentStep.key === 'network'" class="step-section">
            <div class="step-intro">
              <span class="section-number">{{ String(step + 1).padStart(2, '0') }}</span>
              <h2>监听地址</h2>
              <p>同时决定 WebUI 与协议端（反向 WS）能否从其他设备连接。</p>
            </div>
            <div class="choice-grid network-choices">
              <button
                v-for="option in networkOptions"
                :key="option.value"
                type="button"
                class="choice-item"
                :class="{ active: network.mode === option.value }"
                @click="network.mode = option.value"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
                <em v-if="option.recommended">推荐</em>
              </button>
            </div>
            <el-form label-position="top" class="network-form">
              <div class="field-grid two-columns">
                <el-form-item v-if="network.mode === 'custom'" label="自定义本机地址">
                  <el-input v-model.trim="network.host" placeholder="192.168.1.10 或 ::1" />
                </el-form-item>
                <el-form-item label="端口">
                  <el-input-number v-model="network.port" :min="1" :max="65535" controls-position="right" />
                </el-form-item>
              </div>
            </el-form>
            <div v-if="detectedAddresses.length" class="detected-addresses">
              <span>检测到的局域网地址</span>
              <code v-for="address in detectedAddresses" :key="address">{{ address }}</code>
            </div>
            <probe-result :result="results.network" />
            <el-button
              class="probe-button"
              :loading="probing.network"
              @click="probeNetwork"
            >
              <i class="el-icon-connection" /> 测试监听
            </el-button>
          </section>

          <section v-show="currentStep.key === 'review'" class="step-section review-section">
            <div class="step-intro">
              <span class="section-number">{{ String(step + 1).padStart(2, '0') }}</span>
              <h2>检查并启动</h2>
              <p>保存时后端会再次执行全部检查，不依赖浏览器中的结果。</p>
            </div>
            <div class="checklist">
              <div v-for="item in reviewItems" :key="item.key" class="check-row">
                <i :class="reviewIcon(item.status)" />
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.message }}</span>
                </div>
                <b :class="item.status">{{ reviewStatus(item.status) }}</b>
              </div>
            </div>
            <el-checkbox v-if="hasWarnings" v-model="acceptWarnings" class="warning-confirm">
              我已了解以上警告，仍要继续
            </el-checkbox>
            <p v-if="applyError" class="inline-result error">
              <i class="el-icon-circle-close" /> {{ applyError }}
            </p>
          </section>
        </div>

        <footer class="setup-actions">
          <el-button v-if="step > 0" @click="step -= 1">上一步</el-button>
          <el-button v-else-if="serverState !== 'restart_pending'" @click="mode = null">返回</el-button>
          <span />
          <el-button v-if="!isLastStep" type="primary" @click="nextStep">下一步</el-button>
          <button
            v-else
            type="primary"
            class="final-action"
            :disabled="serverState !== 'restart_pending' && !canApply"
            @click="saveAndRestart"
          >
            <i v-if="applying" class="el-icon-loading" />
            {{ applying ? "正在处理" : serverState === "restart_pending" ? "立即重启" : "保存配置" }}
          </button>
        </footer>
      </template>
    </section>

  </main>
</template>

<script>
import { newOperationId } from "@/utils/plugin-operation"
import { formatBytes } from "@/utils/utils"
import { restoreModes, restoreModeHint, restoreOptions, restorePreparationLabels, restoreStateLabels, restoreDatabasePhase, nativeRecoveryHint } from "@/utils/migrationRestore"
import { getAuthToken } from "@/utils/auth-token"
import { uploadBackupInChunks } from "@/utils/chunk-upload"
import { reasonLabels } from "@/utils/plugin-operation"

import logoUrl from "@/assets/image/logo.png"
import { buildRestartTargets } from "@/utils/restart-targets"
import { confirmAndRestart } from "@/utils/restart-flow"
import { startRestartRecovery } from "@/utils/restart-recovery"
import DatabaseFields from "@/components/system/DatabaseFields.vue"

const RESTART_RECEIPT_KEY = "zhenxunSetupRestartReceipt"
const RESTART_TARGETS_KEY = "zhenxunSetupRestartTargets"
const SETUP_STEPS = [
  { key: "basic", title: "基本信息" },
  { key: "account", title: "WebUI 管理员" },
  { key: "services", title: "数据服务" },
  { key: "network", title: "监听地址" },
  { key: "review", title: "检查并启动" },
]

const ProbeResult = {
  name: "ProbeResult",
  props: { result: { type: Object, default: null } },
  render(h) {
    if (!this.result) return h("div", { class: "probe-result idle" }, "尚未测试")
    return h(
      "div",
      { class: ["probe-result", this.result.status] },
      [
        h("i", {
          class:
            this.result.status === "error"
              ? "el-icon-circle-close"
              : this.result.status === "warning"
              ? "el-icon-warning-outline"
              : "el-icon-circle-check",
        }),
        h("span", this.result.message),
        this.result.latency_ms == null ? null : h("b", `${this.result.latency_ms} ms`),
      ]
    )
  },
}

const restoreRunningStates = ["preparing", "pending", "snapshot_ready", "applying", "awaiting_orm", "importing", "verifying", "committing", "failed_import", "rollback_import", "rollback_target", "rollback_verifying", "recovery_required"]

export default {
  name: "SettingForm",
  components: { DatabaseFields, ProbeResult },
  data() {
    return {
      logoUrl,
      initializing: true,
      serverState: "unconfigured",
      claimed: false,
      accessError: "",
      mode: null,
      step: 0,
      setupSteps: SETUP_STEPS,
      probeVersions: { database: 0, cache: 0, network: 0 },
      account: { username: "admin", password: "", confirmPassword: "", superusers: "", selfNickname: "", nicknames: "" },
      database: {
        mode: "sqlite",
        path: "data/db/zhenxun.db",
        host: "127.0.0.1",
        port: 3306,
        username: "",
        password: "",
        database: "zhenxun",
        url: "",
      },
      cache: { mode: "MEMORY", host: "127.0.0.1", port: 6379, password: "" },
      network: { mode: "lan", host: "", port: 8080 },
      detectedAddresses: [],
      results: { database: null, cache: null, network: null },
      probing: { database: false, cache: false, network: false },
      acceptWarnings: false,
      applying: false,
      applyError: "",
      restartUrls: [],
      uploading: null,
      restoreOperationId: "",
      restoreTask: {},
      retryingRestore: false,
      restoreHandoff: "",
      restoreConfirming: false,
      backupName: "",
      backupPassword: "",
      backupSummary: null,
      restoreCategories: [],
      restoreModes, nativeRecoveryHint, restoreMode: "empty", backupBeforeReplace: true, includedTables: [], sourceBinding: "",
      skipFailed: false,
      inspecting: false,
      restoring: false,
      restoreError: "",
      lastRestoreError: "",
      categoryLabels: { configuration: "配置", data: "插件数据", plugins: "插件代码", resources: "资源文件" },
      databaseOptions: [
        { value: "sqlite", label: "SQLite", description: "无需独立服务，适合单机", recommended: true },
        { value: "mysql", label: "MySQL", description: "连接已有 MySQL 服务" },
        { value: "postgres", label: "PostgreSQL", description: "适合长期和高负载部署" },
        { value: "url", label: "连接 URL", description: "高级自定义配置" },
      ],
      networkOptions: [
        { value: "local", label: "仅本机", description: "只允许当前设备访问" },
        { value: "lan", label: "所有网络", description: "局域网与公网设备均可访问（公网需放通端口）", recommended: true },
        { value: "custom", label: "自定义", description: "绑定指定本机网卡地址" },
      ],
    }
  },
  computed: {
    currentStep() { return this.setupSteps[this.step] || this.setupSteps[0] },
    isLastStep() { return this.step === this.setupSteps.length - 1 },
    restoreModeDescription() { return restoreModeHint(this.restoreMode) },
    setupToken() {
      return getAuthToken() || ""
    },
    setupHeaders() {
      return { headers: { Authorization: this.setupToken } }
    },
    stateLabel() {
      if (this.mode === "restore" && this.restoreTaskRunning) return this.restoreProgressTitle
      return {
        unconfigured: "等待配置",
        partial: "配置待修复",
        restart_pending: "等待重启",
        configured: "已配置",
      }[this.serverState]
    },
    passwordRules() {
      const password = this.account.password
      return [
        { label: "至少 8 位", met: password.length >= 8 },
        { label: "包含大写字母", met: /[A-Z]/.test(password) },
        { label: "包含小写字母", met: /[a-z]/.test(password) },
        { label: "包含数字", met: /[0-9]/.test(password) },
        { label: "两次输入一致", met: !!password && password === this.account.confirmPassword },
      ]
    },
    accountReady() {
      return !!this.account.username && this.passwordRules.every((rule) => rule.met)
    },
    reviewItems() {
      return [
        { key: "bot", label: "机器人", status: "ok", message: this.botSummary },
        { key: "account", label: "管理员账户", status: this.accountReady ? "ok" : "error", message: this.accountReady ? "密码规则和确认均已通过" : "账户或密码规则尚未完成" },
        { key: "database", label: "数据库", status: this.results.database ? this.results.database.status : "error", message: this.results.database ? this.results.database.message : "尚未执行真实连接测试" },
        { key: "cache", label: "缓存", status: this.results.cache ? this.results.cache.status : "error", message: this.results.cache ? this.results.cache.message : "尚未执行缓存检查" },
        { key: "network", label: "监听地址", status: this.results.network ? this.results.network.status : "error", message: this.results.network ? this.results.network.message : "尚未执行监听检查" },
      ]
    },
    botSummary() {
      const names = this.normalizedNicknames()
      const head = names.length ? `名字 ${names[0]}${names.length > 1 ? `，也可以叫 ${names.slice(1).join("、")}` : ""}` : "沿用默认名字"
      const users = this.normalizedSuperusers()
      return `${head}；${users.length ? `超级用户 ${users.join("、")}` : "未设置超级用户，可稍后在系统设置中添加"}`
    },
    hasWarnings() {
      return this.reviewItems.some((item) => item.status === "warning")
    },
    restoredUsername() {
      const access = this.backupSummary?.restored_access
      return access?.password_set ? access.username || "" : ""
    },
    canRestore() {
      return Boolean(this.backupSummary && this.accountReady && (this.restoreMode === "replace_database" || this.includedTables.length > 0) && this.results.database && this.results.database.status !== "error" && !this.restoreParametersLocked)
    },
    restoreTaskRunning() {
      return restoreRunningStates.includes(this.restoreTask.state)
    },
    restoreParametersLocked() {
      return this.restoreConfirming || this.restoring || this.retryingRestore || this.restoreTaskRunning
    },
    restoreNeedsAttention() {
      if (["awaiting_orm", "recovery_required"].includes(this.restoreTask.state)) return true
      if (this.restoreTask.state !== "preparing") return false
      const preparation = this.restoreTask.preparation || {}
      if (preparation.phase === "cleanup_pending") return true
      if (this.restoreTask.cancel_requested) return false
      return Boolean(preparation.retryable || preparation.confirmation_required || ["waiting_credentials", "waiting_confirmation", "blocked", "interrupted"].includes(preparation.phase))
    },
    restoreProgressTitle() {
      if (this.restoreNeedsAttention) return "恢复等待处理"
      if (this.restoreTask.state === "preparing") return this.restoreTask.cancel_requested ? "正在取消恢复" : "恢复准备中"
      return restoreStateLabels[this.restoreTask.state] || "恢复任务"
    },
    restoreProgressStep() {
      if (this.restoreTask.state === "preparing") {
        if (this.restoreTask.cancel_requested && !this.restoreNeedsAttention) return "等待准备任务退出并清理临时内容"
        return restorePreparationLabels[this.restoreTask.preparation?.phase] || "检查恢复条件"
      }
      return restoreDatabasePhase(this.restoreTask) || restoreStateLabels[this.restoreTask.state] || "等待任务状态"
    },
    restoreActionLabel() {
      if (this.restoring) return "正在提交…"
      if (this.retryingRestore) return "正在处理…"
      if (this.restoreNeedsAttention) return "等待处理"
      if (this.restoreTask.state === "preparing") return this.restoreTask.cancel_requested ? "正在取消…" : "正在准备…"
      if (this.restoreTaskRunning) return this.restoreProgressStep + "…"
      return "开始恢复"
    },
    restoreTaskMessage() {
      const databasePhase = restoreDatabasePhase(this.restoreTask)
      if (databasePhase) return databasePhase + "，请等待当前阶段完成，不要重复提交。"
      if (this.restoreTask.state === "preparing") {
        const preparation = this.restoreTask.preparation || {}
        if (preparation.phase === "cleanup_pending") return preparation.error || "临时内容尚未清理完成，请重试候选清理。"
        if (this.restoreTask.cancel_requested) return "取消请求已提交，请等待清理完成，不要重复操作。"
        if (preparation.error) return preparation.error
        if (preparation.confirmation_required) return "请查看下方影响变化，确认后继续，或取消本次恢复。"
        if (this.restoreNeedsAttention) return "准备暂未完成，请处理当前问题后继续原任务，或取消本次恢复。"
        return "准备通过后将自动切换并导入。当前仍可取消本次恢复，请勿重复提交。"
      }
      const names = { target_database: "目标数据库", original_instance: "原实例启动", dependencies: "依赖层", files: "文件", orm: "插件 ORM" }
      const states = { confirmed: "已确认", pending: "等待核验", unconfirmed: "结果未确认", not_applicable: "无需回退" }
      const components = Object.entries(this.restoreTask.rollback_components || {}).map(([name, state]) => (names[name] || name) + "：" + (states[state] || state)).join("；")
      return "原恢复任务：" + (restoreStateLabels[this.restoreTask.state] || this.restoreTask.state) + "。" + (this.restoreTask.rollback_error || this.restoreTask.error || (this.restoreTaskRunning ? "正在续查原任务，请勿重复上传或提交。" : "")) + (components ? " " + components : "")
    },
    canApply() {
      const noErrors = this.reviewItems.every((item) => item.status !== "error")
      return noErrors && (!this.hasWarnings || this.acceptWarnings)
    },
  },
  watch: {
    step() { this.$nextTick(() => { const body = this.$el.querySelector(".step-body"); if (body) body.scrollTop = 0 }) },
    database: { deep: true, handler() { this.invalidateProbe("database") } },
    cache: { deep: true, handler() { this.invalidateProbe("cache") } },
    network: { deep: true, handler() { this.invalidateProbe("network") } },
  },
  created() { this.probeControllers = new Map(); this.readSequence = 0; this.requestControllers = new Set(); this.onExpired = () => { this.cancelReads(); for (const controller of this.requestControllers) controller.abort(); this.claimed = false; this.accessError = "会话已过期，连接已断开。" }; window.addEventListener("zhenxun-auth-expired", this.onExpired) },
  mounted() { document.addEventListener("visibilitychange", this.restoreVisibilityChanged); this.loadStatus() },
  beforeDestroy() { this.disposed = true; document.removeEventListener("visibilitychange", this.restoreVisibilityChanged); window.removeEventListener("zhenxun-auth-expired", this.onExpired); this.cancelReads(); for (const controller of this.requestControllers) controller.abort(); this.requestControllers.clear() },
  methods: {
    formatBytes,
    cancelReads() { this.readSequence++; clearTimeout(this.restoreTimer); this.statusController?.abort(); this.initializing = false },
    restoreVisibilityChanged() {
      this.cancelReads()
      if (!document.hidden && !this.disposed && this.claimed) this.loadStatus(false)
    },
    async resumeRestore() {
      const operationId = sessionStorage.getItem("zhenxun_restore_operation")
      if (!operationId || !this.claimed || document.hidden || this.disposed) return
      const sequence = this.readSequence
      clearTimeout(this.restoreTimer)
      try {
        const response = await this.getRequest(`${this.$root.prefix}/configure/backup/restore`, { operation_id: operationId }, { ...this.setupHeaders, suppressErrorToast: true })
        if (sequence !== this.readSequence || !this.claimed || this.disposed) return
        if (response?.suc && response.data?.state !== "idle") {
          this.restoreTask = response.data
          if (response.data.restart_info?.boot_id && (response.data.state !== "preparing" || response.data.preparation?.phase === "switching") && this.restoreHandoff !== operationId) {
            this.restoreHandoff = operationId
            this.restoreRestart(response.data.restart_info)
          }
          this.restoreOperationId = operationId
          this.mode = "restore"
        }
      } catch {
        if (sequence === this.readSequence && this.claimed) this.restoreError = "原任务状态暂不可确认，请稍后重试，不要重复提交。"
      }
      if (sequence === this.readSequence && this.claimed && !this.disposed && !document.hidden && this.restoreTaskRunning) this.restoreTimer = setTimeout(() => this.resumeRestore(), 2000)
    },
    async loadStatus(loadDraft = true) {
      const sequence = ++this.readSequence
      this.statusController?.abort()
      const controller = this.statusController = new AbortController()
      this.initializing = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/configure/status`, null, { signal: controller.signal })
        if (sequence !== this.readSequence) return
        this.serverState = response.data.state
        if (this.serverState === "configured") {
          this.clearSetupState()
          this.$router.replace("/")
          return
        }
        if (this.serverState === "restart_pending") {
          const receipt = window.sessionStorage.getItem(RESTART_RECEIPT_KEY)
          if (this.setupToken && receipt) {
            try { this.restartUrls = JSON.parse(window.sessionStorage.getItem(RESTART_TARGETS_KEY) || "[]") } catch (error) { this.restartUrls = [] }
            this.claimed = true
            this.mode = "fresh"
            this.step = this.setupSteps.length - 1
          }
          return
        }
        if (this.setupToken) {
          this.claimed = true
          if (loadDraft === true) await this.loadDraft(sequence, controller.signal)
          if (sequence === this.readSequence) await this.resumeRestore()
        }
      } catch (error) {
        if (sequence === this.readSequence && !controller.signal.aborted) this.accessError = "配置状态读取失败，请重新检查状态。"
      } finally {
        if (sequence === this.readSequence) this.initializing = false
      }
    },
    clearSetupState() {
      window.sessionStorage.removeItem(RESTART_RECEIPT_KEY)
      window.sessionStorage.removeItem(RESTART_TARGETS_KEY)
    },
    async loadDraft(sequence, signal) {
      try {
        const response = await this.getRequest(
          `${this.$root.prefix}/configure/draft`,
          null,
          { ...this.setupHeaders, signal, suppressErrorToast: true }
        )
        if (sequence !== this.readSequence) return
        const draft = response.data
        this.account.username = draft.username || "admin"
        this.account.selfNickname = draft.self_nickname || ""
        this.account.nicknames = (draft.nicknames || []).join("，")
        Object.assign(this.database, draft.database || {})
        Object.assign(this.cache, draft.cache || {})
        Object.assign(this.network, draft.network || {})
        this.detectedAddresses = draft.detected_addresses || []
      } catch (error) {
        if (sequence !== this.readSequence || signal.aborted) return
        if (error.response && [401, 409].includes(error.response.status)) {
          this.clearSetupState()
          this.claimed = false
          this.accessError =
            "配置授权已失效，请重新打开本次启动控制台中的连接链接。"
        }
      }
    },
    nextStep() {
      if (this.currentStep.key === "account" && !this.accountReady) {
        this.$message.warning("请先完成 WebUI 管理员账户和密码规则")
        return
      }
      if (this.currentStep.key === "services" && (!this.results.database || !this.results.cache)) {
        this.$message.warning("请手动测试数据库和缓存")
        return
      }
      if (this.currentStep.key === "network" && !this.results.network) {
        this.$message.warning("请先测试监听地址")
        return
      }
      if (!this.isLastStep) this.step += 1
    },
    selectDatabaseMode(mode) {
      if (this.mode === "restore" && this.restoreParametersLocked) return
      this.database.mode = mode
      if (mode === "mysql") this.database.port = 3306
      if (mode === "postgres") this.database.port = 5432
    },
    /** 清除配置项的检测结果并终止对应请求。 */
    invalidateProbe(key) {
      this.probeVersions[key] += 1
      this.results[key] = null
      this.acceptWarnings = false
      this.probeControllers.get(key)?.abort()
      this.probeControllers.delete(key)
      this.probing[key] = false
    },
    /** 使用当前配置快照检测连接，仅接收同一配置和会话的结果。 */
    async runProbe(key, path) {
      if (this.probing[key] || this.disposed || !this.claimed) return false
      await this.$nextTick()
      if (this.probing[key] || this.disposed || !this.claimed) return false
      const controller = new AbortController()
      const version = this.probeVersions[key]
      const sequence = this.readSequence
      const input = JSON.stringify(this[key])
      const payload = { [key]: JSON.parse(input) }
      const current = () => !controller.signal.aborted && !this.disposed && !this._isDestroyed
        && this.claimed && sequence === this.readSequence
        && version === this.probeVersions[key] && input === JSON.stringify(this[key])
      this.requestControllers.add(controller)
      this.probeControllers.set(key, controller)
      this.probing[key] = true
      this.results[key] = null
      try {
        const response = await this.postRequest(`${this.$root.prefix}/configure/probe/${path}`, payload, { ...this.setupHeaders, signal: controller.signal })
        if (!current()) return false
        if (!response?.suc || !response.data) throw new Error("检测结果无效")
        this.results[key] = response.data
        return response.data.status !== "error"
      } catch (error) {
        if (current()) this.results[key] = { status: "error", message: "连接检测失败，请重新检测。" }
        return false
      } finally {
        this.requestControllers.delete(controller)
        if (this.probeControllers.get(key) === controller) {
          this.probeControllers.delete(key)
          if (!this.disposed && !this._isDestroyed) this.probing[key] = false
        }
      }
    },
    probeDatabase() {
      if (this.mode === "restore" && this.restoreParametersLocked) return false
      return this.runProbe("database", "database")
    },
    probeCache() {
      return this.runProbe("cache", "cache")
    },
    probeNetwork() {
      return this.runProbe("network", "network")
    },
    normalizedSuperusers() {
      return [...new Set(this.account.superusers.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean))]
    },
    normalizedNicknames() {
      const others = this.account.nicknames.split(/[，,、\n]/)
      return [...new Set([this.account.selfNickname, ...others].map((value) => value.trim()).filter(Boolean))]
    },
    reviewIcon(status) {
      if (status === "ok") return "el-icon-circle-check ok"
      if (status === "warning") return "el-icon-warning-outline warning"
      return "el-icon-circle-close error"
    },
    reviewStatus(status) {
      return { ok: "正常", warning: "警告", error: "未通过" }[status]
    },
    async saveAndRestart() {
      if (this.applying) return
      if (this.serverState === "restart_pending") {
        const receipt = window.sessionStorage.getItem(RESTART_RECEIPT_KEY)
        if (receipt) await this.restartSavedConfiguration(receipt, false)
        return
      }
      if (!this.canApply) return
      this.applying = true
      const controller = new AbortController(); this.requestControllers.add(controller)
      this.applyError = ""
      try {
        const response = await this.postRequest(
          `${this.$root.prefix}/configure/apply`,
          {
            username: this.account.username,
            password: this.account.password,
            confirm_password: this.account.confirmPassword,
            superusers: this.normalizedSuperusers(),
            self_nickname: this.account.selfNickname,
            nicknames: this.normalizedNicknames(),
            database: this.database,
            cache: this.cache,
            network: this.network,
            accept_warnings: this.acceptWarnings,
          },
          { ...this.setupHeaders, signal: controller.signal }
        )
        if (controller.signal.aborted || this._isDestroyed) return
        if (!response.suc) {
          this.applyError = response.info || "最终检查未通过。"
          if (response.data) {
            Object.assign(this.results, response.data)
          }
          return
        }
        this.serverState = "restart_pending"
        this.restartUrls = this.buildRestartUrls(response.data.access_urls || [])
        window.sessionStorage.setItem(RESTART_RECEIPT_KEY, response.data.restart_receipt)
        window.sessionStorage.setItem(RESTART_TARGETS_KEY, JSON.stringify(this.restartUrls))
        await this.restartSavedConfiguration(response.data.restart_receipt, true)
      } catch (error) {
        if (controller.signal.aborted || this._isDestroyed) return
        this.applyError = (error.response && error.response.data && error.response.data.detail) || "保存配置时发生错误。"
      } finally {
        this.requestControllers.delete(controller)
        if (!this._isDestroyed) this.applying = false
      }
    },
    async restartSavedConfiguration(receipt, askConfirmation) {
      const policy = this.network.mode === "lan" ? "network" : this.network.mode
      const options = {
        prompt: "首次配置已保存，需要重启后才能开始使用真寻。",
        request: () => this.postRequest(
          `${this.$root.prefix}/configure/restart`,
          { receipt },
          this.setupHeaders
        ),
        recovery: {
          policy,
          preferredUrl: this.restartUrls[0] || "",
          accessUrls: this.restartUrls,
          returnRoute: "/",
          message: "首次配置已保存，正在等待新进程完成启动。",
          setup: true,
        },
      }
      if (askConfirmation) return confirmAndRestart(this, options)
      return confirmAndRestart(this, {
        ...options,
        prompt: "配置已经保存，确认现在重启真寻吗？",
      })
    },
    async openRestore() {
      this.mode = "restore"
      await this.resumeRestore()
      if (this.restoreTaskRunning) return
      this.lastRestoreError = ""
      try {
        const response = await this.getRequest(`${this.$root.prefix}/configure/backup/restore`, null, { ...this.setupHeaders, suppressErrorToast: true })
        const status = response?.data || {}
        if (status.operation_id && restoreRunningStates.includes(status.state)) {
          sessionStorage.setItem("zhenxun_restore_operation", status.operation_id)
          await this.resumeRestore()
          return
        }
        if (!["failed", "rolled_back", "rollback_failed", "recovery_required"].includes(status.state)) return
        const label = reasonLabels[status.error_code]
        this.lastRestoreError = status.rollback_error
          || (label ? `依赖无法安装：${label}${status.error_detail ? `（${status.error_detail}）` : ""}` : status.error)
          || "未知错误"
      } catch (error) { this.lastRestoreError = "" }
    },
    async uploadBackup(event) {
      const file = event.target.files[0]
      event.target.value = ""
      if (this.restoreParametersLocked) return
      if (!file) return
      Object.assign(this, { restoreOperationId: "", uploading: 0, restoreError: "", backupName: "", backupPassword: "", backupSummary: null })
      try {
        this.backupName = await uploadBackupInChunks(`${this.$root.prefix}/configure/backup`, file, {
          config: this.setupHeaders,
          onProgress: (loaded, total) => { this.uploading = total ? Math.min(100, Math.round(loaded / total * 100)) : 0 },
        })
      } catch (error) {
        this.restoreError = this.requestError(error, "上传失败")
        return
      } finally { this.uploading = null }
      await this.inspectBackup()
    },
    async inspectBackup() {
      if (this.restoreParametersLocked || this.inspecting || !this.backupName) return
      const generation = this.readSequence
      const inspectedName = this.backupName
      this.inspecting = true; this.restoreError = ""
      try {
        const response = await this.postRequest(
          `${this.$root.prefix}/configure/backup/inspect`,
          { name: this.backupName, password: this.backupPassword || null },
          { ...this.setupHeaders, suppressErrorToast: true }
        )
        if (!response?.suc) throw new Error(response?.info)
        if (generation !== this.readSequence || inspectedName !== this.backupName || !this.claimed || this.disposed || this.restoreParametersLocked) return
        this.backupSummary = response.data
        this.restoreCategories = []
        this.includedTables = Object.keys(response.data.database.tables)
      } catch (error) {
        if (generation === this.readSequence && this.claimed && !this.disposed) this.restoreError = this.requestError(error, "读取备份失败")
      } finally { if (generation === this.readSequence && !this.disposed) this.inspecting = false }
    },
    async cancelPreparation() {
      if (this.retryingRestore || !this.claimed || this.restoreTask.state !== "preparing" || (this.restoreTask.cancel_requested && this.restoreTask.preparation?.phase !== "cleanup_pending")) return
      this.retryingRestore = true
      const sequence = this.readSequence
      try {
        const response = await this.deleteRequest(this.$root.prefix + "/configure/backup/restore?operation_id=" + encodeURIComponent(this.restoreTask.operation_id), null, { ...this.setupHeaders, suppressErrorToast: true })
        if (sequence !== this.readSequence || !this.claimed || this.disposed) return
        if (!response?.suc) throw new Error(response?.info || "取消请求未接受")
        await this.resumeRestore()
      } catch (error) {
        if (sequence === this.readSequence && this.claimed && !this.disposed) this.restoreError = this.requestError(error, "取消失败，可重试原任务")
      } finally { this.retryingRestore = false }
    },
    async retryPreparation() {
      if (this.retryingRestore || !this.claimed || this.restoreTask.cancel_requested || !this.restoreTask.preparation?.retryable) return
      this.retryingRestore = true
      const sequence = this.readSequence
      try {
        if (this.restoreTask.preparation.password_required && !this.backupPassword) {
          try {
            const answer = await this.$prompt("请输入原备份包密码，继续同一任务", "补充解密密码", { inputType: "password", inputValidator: value => !!value || "请输入密码" })
            this.backupPassword = answer.value
          } catch { return }
        }
        if (sequence !== this.readSequence || !this.claimed || this.disposed) return
        const response = await this.postRequest(this.$root.prefix + "/configure/backup/restore", {
          operation_id: this.restoreTask.operation_id, retry: true,
          password: this.backupPassword || null,
          confirmation_digest: this.restoreTask.preparation.confirmation_required ? this.restoreTask.preparation.impact_digest : null,
        }, { ...this.setupHeaders, suppressErrorToast: true })
        if (sequence !== this.readSequence || !this.claimed || this.disposed) return
        if (!response?.suc) throw new Error(response?.info || "无法继续准备")
        await this.resumeRestore()
      } catch (error) {
        if (sequence === this.readSequence && this.claimed) this.restoreError = this.requestError(error, "重试失败")
      } finally { this.retryingRestore = false }
    },
    restoreRestart(data) {
      this.serverState = "restart_pending"
      startRestartRecovery({
        bootId: data.boot_id, accessUrls: data.access_urls, accessTargets: data.access_targets,
        preferredUrl: data.preferred_url, returnRoute: "/", setup: true,
        message: "候选已准备，正在自动切换。完成后请使用目标端管理员登录并查看恢复结果。",
      })
    },
    async startRestore() {
      if (!this.canRestore || this.restoreConfirming) return
      const confirmationInput = JSON.stringify([this.restoreMode, this.backupBeforeReplace, this.includedTables, this.restoreCategories, this.sourceBinding, this.skipFailed, this.database, this.account])
      this.restoreConfirming = true
      try {
        await this.$confirm(this.restoreModeDescription + "准备通过后切换并导入，完成后使用目标端管理员 " + this.account.username + " 登录。", "确认恢复", { type: "warning", confirmButtonText: "开始恢复", cancelButtonText: "取消" })
      } catch { return } finally { this.restoreConfirming = false }
      if (!this.canRestore || confirmationInput !== JSON.stringify([this.restoreMode, this.backupBeforeReplace, this.includedTables, this.restoreCategories, this.sourceBinding, this.skipFailed, this.database, this.account])) return
      if (!this.claimed || this.disposed) return
      const generation = this.readSequence
      const options = restoreOptions(this.restoreMode, this.backupBeforeReplace, this.restoreMode === "replace_database" ? null : this.includedTables, this.sourceBinding)
      const setupAccount = { username: this.account.username, password: this.account.password, confirm_password: this.account.confirmPassword }
      const input = JSON.stringify([this.backupName, this.backupPassword, [...this.restoreCategories].sort(), this.skipFailed, this.database, options, setupAccount])
      if (input !== this.restoreOperationInput) { this.restoreOperationId = ""; this.restoreOperationInput = input }
      this.restoreOperationId = this.restoreOperationId || newOperationId()
      sessionStorage.setItem("zhenxun_restore_operation", this.restoreOperationId)
      this.restoring = true; this.restoreError = ""
      try {
        const response = await this.postRequest(
          `${this.$root.prefix}/configure/backup/restore`,
          {
            ...options, setup_account: setupAccount,
            operation_id: this.restoreOperationId,
            name: this.backupName,
            password: this.backupPassword || null,
            categories: this.restoreCategories,
            skip_failed: this.skipFailed,
            database: this.database,
          },
          { ...this.setupHeaders, timeout: 0, suppressErrorToast: true }
        )
        if (generation !== this.readSequence || !this.claimed || this.disposed) return
        if (!response?.suc) throw new Error(response?.info)
        const data = response.data
        if (!data.boot_id) {
          await this.resumeRestore()
          return
        }
        this.serverState = "restart_pending"
        startRestartRecovery({
          bootId: data.boot_id,
          accessUrls: data.access_urls,
          accessTargets: data.access_targets,
          preferredUrl: data.preferred_url,
          returnRoute: "/",
          message: `正在从备份恢复，完成后请使用目标端管理员账号 ${this.account.username} 登录，并在 更新与维护 → 备份与恢复 中查看恢复结果。`,
          setup: true,
        })
      } catch (error) {
        if (generation === this.readSequence && this.claimed) this.restoreError = this.requestError(error, "恢复失败")
      } finally { if (generation === this.readSequence) this.restoring = false }
    },
    requestError(error, fallback) {
      const message = error.response?.data?.detail || error.message || fallback
      if (String(message).includes("migration_operation_in_progress")) {
        this.openRestore()
        return "已有未结束的恢复任务，请在上方重试或取消后再操作。"
      }
      return message
    },
    buildRestartUrls(urls) {
      return buildRestartTargets({
        mode: this.network.mode,
        customHost: this.network.host,
        port: this.network.port,
        accessUrls: urls,
      })
    },
  },
}
</script>

<style lang="scss" scoped>
.setup-shell { display: flex; height: 100%; min-height: 0; padding: 32px 20px; overflow: hidden; background: linear-gradient(145deg, #f7f8fb 0%, #fff4f7 100%); color: #30333a; }
.setup-workspace { display: flex; width: min(960px, 100%); height: min(860px, 100%); min-height: 0; margin: auto; flex-direction: column; overflow: hidden; background: #fff; border: 1px solid #e8e9ee; border-radius: 8px; box-shadow: 0 18px 54px rgba(61, 66, 84, 0.1); }
.setup-header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid #eceef2; }
.setup-header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: 16px; }
.brand-block { display: flex; align-items: center; gap: 18px; }
.brand-logo { width: 108px; height: 52px; object-fit: contain; }
.brand-kicker { margin: 0 0 2px; color: #c74e80; font-size: 11px; font-weight: 800; }
h1, h2, p { margin: 0; }
h1 { font-family: "fzrzFont", sans-serif; font-size: 25px; letter-spacing: 0; }
.brand-block p:last-child, .step-intro p, .claim-copy p { margin-top: 5px; color: #7b7f89; line-height: 1.7; }
.state-badge { padding: 6px 10px; border: 1px solid #f0b1ca; border-radius: 4px; color: #b93d70; background: #fff4f8; font-size: 12px; }
.claim-layout { display: grid; min-height: 0; flex: 1 1 auto; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; padding: 64px 72px; overflow-y: auto; }
.pending-layout { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 48px; overflow-y: auto; text-align: center; }
.pending-layout p { max-width: 520px; margin-bottom: 8px; color: #7b7f89; line-height: 1.7; }
.pending-icon { color: #c74e80; font-size: 38px; }
.claim-copy h2, .step-intro h2 { margin-top: 8px; font-size: 23px; }
.section-number { color: #c74e80; font-size: 12px; font-weight: 800; }
.claim-form { padding-left: 36px; border-left: 1px solid #e6e8ed; }
.access-icon { display: block; margin-bottom: 20px; color: #d85f82; font-size: 34px; }
.primary-action { width: 100%; height: 44px; margin-top: 12px; }
.desktop-steps { flex: 0 0 auto; padding: 26px 48px 10px; }
.mobile-progress { display: none; }
.step-body { min-height: 0; flex: 1 1 auto; padding: 28px 56px 18px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.step-section { max-width: 780px; margin: 0 auto; }
.step-intro { margin-bottom: 28px; }
.field-grid { display: grid; gap: 0 18px; }
.two-columns { grid-template-columns: 1fr 1fr; }
.password-rules { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; padding: 0; list-style: none; color: #969aa4; font-size: 12px; }
.password-rules li.met { color: #3b9d68; }
.field-label { display: block; margin-bottom: 10px; font-weight: 700; }
.choice-grid { display: grid; gap: 10px; margin-bottom: 22px; }
.mode-layout { min-height: 0; flex: 1 1 auto; width: 100%; max-width: 780px; margin: 0 auto; padding: 56px 56px 24px; overflow-y: auto; }
.mode-choices { grid-template-columns: 1fr 1fr; }
.restore-upload { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
.restore-upload code { padding: 4px 7px; border-radius: 3px; background: #eef1f5; overflow-wrap: anywhere; }
.restore-password { max-width: 360px; }
.backup-summary { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 8px 12px; margin: 8px 0 14px; font-size: 13px; }
.backup-summary dt { color: #7b7f89; }
.backup-summary dd { margin: 0; overflow-wrap: anywhere; }
.restore-modes { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0; }
.restore-modes .el-radio { margin-right: 0; white-space: normal; }
.restore-categories { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 12px; }
.restore-categories .el-checkbox { margin-right: 0; }
.restore-database-hint { margin-bottom: 14px; }
.last-restore { margin-bottom: 16px; }
.restore-progress { margin-bottom: 28px; padding: 20px; border: 1px solid #f0cedd; border-radius: 8px; background: #fff7fa; overflow-wrap: anywhere; }
.restore-progress.needs-attention { border-color: #eed7ad; background: #fffaf1; }
.restore-progress h2 { margin: 0 0 12px; color: #343740; font-size: 18px; }
.restore-progress p { margin: 8px 0 0; color: #747984; font-size: 13px; line-height: 1.7; }
.restore-progress .restore-progress-step { color: #343740; font-weight: 600; }
.restore-progress-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.restore-progress-actions .el-button { margin-left: 0; white-space: normal; line-height: 1.5; }
.restore-preparation-changes { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.step-intro .restore-lock-hint { color: #a24a70; font-size: 13px; }
.database-choices { grid-template-columns: repeat(4, 1fr); }
.network-choices { grid-template-columns: repeat(3, 1fr); }
.choice-item { position: relative; min-height: 82px; padding: 14px; border: 1px solid #dfe2e8; border-radius: 6px; color: #343740; background: #fff; text-align: left; cursor: pointer; }
.choice-item:hover, .choice-item.active { border-color: #dc6d9b; background: #fff7fa; }
.choice-item:disabled { cursor: not-allowed; opacity: 0.65; }
.choice-item strong, .choice-item span { display: block; }
.choice-item span { margin-top: 6px; color: #858995; font-size: 12px; line-height: 1.45; }
.choice-item em { position: absolute; top: 8px; right: 8px; color: #c74e80; font-size: 10px; font-style: normal; }
.field-hint { margin-top: 5px; color: #90949e; font-size: 12px; }
.probe-button { width: 132px; margin-top: 8px; }
.probe-actions, .cache-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; }
.probe-actions .probe-button, .cache-actions .probe-button { flex: 0 0 auto; width: auto; margin: 0; }
.probe-actions .probe-result, .cache-actions .probe-result { min-width: 0; flex: 1 1 180px; margin: 0; }
.cache-actions .segmented-control { margin: 0; }
.cache-actions { margin-bottom: 18px; }
.probe-result { display: flex; align-items: center; gap: 8px; min-height: 34px; margin-top: 4px; color: #8a8e98; font-size: 13px; }
.probe-result span { min-width: 0; overflow-wrap: anywhere; }
.probe-result b { flex-shrink: 0; margin-left: 4px; font-size: 11px; }
.probe-result.ok { color: #318c5a; }
.probe-result.warning { color: #be7918; }
.probe-result.error { color: #c74343; }
.section-divider { height: 1px; margin: 26px 0 20px; background: #eceef2; }
.segmented-control { margin-bottom: 18px; }
.redis-fields { grid-template-columns: 1.2fr 0.7fr 1.2fr; }
.detected-addresses { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 12px; color: #747984; font-size: 12px; }
.detected-addresses code { padding: 4px 7px; border-radius: 3px; background: #eef1f5; }
.checklist { border-top: 1px solid #e8eaf0; }
.check-row { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; min-height: 72px; border-bottom: 1px solid #e8eaf0; }
.check-row > i { font-size: 20px; }
.check-row div strong, .check-row div span { display: block; }
.check-row div span { margin-top: 5px; color: #7d818b; font-size: 12px; }
.check-row b { font-size: 12px; }
.ok { color: #318c5a; }
.warning { color: #be7918; }
.error { color: #c74343; }
.warning-confirm { margin-top: 20px; }
.inline-result { margin: 10px 0; font-size: 13px; }
.setup-actions { z-index: 2; display: grid; flex: 0 0 auto; grid-template-columns: 120px 1fr 150px; gap: 12px; padding: 18px 56px 24px; border-top: 1px solid #eceef2; background: #fff; box-shadow: 0 -8px 20px rgba(61, 66, 84, 0.04); }
.setup-actions .el-button { min-height: 40px; min-width: 0; white-space: normal; line-height: 1.5; }
.final-action { min-height: 40px; border: 1px solid #cf588a; border-radius: 4px; color: #fff; background: #cf588a; cursor: pointer; }
.final-action:disabled { border-color: #e5bdce; background: #e5bdce; cursor: not-allowed; }
::v-deep .el-button--primary { border-color: #cf588a; background: #cf588a; }
::v-deep .el-input-number { width: 100%; }

@media (min-width: 701px) and (max-height: 650px) {
  .setup-shell { padding: 12px 16px; }
  .setup-header { padding: 12px 24px; }
  .brand-logo { width: 80px; height: 38px; }
  .brand-kicker, .brand-block p:last-child { display: none; }
  h1 { font-size: 22px; }
  .desktop-steps { padding: 12px 32px 4px; }
  .step-body { padding: 12px 32px; }
  .step-intro { margin-bottom: 12px; }
  .step-intro h2 { margin-top: 4px; font-size: 20px; }
  .setup-actions { padding: 10px 32px; }
  .choice-grid { margin-bottom: 12px; }
}

@media (max-width: 700px) {
  .setup-shell { padding: 0; background: #fff; }
  .setup-workspace { width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
  .setup-header { padding: 18px 16px; flex-wrap: wrap; gap: 12px; }
  .setup-header-actions { width: 100%; margin-left: 0; align-items: flex-start; }
  .brand-logo { width: 82px; height: 42px; }
  .brand-block p:last-child, .state-badge { display: none; }
  .claim-layout { display: block; min-height: 0; padding: 48px 22px; }
  .claim-form { margin-top: 34px; padding: 0; border: 0; }
  .desktop-steps { display: none; }
  .mobile-progress { display: block; flex: 0 0 auto; padding: 18px 18px 4px; }
  .mobile-progress span, .mobile-progress strong { display: block; margin-bottom: 7px; }
  .mobile-progress span { color: #a24a70; font-size: 11px; }
  .step-body { min-height: 0; padding: 24px 18px 16px; }
  .two-columns, .redis-fields, .database-choices, .network-choices, .mode-choices { grid-template-columns: 1fr; }
  .mode-layout { padding: 32px 18px 16px; }
  .choice-item { min-height: 70px; }
  .setup-actions { grid-template-columns: 1fr 1fr; padding: 12px 18px max(12px, env(safe-area-inset-bottom)); background: #fff; }
  .setup-actions > span { display: none; }
  .setup-actions .el-button:last-child { grid-column: 2; }
}
</style>
