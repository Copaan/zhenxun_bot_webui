<template>
  <section class="task-status" aria-live="polite">
    <template v-if="runtime">
      <div class="task-step"><strong>{{ runtime.step || '处理中' }}</strong><span>{{ phaseLabel }}{{ runtime.stage !== job.stage ? ' · 最后记录的步骤' : '' }}</span></div>
      <el-progress v-if="numeric(runtime.overall_percent)" :percentage="runtime.overall_percent" :status="progressStatus" :stroke-width="8" />
      <p v-if="numeric(runtime.overall_percent)" class="task-muted">流程估算；下列计数为当前步骤的实际处理量</p>
      <p v-else class="task-working">{{ terminal ? '已停止' : '处理中 · 此步骤无法预估总量' }}</p>
      <dl class="task-metrics">
        <template v-if="numeric(runtime.current)"><dt>已处理</dt><dd>{{ runtime.current }} / {{ numeric(runtime.total) ? runtime.total : '未知' }} {{ runtime.unit || '项' }}</dd></template>
        <template v-if="numeric(runtime.bytes_done)"><dt>数据量</dt><dd>{{ bytes(runtime.bytes_done) }}<template v-if="numeric(runtime.bytes_total)"> / {{ bytes(runtime.bytes_total) }}</template></dd></template>
        <dt>步骤耗时</dt><dd>{{ duration(runtime.elapsed_seconds) }}</dd>
        <template v-if="numeric(runtime.total_elapsed_seconds)"><dt>任务总耗时</dt><dd>{{ duration(runtime.total_elapsed_seconds) }}</dd></template>
        <dt>步骤预计剩余</dt><dd>{{ terminal ? '—' : duration(runtime.eta_seconds) }}</dd>
        <dt>最近进展</dt><dd>{{ timestamp(runtime.updated_at) }}</dd>
      </dl>
    </template>
    <p v-else class="task-muted">{{ phaseLabel }} · {{ job.stage === 'completed' ? '流程已完成' : '当前阶段未提供计数' }}</p>
    <p v-if="job.first_error" class="task-error">{{ failureSummary(job) }}</p>
    <details v-if="job.first_error || diagnostic" class="task-detail" @toggle="detailsOpen = $event.target.open">
      <summary>任务错误与数据库工具详情</summary>
      <p v-if="job.first_error">任务首因：<code>{{ job.first_error }}</code></p>
      <template v-if="diagnostic">
        <dl class="task-metrics">
          <dt>工具</dt><dd>{{ diagnostic.tool }} · {{ diagnostic.tool_version || '版本未取得' }} · {{ diagnostic.engine }}</dd>
          <dt>执行阶段</dt><dd>{{ diagnostic.phase }} / {{ diagnostic.operation }}</dd>
          <dt>执行结果</dt><dd>{{ diagnostic.error_code || (job.first_error ? '工具执行成功；后续迁移步骤失败，请查看任务首因' : '工具执行成功；结果仍须通过迁移校验') }}</dd>
          <dt>退出码</dt><dd>{{ diagnostic.return_code == null ? '未取得' : diagnostic.return_code }}</dd>
          <dt>耗时</dt><dd>{{ duration(diagnostic.duration_seconds) }}</dd>
          <dt>环境</dt><dd>{{ diagnostic.environment || '未记录' }}</dd>
          <dt>输出大小</dt><dd>stdout {{ bytes(diagnostic.stdout_bytes) }} · stderr {{ bytes(diagnostic.stderr_bytes) }}</dd>
        </dl>
        <p v-if="diagnostic.cleanup_error" class="task-error">工具资源清理：{{ diagnostic.cleanup_error }}</p>
        <p class="task-muted">stderr（凭据已脱敏）{{ diagnostic.truncated ? ' · 输出超过上限，已截断' : '' }}</p>
        <pre v-if="detailsOpen" tabindex="0">{{ diagnostic.stderr || '工具未提供 stderr' }}</pre>
      </template>
      <p v-else>此任务未保存数据库工具详情。</p>
    </details>
    <details v-if="verification" class="task-detail">
      <summary>文件核验结果</summary>
      <p>{{ job.progress.validation.checks && job.progress.validation.checks.files === true ? '文件核验通过' : '文件核验尚未确认' }}</p>
      <p>已核验 {{ verification.file_count }} 项 · 主动保留 {{ verification.preserved_count }} 项</p>
    </details>
  </section>
</template>

<script>
import { migrationStages, terminalMigrationStages, migrationFailureSummary } from '@/utils/migration'

export default {
  name: 'MigrationTaskStatus',
  props: { job: { type: Object, required: true } },
  data: () => ({ detailsOpen: false }),
  computed: {
    runtime() { const value = this.job.progress?.runtime; return value && (value.stage === this.job.stage || this.terminal) ? value : null },
    terminal() { return terminalMigrationStages.has(this.job.stage) || this.job.stage === 'recovery_required' },
    phaseLabel() { return migrationStages[this.job.stage] || this.job.stage },
    diagnostic() { return this.job.database_diagnostic || null },
    verification() { return this.job.progress?.validation?.evidence || null },
    progressStatus() { return this.job.stage === 'completed' ? 'success' : this.job.first_error ? 'exception' : undefined },
  },
  methods: {
    failureSummary: migrationFailureSummary,
    numeric(value) { return typeof value === 'number' && Number.isFinite(value) },
    duration(value) { return this.numeric(value) ? value < 60 ? `${value.toFixed(1)} 秒` : `${Math.floor(value / 60)} 分 ${Math.round(value % 60)} 秒` : '无法估算' },
    bytes(value) { return this.numeric(value) ? value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB` : '未取得' },
    timestamp(value) { return value ? new Date(value * 1000).toLocaleTimeString() : '未记录' },
  },
}
</script>

<style scoped>
.task-status { margin: 14px 0; padding: 16px; background: #f7f9fc; border: 1px solid #e1e7ef; border-radius: 10px; min-width: 0; }
.task-step { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.task-step span, .task-muted { color: #697786; font-size: 12px; }
.task-metrics { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 8px 12px; margin: 12px 0; }
.task-metrics dt { color: #697786; }.task-metrics dd { margin: 0; overflow-wrap: anywhere; }
.task-error { color: #a83838; overflow-wrap: anywhere; }.task-detail summary { cursor: pointer; padding: 8px 0; }
.task-detail pre { background: #fff; border: 1px solid #dce2e8; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-height: 380px; overflow: auto; font-size: 12px; }
.task-working { color: #466f8b; }.task-detail code { overflow-wrap: anywhere; }
@media (max-width: 600px) { .task-status { padding: 12px; }.task-metrics { grid-template-columns: 84px minmax(0, 1fr); gap: 8px; } }
</style>
