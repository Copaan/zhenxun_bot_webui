<template>
  <section class="zx-panel ai-mcp">
    <div class="zx-section-heading">
      <div>
        <h2>MCP 服务</h2>
        <p>接入外部 MCP 服务，为超级用户的 Agent 对话提供更多工具，工具名为“前缀 + 工具名”。配置保存在 data/ai/mcp.json。</p>
      </div>
      <div class="heading-actions">
        <el-button size="small" @click="importVisible = true">导入 JSON</el-button>
        <el-button size="small" type="primary" icon="el-icon-plus" @click="edit(null)">添加服务</el-button>
      </div>
    </div>
    <el-table v-loading="loading" :data="servers" size="small" row-key="name" empty-text="还没有 MCP 服务">
      <el-table-column type="expand">
        <template #default="{ row }">
          <p v-if="!row.tools" class="muted">尚未连接，点击“测试”获取工具列表。</p>
          <p v-else-if="!row.tools.length" class="muted">该服务没有提供工具。</p>
          <div v-for="tool in row.tools || []" :key="tool.name" class="tool"><span class="mono">{{ tool.name }}</span><small class="muted">{{ tool.description }}</small></div>
        </template>
      </el-table-column>
      <el-table-column label="服务" min-width="170">
        <template #default="{ row }"><div>{{ row.name }}</div><small v-if="row.description" class="muted">{{ row.description }}</small></template>
      </el-table-column>
      <el-table-column label="类型" width="130"><template #default="{ row }"><el-tag size="mini" type="info">{{ row.transport }}</el-tag></template></el-table-column>
      <el-table-column label="命令 / 地址" min-width="240"><template #default="{ row }"><span class="mono ellipsis">{{ target(row) }}</span></template></el-table-column>
      <el-table-column label="工具" width="90"><template #default="{ row }">{{ row.tools ? `${row.tools.length} 个` : "未连接" }}</template></el-table-column>
      <el-table-column label="启用" width="80"><template #default="{ row }"><el-switch :value="row.enabled" :disabled="busy === `toggle-${row.name}`" @change="toggle(row, $event)" /></template></el-table-column>
      <el-table-column label="" width="230">
        <template #default="{ row }">
          <el-button size="mini" :loading="busy === `test-${row.name}`" @click="testRow(row)">测试</el-button>
          <el-button size="mini" @click="edit(row)">编辑</el-button>
          <el-button size="mini" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog :title="original ? `编辑 ${original}` : '添加 MCP 服务'" :visible.sync="editVisible" width="640px" append-to-body :close-on-click-modal="false">
      <el-form label-width="110px" size="small" @submit.native.prevent>
        <el-form-item label="服务名" required><el-input v-model="form.name" placeholder="字母、数字、下划线或短横线" maxlength="40" /><small class="muted">工具前缀 mcp_{{ form.name.replace(/[^a-zA-Z0-9]/g, "_") }}_</small></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" maxlength="500" /></el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.transport">
            <el-radio-button label="stdio">本地命令 stdio</el-radio-button>
            <el-radio-button label="streamable-http">Streamable HTTP</el-radio-button>
            <el-radio-button label="sse">SSE</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.transport === 'stdio'">
          <el-form-item label="启动命令" required><el-input v-model="form.command" placeholder="npx / uvx / python" /></el-form-item>
          <el-form-item label="参数"><el-input v-model="form.args" type="textarea" :rows="3" placeholder="每行一个参数，如&#10;-y&#10;@modelcontextprotocol/server-everything" /></el-form-item>
          <el-form-item label="环境变量"><el-input v-model="form.env" type="textarea" :rows="3" placeholder="每行一个 KEY=VALUE" /></el-form-item>
          <el-form-item label="工作目录"><el-input v-model="form.cwd" placeholder="可留空" /></el-form-item>
          <el-form-item label="安装命令"><el-input v-model="form.install_command" placeholder="首次启动前在工作目录执行，可留空" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="地址" required><el-input v-model="form.url" placeholder="https://example.com/mcp" /></el-form-item>
          <el-form-item label="请求头"><el-input v-model="form.headers" type="textarea" :rows="3" placeholder="每行一个 Name: Value，如 Authorization: Bearer xxx" /></el-form-item>
        </template>
        <div class="form-row">
          <el-form-item label="超时（秒）"><el-input-number v-model="form.timeout" :min="1" :max="600" /></el-form-item>
          <el-form-item label="所需群管等级"><el-input-number v-model="form.admin_level" :min="0" :max="9" /></el-form-item>
          <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
        </div>
      </el-form>
      <div v-if="testResult" class="test-result">
        <strong>{{ testResult.error ? "连接失败" : `连接成功，${testResult.tools.length} 个工具` }}</strong>
        <div v-if="testResult.error" class="danger wrap">{{ testResult.error }}</div>
        <div v-for="tool in testResult.tools || []" :key="tool.name" class="tool"><span class="mono">{{ tool.name }}</span><small class="muted">{{ tool.description }}</small></div>
      </div>
      <span slot="footer">
        <el-button size="small" :loading="busy === 'test-form'" @click="testForm">测试连接</el-button>
        <el-button size="small" @click="editVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="busy === 'save'" @click="save">保存</el-button>
      </span>
    </el-dialog>

    <el-dialog title="导入 MCP 服务" :visible.sync="importVisible" width="600px" append-to-body>
      <p class="muted">粘贴其他客户端的配置，格式为 {"mcpServers": {"服务名": {...}}}；同名服务会被覆盖。</p>
      <el-input v-model="importText" type="textarea" :rows="12" class="mono" placeholder='{"mcpServers": {"fetch": {"command": "uvx", "args": ["mcp-server-fetch"]}}}' />
      <span slot="footer">
        <el-button size="small" @click="importVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="busy === 'import'" :disabled="!importText.trim()" @click="importServers">导入</el-button>
      </span>
    </el-dialog>
  </section>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }
