<template>
  <div v-loading="loading" class="ai-proactive">
    <div class="zx-section-heading">
      <div>
        <h2>按群主动插话</h2>
        <p>群里没人叫 Bot 时按概率让 AI 决定是否插话，不合适时 AI 会选择不说。这里可为每个群设置冷却和每日预算，留空使用“聊天设置”中的全局值，0 为不限制。今日插话共用 {{ overview.used_tokens }} tokens。</p>
      </div>
      <div class="heading-actions">
        <el-input v-model="search" size="small" clearable placeholder="搜索群号或群名" class="search" />
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </div>
    </div>
    <el-table :data="filteredRows" size="small" row-key="group_id" empty-text="暂无群">
      <el-table-column label="群" min-width="160"><template #default="{ row }"><div>{{ row.group_name || "未命名" }}</div><small class="muted">{{ row.group_id }}<template v-if="!row.enabled"> · AI 已关闭</template></small></template></el-table-column>
      <el-table-column label="冷却（秒）" width="130"><template #default="{ row }"><el-input-number v-model="row.form.cooldown" size="mini" :min="0" :max="86400" :controls="false" placeholder="全局" /></template></el-table-column>
      <el-table-column label="本群日预算" width="130"><template #default="{ row }"><el-input-number v-model="row.form.daily_tokens" size="mini" :min="0" :controls="false" placeholder="不限" /></template></el-table-column>
      <el-table-column label="运行状态" min-width="240"><template #default="{ row }"><span v-if="!row.states.length" class="muted">本次运行以来该群还没有消息</span><div v-for="item in row.states" :key="item.bot_id"><small>Bot {{ item.bot_id }} · 今日 {{ item.used_tokens }} tokens<template v-if="item.last_proactive_at"> · 上次插话 {{ formatTime(item.last_proactive_at * 1000) }}</template><template v-if="item.cooldown_left"> · 冷却剩 {{ item.cooldown_left }} 秒</template></small></div></template></el-table-column>
      <el-table-column label="操作" width="80" fixed="right"><template #default="{ row }"><el-button type="text" size="mini" :loading="row.saving" @click="save(row)">保存</el-button></template></el-table-column>
    </el-table>

    <div class="zx-section-heading tasks-heading">
      <div>
        <h2>主动任务</h2>
        <p>按时执行任务说明并把结果发到指定的群或私聊，没有要说的会跳过。用户可以在对话中让 AI 创建（每人上限见“聊天设置”），以创建者身份运行、用量计入创建者；这里创建的任务以超级用户身份运行。</p>
      </div>
      <el-button size="small" type="primary" icon="el-icon-plus" @click="openTask()">新建任务</el-button>
    </div>
    <el-table :data="tasks" size="small" row-key="id" empty-text="暂无主动任务">
      <el-table-column label="任务" min-width="200"><template #default="{ row }"><div>#{{ row.id }} {{ row.name }}</div><small class="muted ellipsis">{{ row.prompt }}</small></template></el-table-column>
      <el-table-column label="触发" min-width="130"><template #default="{ row }">{{ row.trigger }}</template></el-table-column>
      <el-table-column label="发到" min-width="130"><template #default="{ row }"><div>{{ row.group_id ? `群 ${row.group_id}` : `私聊 ${row.user_id}` }}</div><small class="muted">Bot {{ row.bot_id }}</small></template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{ row }"><el-tag size="mini" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? "启用" : "暂停" }}</el-tag></template></el-table-column>
      <el-table-column label="最近执行" min-width="200"><template #default="{ row }"><template v-if="row.last_run"><el-tag size="mini" :type="runTypes[row.last_run.status]">{{ runNames[row.last_run.status] || row.last_run.status }}</el-tag> <small class="muted">{{ formatTime(row.last_run.at) }}</small><div class="ellipsis">{{ row.last_run.output }}</div></template><span v-else class="muted">尚未执行</span></template></el-table-column>
      <el-table-column label="操作" width="210" fixed="right"><template #default="{ row }">
        <el-button type="text" size="mini" @click="taskAction(row, 'run')">立即执行</el-button>
        <el-button type="text" size="mini" @click="taskAction(row, row.enabled ? 'pause' : 'resume')">{{ row.enabled ? "暂停" : "恢复" }}</el-button>
        <el-button type="text" size="mini" @click="openTask(row)">编辑</el-button>
        <el-button type="text" size="mini" class="danger" @click="removeTask(row)">删除</el-button>
      </template></el-table-column>
    </el-table>

    <el-dialog :title="taskForm.id ? `编辑任务 #${taskForm.id}` : '新建主动任务'" :visible.sync="taskForm.visible" width="560px" append-to-body>
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="taskForm.name" maxlength="64" placeholder="留空取任务说明开头" /></el-form-item>
        <el-form-item label="任务说明"><el-input v-model="taskForm.prompt" type="textarea" :rows="4" maxlength="4000" placeholder="写清楚要做什么、发什么，运行时看不到其它对话" /></el-form-item>
        <el-form-item label="触发方式">
          <el-radio-group v-model="taskForm.kind"><el-radio-button label="cron">cron</el-radio-button><el-radio-button label="interval">间隔</el-radio-button><el-radio-button label="date">一次</el-radio-button></el-radio-group>
          <el-input v-model="taskForm.value" :placeholder="valueHints[taskForm.kind]" class="value-input" />
        </el-form-item>
        <el-form-item label="发到">
          <el-select v-model="taskForm.bot_id" :disabled="!!taskForm.id" placeholder="Bot" class="bot-select"><el-option v-for="bot in bots" :key="bot" :label="bot" :value="bot" /></el-select>
          <el-radio-group v-model="taskForm.target" :disabled="!!taskForm.id"><el-radio label="group">群</el-radio><el-radio label="user">私聊</el-radio></el-radio-group>
          <el-input v-model="taskForm.target_id" :disabled="!!taskForm.id" :placeholder="taskForm.target === 'group' ? '群号' : 'QQ 号'" class="value-input" />
        </el-form-item>
      </el-form>
      <template #footer><el-button size="small" @click="taskForm.visible = false">取消</el-button><el-button size="small" type="primary" :loading="taskForm.saving" @click="saveTask">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }
