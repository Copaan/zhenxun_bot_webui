<template>
  <section class="message-inbox">
    <header><h2>消息接收与处理</h2><el-button :loading="loading" @click="refresh">刷新</el-button></header>
    <p>已接收表示消息已落盘，执行完成不等于回复与后台写库全部成功。等待超过五分钟的消息不会自动执行；结果不明的工作需要核验，避免重复扣款或调用插件。</p>
    <div class="inbox-metrics">
      <div v-for="item in metrics" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="inbox-filter">
      <el-select v-model="state" clearable placeholder="全部状态" @change="refresh">
        <el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" />
      </el-select>
      <span>仅显示处理元数据，不展示消息正文</span>
    </div>
    <el-table :data="items" empty-text="暂无消息记录">
      <el-table-column prop="sequence" label="序号" width="80" />
      <el-table-column prop="bot" label="机器人" min-width="150" />
      <el-table-column label="状态" min-width="120"><template slot-scope="scope">{{ labels[scope.row.state] || scope.row.state }}</template></el-table-column>
      <el-table-column label="原因" min-width="200"><template slot-scope="scope">{{ reasons[scope.row.reason] || scope.row.reason || '—' }}</template></el-table-column>
      <el-table-column label="后台记录" min-width="180"><template slot-scope="scope">{{ deliverySummary(scope.row) }}</template></el-table-column>
      <el-table-column label="处理" width="120"><template slot-scope="scope">
        <el-button type="text" @click="showOperations(scope.row)">资产收据</el-button>
        <el-button v-if="['held', 'failed', 'unresolved'].includes(scope.row.state)" type="text" @click="dismiss(scope.row)">结束待处理</el-button>
      </template></el-table-column>
    </el-table>
    <footer><el-button :disabled="loading || !next" @click="load(true)">下一页</el-button><el-button :disabled="loading" @click="refresh">返回首页</el-button></footer>
    <el-dialog title="本体资产操作收据" :visible.sync="operationsVisible" width="90%" append-to-body>
      <p>仅列出本体已记录的资产操作，不代表第三方外部副作用已核验；不会重新执行插件。</p>
      <el-alert v-if="operationsError" :title="operationsError" type="error" :closable="false" />
      <el-table :data="operations" empty-text="无本体资产收据">
        <el-table-column prop="kind" label="操作" /><el-table-column prop="state" label="持久状态" />
        <el-table-column prop="id" label="收据编号" min-width="200" />
      </el-table>
      <el-button :disabled="operationsLoading || !operationsNext" @click="loadOperations(true)">下一页</el-button>
    </el-dialog>
  </section>
</template>