const EMPTY = { name: "", description: "", transport: "stdio", command: "", args: "", env: "", cwd: "", install_command: "", url: "", headers: "", timeout: 30, admin_level: 0, enabled: true }

/**
 * 把每行一个 KEY=VALUE（或 Name: Value）的文本解析为对象
 * @param {string} text 文本
 * @param {string} separator 分隔符
 * @returns {object|null} 键值对，没有内容时为 null
 */
function parsePairs(text, separator) {
  const result = {}
  for (const line of text.split("\n")) {
    const index = line.indexOf(separator)
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return Object.keys(result).length ? result : null
}

/**
 * 把键值对格式化为每行一项的文本
 * @param {object|null} pairs 键值对
 * @param {string} separator 分隔符
 * @returns {string} 文本
 */
function formatPairs(pairs, separator) {
  return Object.entries(pairs || {}).map(([key, value]) => `${key}${separator}${value}`).join("\n")
}

export default {
  name: "AIMcp",
  data() {
    return { servers: [], loading: false, busy: "", editVisible: false, importVisible: false, importText: "", original: null, form: { ...EMPTY }, testResult: null }
  },
  mounted() { this.load() },
  methods: {
    async request(method, url, data, config = {}) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, { ...QUIET, ...config })
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    target(row) { return row.transport === "stdio" ? [row.command, ...(row.args || [])].join(" ") : row.url },
    /**
     * 更新服务列表，并通知父页面刷新 Agent 状态
     * @param {object} data 接口返回的 {servers}
     */
    apply(data) {
      this.servers = data.servers
      this.$emit("changed")
    },
    async load() {
      this.loading = true
      try { this.servers = (await this.request("get", "/mcp/servers")).data.servers } catch (error) { this.fail(error, "MCP 服务加载失败。") } finally { this.loading = false }
    },
    edit(row) {
      this.original = row ? row.name : null
      this.testResult = row && row.tools ? { tools: row.tools } : null
      this.form = row
        ? { ...EMPTY, ...row, description: row.description || "", command: row.command || "", args: (row.args || []).join("\n"), env: formatPairs(row.env, "="), cwd: row.cwd || "", install_command: row.install_command || "", url: row.url || "", headers: formatPairs(row.headers, ": ") }
        : { ...EMPTY }
      this.editVisible = true
    },
    /**
     * 表单转为接口的服务配置
     * @returns {object} 服务配置
     */
    payload() {
      const f = this.form
      const blank = (value) => (value && value.trim() ? value.trim() : null)
      return {
        transport: f.transport, description: blank(f.description), timeout: f.timeout, admin_level: f.admin_level, enabled: f.enabled,
        command: blank(f.command), args: f.args.split("\n").map((s) => s.trim()).filter(Boolean), env: parsePairs(f.env, "="), cwd: blank(f.cwd), install_command: blank(f.install_command),
        url: blank(f.url), headers: parsePairs(f.headers, ":"),
      }
    },
    async save() {
      const name = this.form.name.trim()
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) { this.$message.warning("服务名只能包含字母、数字、下划线和短横线。"); return }
      this.busy = "save"
      try {
        const response = await this.request("put", `/mcp/servers/${name}`, { ...this.payload(), original: this.original })
        this.$message.success(response.info)
        this.apply(response.data)
        this.editVisible = false
      } catch (error) { this.fail(error, "保存失败。") } finally { this.busy = "" }
    },
    async test(name, config, busy) {
      this.busy = busy
      try {
        const response = await this.request("post", "/mcp/test", { name, config }, { timeout: 0 })
        this.$message.success(response.info)
        this.apply(response.data)
        return { tools: response.data.tools }
      } catch (error) { return { error: apiErrorDetail(error, "连接失败。") } } finally { this.busy = "" }
    },
    async testForm() {
      const name = this.form.name.trim()
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) { this.$message.warning("请先填写服务名。"); return }
      this.testResult = await this.test(name, this.payload(), "test-form")
    },
    async testRow(row) {
      const { name, tools, prefix, ...config } = row
      const result = await this.test(name, config, `test-${name}`)
      if (result.error) this.$message.error(result.error)
    },
    async toggle(row, enabled) {
      this.busy = `toggle-${row.name}`
      try {
        const response = await this.request("post", `/mcp/servers/${row.name}/toggle`, { enabled })
        this.$message.success(response.info)
        this.apply(response.data)
      } catch (error) { this.fail(error, "切换失败。") } finally { this.busy = "" }
    },
    async remove(row) {
      try { await this.$confirm(`删除 MCP 服务 ${row.name}？`, "删除服务", { type: "warning" }) } catch (error) { return }
      try {
        const response = await this.request("delete", `/mcp/servers/${row.name}`)
        this.$message.success(response.info)
        this.apply(response.data)
      } catch (error) { this.fail(error, "删除失败。") }
    },
    async importServers() {
      this.busy = "import"
      try {
        const response = await this.request("post", "/mcp/import", { text: this.importText })
        this.$message.success(response.info)
        this.apply(response.data)
        this.importVisible = false
        this.importText = ""
      } catch (error) { this.fail(error, "导入失败。") } finally { this.busy = "" }
    },
  },
}
</script>

<style scoped>
.heading-actions { display: flex; gap: 8px; }
.tool { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; }
.form-row { display: flex; flex-wrap: wrap; gap: 0 16px; }
.test-result { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; padding: 10px; border-radius: 6px; background: var(--bg-color-hover); }
.mono { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; }
.ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
</style>