const number = (value) => (value === undefined || value === null || value === "" ? null : value)

export default {
  name: "AIProactive",
  data() {
    return {
      loading: false, search: "", rows: [], tasks: [], bots: [], overview: { used_tokens: 0 },
      taskForm: { visible: false, saving: false, id: null, name: "", prompt: "", kind: "cron", value: "", bot_id: "", target: "group", target_id: "" },
      runNames: { ok: "已发送", silent: "无内容", error: "出错", stopped: "已停止" },
      runTypes: { ok: "success", silent: "info", error: "danger", stopped: "info" },
      valueHints: { cron: "分 时 日 月 周，如 0 8 * * *", interval: "间隔分钟，至少 10", date: "YYYY-MM-DD HH:MM" },
    }
  },
  computed: {
    filteredRows() {
      const keyword = this.search.trim()
      return keyword ? this.rows.filter((row) => row.group_id.includes(keyword) || (row.group_name || "").includes(keyword)) : this.rows
    },
  },
  mounted() { this.load() },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    formatTime(value) { return value ? new Date(value).toLocaleString() : "" },
    /**
     * 加载按群设置、运行状态与主动任务
     */
    async load() {
      this.loading = true
      try {
        const [groups, state, tasks] = await Promise.all([this.request("get", "/chat/groups"), this.request("get", "/chat/proactive"), this.request("get", "/chat/tasks")])
        this.overview = state.data
        this.rows = groups.data.map((item) => ({
          group_id: item.group_id, group_name: item.group_name, enabled: item.enabled, saving: false,
          form: { cooldown: (item.proactive || {}).cooldown ?? undefined, daily_tokens: (item.proactive || {}).daily_tokens ?? undefined },
          states: state.data.groups.filter((s) => s.group_id === item.group_id),
        }))
        this.tasks = tasks.data.tasks
        this.bots = tasks.data.bots
      } catch (error) { this.fail(error, "主动对话加载失败。") } finally { this.loading = false }
    },
    /**
     * 保存一个群的主动插话设置，全部为空时清除覆盖
     * @param {object} row 群
     */
    async save(row) {
      const payload = { cooldown: number(row.form.cooldown), daily_tokens: number(row.form.daily_tokens) }
      row.saving = true
      try { this.$message.success((await this.request("put", `/chat/groups/${encodeURIComponent(row.group_id)}/proactive`, payload)).info) }
      catch (error) { this.fail(error, "主动插话设置保存失败。") } finally { row.saving = false }
    },
    /**
     * 打开任务编辑框，不传任务时新建
     * @param {object} [task] 任务
     */
    openTask(task) {
      this.taskForm = task
        ? { visible: true, saving: false, id: task.id, name: task.name, prompt: task.prompt, kind: task.kind, value: task.value, bot_id: task.bot_id, target: task.group_id ? "group" : "user", target_id: task.group_id || task.user_id }
        : { visible: true, saving: false, id: null, name: "", prompt: "", kind: "cron", value: "", bot_id: this.bots[0] || "", target: "group", target_id: "" }
    },
    async saveTask() {
      const form = this.taskForm
      const payload = { name: form.name, prompt: form.prompt, kind: form.kind, value: form.value, bot_id: form.bot_id || null, group_id: form.target === "group" ? form.target_id : null, user_id: form.target === "user" ? form.target_id : null }
      form.saving = true
      try {
        const response = form.id ? await this.request("put", `/chat/tasks/${form.id}`, payload) : await this.request("post", "/chat/tasks", payload)
        this.$message.success(response.info)
        form.visible = false
        await this.load()
      } catch (error) { this.fail(error, "任务保存失败。") } finally { form.saving = false }
    },
    async taskAction(task, action) {
      try {
        this.$message.success((await this.request("post", `/chat/tasks/${task.id}/${action}`)).info || "已完成。")
        await this.load()
      } catch (error) { this.fail(error, "操作失败。") }
    },
    async removeTask(task) {
      try { await this.$confirm(`删除主动任务 #${task.id}？`, "删除任务", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/chat/tasks/${task.id}`)).info)
        await this.load()
      } catch (error) { this.fail(error, "删除失败。") }
    },
  },
}
</script>

<style scoped>
.heading-actions { display: flex; gap: 8px; align-items: center; }
.search { width: 180px; }
.el-input-number { width: 100px; }
.tasks-heading { margin-top: 24px; }
.value-input { width: 200px; margin-left: 8px; }
.bot-select { width: 130px; margin-right: 8px; }
.ellipsis { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
</style>