<script>
export default {
  name: "MessageInbox",
  data: () => ({
    items: [], status: {}, state: "", next: null, error: "", loading: false,
    sequence: 0, disposed: false, operationsVisible: false, operations: [], operationsId: "", operationsNext: null, operationsError: "", operationsLoading: false, operationsSequence: 0,
    labels: { pending: "等待执行", executing: "执行中", waiting_input: "等待用户回应", completed: "执行完成", held: "保留待处理", unresolved: "结果待核验", failed: "失败", dismissed: "已结束待处理" },
    reasons: { waiting_expired: "等待超过五分钟", reply_capability_expired: "被动回复资格已过期", plugin_generation_changed: "插件版本发生变化", worker_interrupted: "工作进程中断", interaction_interrupted: "交互状态随进程中断丢失", execution_interrupted: "执行中断", execution_failed_or_reply_unconfirmed: "执行或回复结果不明", matcher_failed: "插件执行失败", administrator_dismissed: "管理员结束待处理" },
  }),
  computed: {
    metrics() {
      const states = this.status.states || {}
      return [
        { label: "累计落盘接收", value: this.status.counters?.accepted || 0 },
        { label: "等待 / 执行中", value: `${states.pending || 0} / ${this.status.active || 0}` },
        { label: "待处理 / 待核验", value: `${states.held || 0} / ${states.unresolved || 0}` },
        { label: "最久等待", value: `${Math.round(this.status.oldest_wait_seconds || 0)} 秒` },
        { label: "后台待写 / 受阻", value: `${this.status.deliveries?.pending || 0} / ${this.status.deliveries?.blocked || 0}` },
        { label: "等待用户回应", value: this.status.waiting_input || 0 },
        { label: "队列占用", value: `${((this.status.bytes || 0) / 1048576).toFixed(1)} MiB` },
      ]
    },
  },
  mounted() { this.refresh() },
  beforeDestroy() { this.disposed = true; this.sequence++; this.operationsSequence++ },
  methods: {
    deliverySummary(row) {
      let result = {}
      try { result = typeof row.result === "string" ? JSON.parse(row.result) : row.result || {} } catch { return "记录无法解析，请核验" }
      if (row.history_state === "blocked") return "历史补写受阻"
      if (["pending", "executing"].includes(row.history_state)) return "历史补写待完成"
      const states = Object.values(result.deliveries || {})
      if (states.includes("unknown") || states.includes("reply_unconfirmed")) return "回复结果不明"
      if (states.includes("sending")) return "回复尚未确认"
      if (states.includes("persisted")) return "后台已持久入队"
      return result.history === "persisted_or_skipped" ? "历史已处理或按配置跳过" : "见汇总及资产收据"
    },
    showOperations(row) {
      this.operationsId = row.id; this.operations = []; this.operationsNext = null
      this.operationsVisible = true; this.loadOperations(false)
    },
    async loadOperations(nextPage) {
      const sequence = ++this.operationsSequence
      this.operationsLoading = true
      try {
        const query = new URLSearchParams({ after: nextPage ? this.operationsNext || "" : "", limit: "50" })
        const response = await this.getRequest(`${this.$root.prefix}/system/runtime/messages/${this.operationsId}/operations?${query}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info || "资产收据读取失败")
        if (this.disposed || sequence !== this.operationsSequence) return
        this.operations = response.data.items; this.operationsNext = response.data.next; this.operationsError = ""
      } catch (error) {
        if (!this.disposed && sequence === this.operationsSequence) this.operationsError = error.message || "读取失败，已保留当前记录"
      } finally { if (sequence === this.operationsSequence) this.operationsLoading = false }
    },
    refresh() { this.next = null; return this.load(false) },
    async load(nextPage) {
      const sequence = ++this.sequence
      this.loading = true
      try {
        const query = new URLSearchParams({ after: String(nextPage ? this.next || 0 : 0), limit: "50" })
        if (this.state) query.set("state", this.state)
        const response = await this.getRequest(`${this.$root.prefix}/system/runtime/messages?${query}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info || "消息队列读取失败")
        if (this.disposed || sequence !== this.sequence) return
        this.items = response.data.items
        this.status = response.data.status
        this.next = response.data.next
        this.error = ""
      } catch (error) {
        if (!this.disposed && sequence === this.sequence) this.error = error?.response?.data?.detail || error.message || "读取失败，已保留当前列表和筛选条件"
      } finally {
        if (sequence === this.sequence) this.loading = false
      }
    },
    async dismiss(row) {
      try {
        await this.$confirm("这不会重新执行插件，也不会撤销已经产生的业务结果。确认已核验此消息并结束待处理？", "结束待处理", { type: "warning" })
      } catch { return }
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/runtime/messages/${row.id}/resolve`, { expected_revision: row.revision, action: "dismiss" }, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info || "处理失败")
        if (!this.disposed) await this.refresh()
      } catch (error) {
        if (!this.disposed) this.error = error?.response?.status === 409 ? "记录已变化，请刷新后重新核验。" : error.message || "处理失败，原记录已保留"
      }
    },
  },
}
</script>

<style scoped>
.message-inbox { padding: 12px 0; }
header, footer, .inbox-filter { display: flex; align-items: center; gap: 16px; margin: 16px 0; }
header { justify-content: space-between; } h2 { margin: 0; font-size: 18px; }
p, .inbox-filter span { color: var(--text-color-secondary); line-height: 1.7; }
.inbox-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
.inbox-metrics > div { padding: 14px; border: 1px solid var(--border-color); border-radius: 8px; }
.inbox-metrics span, .inbox-metrics strong { display: block; } .inbox-metrics strong { font-size: 22px; margin-top: 8px; }
@media (max-width: 680px) { .inbox-metrics { grid-template-columns: repeat(2, 1fr); } .inbox-filter { flex-wrap: wrap; } }
</style>
